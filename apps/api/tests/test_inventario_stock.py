"""Inventario: ajustes de stock con motivo, historial de movimientos, resumen, filtros y edicion segura."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.api.services.stock import mover_stock
from src.infrastructure.database.models import (
    AuditoriaModel,
    MovimientoStockModel,
    ProductoModel,
    ProveedorModel,
)
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _admin(client) -> str:
    return _login_token(client, "angelly_admin", "cambiame123")


def _producto(sf, nombre="Arroz", stock=10, minimo=3, precio_costo=500.0, precio_venta=1000.0, activo=True, proveedor_id=None, imagen=None) -> int:
    with sf() as db:
        p = ProductoModel(
            nombre=nombre, precio_costo=precio_costo, precio_venta=precio_venta, stock_actual=stock, stock_minimo=minimo,
            activo=activo, proveedor_id=proveedor_id, imagen_url=imagen, codigo_barras=f"77{abs(hash(nombre)) % 10**8:08d}",
        )
        db.add(p)
        db.commit()
        return p.id


def _proveedor(sf, nombre="Bimbo Real") -> int:
    with sf() as db:
        prov = ProveedorModel(nombre=nombre, contacto="x", telefono="3000000000")
        db.add(prov)
        db.commit()
        return prov.id


def _stock(sf, producto_id: int) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto_id).stock_actual


def _movimientos(sf, producto_id: int) -> list[MovimientoStockModel]:
    with sf() as db:
        return list(db.execute(
            select(MovimientoStockModel).where(MovimientoStockModel.producto_id == producto_id).order_by(MovimientoStockModel.id),
        ).scalars())


def _ajustar(client, token, producto, **cuerpo):
    return client.post(f"/api/productos/{producto}/ajustes-stock", headers=_h(token), json=cuerpo)


# -- Ajustes con motivo --


def test_sumar_stock_con_motivo_deja_movimiento_y_auditoria(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=10)

    r = _ajustar(client, _vendedor(client), producto, modo="sumar", cantidad=5, motivo="ingreso_sin_factura")

    assert r.status_code == 200
    assert r.json()["producto"]["stock_actual"] == 15
    mov = r.json()["movimiento"]
    assert mov["delta"] == 5 and mov["stock_resultante"] == 15 and mov["usuario"] == "vendedor1" and mov["tipo"] == "ajuste"
    assert "Ingreso sin factura" in mov["motivo"]
    with sf() as db:
        detalle = db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.accion == "ajuste_stock")).scalar_one()
    assert "10 -> 15" in detalle and "+5" in detalle


def test_restar_por_merma_y_no_deja_pasar_de_cero(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=4)
    token = _vendedor(client)

    ok = _ajustar(client, token, producto, modo="restar", cantidad=3, motivo="merma")
    demasiado = _ajustar(client, token, producto, modo="restar", cantidad=5, motivo="dano")

    assert ok.status_code == 200 and _stock(sf, producto) == 1
    assert demasiado.status_code == 400 and "no puede quedar negativo" in demasiado.json()["detail"]
    assert _stock(sf, producto) == 1


def test_contar_calcula_la_diferencia_sobre_el_stock_de_ese_momento(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=12)
    token = _vendedor(client)
    # Mientras se contaba se vendieron 2: el conteo (10 reales en el estante) no pisa esa venta.
    with sf() as db:
        mover_stock(db, db.get(ProductoModel, producto), -2, tipo="venta", usuario="vendedor1")
        db.commit()

    r = _ajustar(client, token, producto, modo="contar", cantidad=7, motivo="conteo")

    assert r.status_code == 200
    assert r.json()["movimiento"]["delta"] == -3 and _stock(sf, producto) == 7


def test_un_conteo_que_coincide_no_ajusta_nada(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=8)

    r = _ajustar(client, _vendedor(client), producto, modo="contar", cantidad=8, motivo="conteo")

    assert r.status_code == 400 and "nada que ajustar" in r.json()["detail"]
    assert _movimientos(sf, producto) == []


def test_contar_a_cero_es_valido(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=3)

    r = _ajustar(client, _vendedor(client), producto, modo="contar", cantidad=0, motivo="conteo")

    assert r.status_code == 200 and _stock(sf, producto) == 0


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"modo": "sumar", "cantidad": 0, "motivo": "correccion"},                 # sumar 0 unidades
        {"modo": "sumar", "cantidad": 2, "motivo": "merma"},                      # una merma no suma
        {"modo": "restar", "cantidad": 2, "motivo": "ingreso_sin_factura"},       # un ingreso no resta
        {"modo": "contar", "cantidad": 2, "motivo": "dano"},                      # contar solo es conteo
        {"modo": "sumar", "cantidad": 2, "motivo": "otro"},                       # "otro" sin explicar
        {"modo": "sumar", "cantidad": 2, "motivo": "otro", "nota": "ok"},          # nota demasiado corta
        {"modo": "sumar", "cantidad": 2},                                         # sin motivo
        {"modo": "sumar", "cantidad": -2, "motivo": "correccion"},                # negativo
        {"modo": "regalar", "cantidad": 2, "motivo": "correccion"},               # modo inventado
    ],
)
def test_ajustes_invalidos_se_rechazan_y_no_tocan_el_stock(auth_client, cuerpo) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=10)

    r = _ajustar(client, _vendedor(client), producto, **cuerpo)

    assert r.status_code == 422
    assert _stock(sf, producto) == 10 and _movimientos(sf, producto) == []


def test_motivo_otro_con_nota_se_guarda_completo(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=10)

    r = _ajustar(client, _vendedor(client), producto, modo="restar", cantidad=1, motivo="otro", nota="Se cayo del estante")

    assert r.status_code == 200 and "Se cayo del estante" in r.json()["movimiento"]["motivo"]


def test_ajustar_un_producto_inexistente_o_sin_sesion(auth_client) -> None:
    client, _ = auth_client

    assert _ajustar(client, _vendedor(client), 999, modo="sumar", cantidad=1, motivo="correccion").status_code == 404
    client.cookies.clear()
    assert client.post("/api/productos/1/ajustes-stock", json={"modo": "sumar", "cantidad": 1, "motivo": "correccion"}).status_code == 401


# -- Historial --


def test_el_historial_junta_ventas_compras_anulaciones_y_ajustes(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=10)
    admin = _admin(client)
    venta = client.post("/api/ventas", headers=_h(admin), json={
        "items": [{"producto_id": producto, "cantidad": 3}], "es_fiado": False, "metodo_pago": "efectivo",
    }).json()["venta_id"]
    _ajustar(client, admin, producto, modo="restar", cantidad=1, motivo="merma")
    client.post(f"/api/ventas/{venta}/anular", headers=_h(admin), json={"motivo": "Error al digitar"})

    pagina = client.get(f"/api/productos/{producto}/movimientos-stock", headers=_h(admin)).json()

    tipos = [m["tipo"] for m in pagina["data"]]  # del mas reciente al mas antiguo
    assert tipos == ["anulacion_venta", "ajuste", "venta"]
    deltas = [m["delta"] for m in pagina["data"]]
    assert deltas == [3, -1, -3] and pagina["data"][0]["stock_resultante"] == 9
    venta_mov = pagina["data"][2]
    assert venta_mov["referencia_tipo"] == "venta" and venta_mov["referencia_id"] == venta
    assert pagina["page"]["total"] == 3


def test_el_historial_pagina_y_valida_el_producto(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=0)
    token = _vendedor(client)
    for _ in range(5):
        _ajustar(client, token, producto, modo="sumar", cantidad=1, motivo="correccion")

    pagina = client.get(f"/api/productos/{producto}/movimientos-stock", headers=_h(token), params={"limit": 2, "page": 3}).json()

    assert pagina["page"]["total"] == 5 and pagina["page"]["total_pages"] == 3 and len(pagina["data"]) == 1
    assert client.get("/api/productos/999/movimientos-stock", headers=_h(token)).status_code == 404


def test_las_facturas_de_compra_dejan_su_movimiento(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=5)
    proveedor = _proveedor(sf)
    admin = _admin(client)

    factura = client.post("/api/facturas-compra", headers=_h(admin), json={
        "proveedor_id": proveedor, "porcentaje_ganancia": 0.7,
        "items": [{"producto_id": producto, "cantidad": 4, "precio_unitario": 1000, "aplica_iva": False}],
    })
    assert factura.status_code == 201
    factura_id = factura.json()["id"]
    assert client.delete(f"/api/facturas-compra/{factura_id}", headers=_h(admin)).status_code == 204

    movs = _movimientos(sf, producto)
    assert [(m.tipo, m.delta) for m in movs] == [("factura_compra", 4), ("eliminacion_factura", -4)]
    assert all(m.referencia_tipo == "factura" and m.referencia_id == factura_id for m in movs)


def test_borrar_una_venta_deja_el_movimiento_de_devolucion(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=10)
    admin = _admin(client)
    venta = client.post("/api/ventas", headers=_h(admin), json={
        "items": [{"producto_id": producto, "cantidad": 2}], "es_fiado": False, "metodo_pago": "efectivo",
    }).json()["venta_id"]

    client.delete(f"/api/ventas/{venta}", headers=_h(admin))

    assert [(m.tipo, m.delta) for m in _movimientos(sf, producto)] == [("venta", -2), ("eliminacion_venta", 2)]


def test_el_producto_nuevo_con_stock_deja_su_stock_inicial(auth_client) -> None:
    client, sf = auth_client

    r = client.post("/api/productos", headers=_h(_vendedor(client)), json={
        "nombre": "Aceite Nuevo", "precio_costo": 3000, "precio_venta": 4500, "stock_actual": 12, "stock_minimo": 3,
    })

    assert r.status_code == 201
    movs = _movimientos(sf, r.json()["id"])
    assert [(m.tipo, m.delta, m.stock_resultante, m.usuario) for m in movs] == [("stock_inicial", 12, 12, "vendedor1")]


# -- Editar sin pisar el stock --


def test_editar_no_toca_el_stock_aunque_lo_manden(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=12)
    with sf() as db:  # se vendieron 2 mientras el vendedor tenia abierto el cuadro de edicion
        mover_stock(db, db.get(ProductoModel, producto), -2, tipo="venta", usuario="vendedor1")
        db.commit()

    r = client.patch(f"/api/productos/{producto}", headers=_h(_vendedor(client)), json={"precio_venta": 1500, "stock_actual": 12})

    assert r.status_code == 200 and r.json()["precio_venta"] == 1500
    assert _stock(sf, producto) == 10  # la venta no se pierde


def test_editar_solo_cambia_lo_enviado(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, nombre="Arroz", minimo=4)

    r = client.patch(f"/api/productos/{producto}", headers=_h(_vendedor(client)), json={"precio_costo": 700})

    body = r.json()
    assert body["precio_costo"] == 700 and body["precio_venta"] == 1000 and body["stock_minimo"] == 4 and body["nombre"] == "Arroz"


def test_se_puede_quitar_el_proveedor_y_la_imagen(auth_client) -> None:
    client, sf = auth_client
    proveedor = _proveedor(sf)
    producto = _producto(sf, proveedor_id=proveedor, imagen="https://x.public.blob.vercel-storage.com/a.jpg")
    token = _vendedor(client)

    sin_cambios = client.patch(f"/api/productos/{producto}", headers=_h(token), json={"precio_venta": 1100}).json()
    quitados = client.patch(f"/api/productos/{producto}", headers=_h(token), json={"proveedor_id": None, "imagen_url": None}).json()

    assert sin_cambios["proveedor_id"] == proveedor and sin_cambios["imagen_url"]
    assert quitados["proveedor_id"] is None and quitados["proveedor_nombre"] is None and quitados["imagen_url"] is None


def test_editar_deja_auditoria_de_lo_que_cambio(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, precio_costo=500.0, precio_venta=1000.0)

    client.patch(f"/api/productos/{producto}", headers=_h(_vendedor(client)), json={"precio_costo": 700, "precio_venta": 1000, "nombre": "Arroz Diana"})

    with sf() as db:
        detalle = db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.accion == "editar")).scalar_one()
    assert "precio_costo: 500.0 -> 700" in detalle and "nombre: Arroz -> Arroz Diana" in detalle
    assert "precio_venta" not in detalle  # no cambio


def test_editar_sin_cambios_no_deja_rastro_falso(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, precio_venta=1000.0)

    client.patch(f"/api/productos/{producto}", headers=_h(_vendedor(client)), json={"precio_venta": 1000})

    with sf() as db:
        assert db.execute(select(AuditoriaModel).where(AuditoriaModel.accion == "editar")).first() is None


# -- Precios y nombres --


@pytest.mark.parametrize("precio", [0, -5])
def test_el_precio_de_venta_debe_ser_mayor_a_cero(auth_client, precio) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    token = _vendedor(client)

    crear = client.post("/api/productos", headers=_h(token), json={"nombre": "Gratis", "precio_costo": 100, "precio_venta": precio})
    editar = client.patch(f"/api/productos/{producto}", headers=_h(token), json={"precio_venta": precio})
    inline = client.patch(f"/api/productos/{producto}/precio_venta", headers=_h(token), json={"precio_venta": precio})

    assert (crear.status_code, editar.status_code, inline.status_code) == (422, 422, 422)


def test_los_nombres_se_comparan_sin_importar_mayusculas(auth_client) -> None:
    client, sf = auth_client
    _producto(sf, nombre="Arroz Diana")
    otro = _producto(sf, nombre="Aceite")
    token = _vendedor(client)

    crear = client.post("/api/productos", headers=_h(token), json={"nombre": "arroz DIANA", "precio_costo": 1, "precio_venta": 2})
    renombrar = client.patch(f"/api/productos/{otro}", headers=_h(token), json={"nombre": "ARROZ diana"})
    mismo = client.patch(f"/api/productos/{otro}", headers=_h(token), json={"nombre": "ACEITE"})

    assert crear.status_code == 409 and renombrar.status_code == 409
    assert mismo.status_code == 200  # cambiar solo las mayusculas de su propio nombre es valido


# -- Lista: busqueda, filtros y resumen --


def _catalogo(sf) -> None:
    prov = _proveedor(sf, "Bimbo Real")
    _producto(sf, "Agua Pool", stock=0, minimo=3, precio_venta=800.0)
    _producto(sf, "Alkalina AAA", stock=2, minimo=5, precio_venta=6200.0, proveedor_id=prov)
    _producto(sf, "Arroz Diana", stock=20, minimo=5, precio_venta=3500.0)
    _producto(sf, "Zumo Hit", stock=1, minimo=3, precio_venta=3900.0)
    _producto(sf, "Zapallo", stock=0, minimo=0, precio_venta=1500.0)
    _producto(sf, "Inactivo", stock=0, minimo=0, activo=False)


def _lista(client, token, **params):
    r = client.get("/api/productos/paginados", headers=_h(token), params={"catalogo": "tienda", **params})
    assert r.status_code == 200, r.text
    return r.json()


def test_filtros_de_stock(auth_client) -> None:
    client, sf = auth_client
    _catalogo(sf)
    token = _vendedor(client)

    nombres = lambda **p: [x["nombre"] for x in _lista(client, token, **p)["data"]]  # noqa: E731

    assert nombres(estado="agotado") == ["Agua Pool", "Zapallo"]
    assert nombres(estado="bajo") == ["Alkalina AAA", "Zumo Hit"]
    assert nombres(estado="ok") == ["Arroz Diana"]
    assert len(nombres()) == 5  # sin el inactivo


def test_busqueda_por_nombre_codigo_y_proveedor_llega_a_todo_el_catalogo(auth_client) -> None:
    client, sf = auth_client
    _catalogo(sf)
    token = _vendedor(client)

    assert [x["nombre"] for x in _lista(client, token, q="zumo")["data"]] == ["Zumo Hit"]
    assert [x["nombre"] for x in _lista(client, token, q="bimbo")["data"]] == ["Alkalina AAA"]
    codigo = next(x["codigo_barras"] for x in _lista(client, token)["data"] if x["nombre"] == "Zapallo")
    assert [x["nombre"] for x in _lista(client, token, q=codigo)["data"]] == ["Zapallo"]


def test_filtro_por_proveedor_y_ordenes(auth_client) -> None:
    client, sf = auth_client
    _catalogo(sf)
    token = _vendedor(client)
    prov = _lista(client, token, q="alkalina")["data"][0]["proveedor_id"]

    assert [x["nombre"] for x in _lista(client, token, proveedor_id=prov)["data"]] == ["Alkalina AAA"]
    assert [x["nombre"] for x in _lista(client, token, orden="stock")["data"]][:2] == ["Agua Pool", "Zapallo"]
    assert [x["nombre"] for x in _lista(client, token, orden="precio")["data"]][:2] == ["Alkalina AAA", "Zumo Hit"]


def test_paginacion_del_servidor_con_mas_de_200_productos(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        db.add_all([ProductoModel(nombre=f"Producto {i:03d}", precio_costo=1.0, precio_venta=2.0, stock_actual=5, stock_minimo=1) for i in range(229)])
        db.commit()
    token = _vendedor(client)

    ultima = _lista(client, token, page=2, limit=200)

    assert ultima["page"]["total"] == 229 and ultima["page"]["total_pages"] == 2 and len(ultima["data"]) == 29
    assert [x["nombre"] for x in _lista(client, token, q="Producto 228")["data"]] == ["Producto 228"]


def test_ver_solo_los_desactivados(auth_client) -> None:
    client, sf = auth_client
    _catalogo(sf)

    solo = _lista(client, _admin(client), solo_inactivos=True)

    assert [x["nombre"] for x in solo["data"]] == ["Inactivo"] and solo["data"][0]["activo"] is False


def test_el_resumen_cuenta_todo_el_catalogo_y_ordena_lo_urgente(auth_client) -> None:
    client, sf = auth_client
    _catalogo(sf)

    r = client.get("/api/productos/resumen", headers=_h(_vendedor(client)), params={"catalogo": "tienda"}).json()

    assert r["total"] == 5 and r["stock_total"] == 23
    assert r["agotados"] == 2 and r["bajo_stock"] == 2
    # Lo mas urgente primero: los agotados, luego lo que queda poco.
    assert [(u["nombre"], u["stock_actual"]) for u in r["urgentes"]] == [("Agua Pool", 0), ("Zapallo", 0), ("Zumo Hit", 1), ("Alkalina AAA", 2)]


def test_el_resumen_de_un_catalogo_vacio(auth_client) -> None:
    client, _ = auth_client

    r = client.get("/api/productos/resumen", headers=_h(_vendedor(client))).json()

    assert r == {"total": 0, "stock_total": 0, "agotados": 0, "bajo_stock": 0, "urgentes": []}


def test_el_stock_rapido_por_delta_tambien_queda_en_el_historial(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=5)

    r = client.patch(f"/api/productos/{producto}/stock", headers=_h(_vendedor(client)), json={"delta": 3})

    assert r.status_code == 200 and r.json()["stock_actual"] == 8
    assert [(m.tipo, m.delta, m.motivo) for m in _movimientos(sf, producto)] == [("ajuste", 3, "Ajuste rapido")]
