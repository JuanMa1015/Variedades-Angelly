"""Ventas del vendedor: lineas repetidas, dinero recibido, detalle de una venta y eliminar productos."""

from __future__ import annotations

from sqlalchemy import select

from src.infrastructure.database.models import AuditoriaModel, ProductoModel, VentaModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(client, usuario: str = "vendedor") -> dict[str, str]:
    credenciales = {
        "vendedor": ("vendedor1", "ventas123"),
        "admin": ("angelly_admin", "cambiame123"),
        "super": ("angelly_superadmin", "supersecure123"),
    }[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def _producto(sf, nombre="Arroz", stock=10, precio=1000.0, catalogo="tienda") -> int:
    with sf() as db:
        producto = ProductoModel(nombre=nombre, precio_costo=500, precio_venta=precio, stock_actual=stock, stock_minimo=1, catalogo=catalogo)
        db.add(producto)
        db.commit()
        return producto.id


def _stock(sf, producto_id: int) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto_id).stock_actual


def _vender(client, items, **extra):
    cuerpo = {"items": items, "es_fiado": False, "metodo_pago": "efectivo", **extra}
    return client.post("/api/ventas", headers=_h(client), json=cuerpo)


# -- Lineas repetidas --


def test_las_lineas_repetidas_de_un_producto_se_juntan_en_una(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, stock=10)

    respuesta = _vender(client, [{"producto_id": arroz, "cantidad": 2}, {"producto_id": arroz, "cantidad": 3}])

    assert respuesta.status_code == 201, respuesta.text
    detalles = respuesta.json()["detalles"]
    assert [(d["producto_id"], d["cantidad"], d["subtotal"]) for d in detalles] == [(arroz, 5, 5000.0)]
    assert respuesta.json()["total"] == 5000.0
    assert _stock(sf, arroz) == 5


def test_el_stock_se_valida_con_la_suma_de_las_lineas_repetidas(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, stock=4)

    respuesta = _vender(client, [{"producto_id": arroz, "cantidad": 3}, {"producto_id": arroz, "cantidad": 3}])

    assert respuesta.status_code == 400 and "Stock insuficiente" in respuesta.json()["detail"]
    assert _stock(sf, arroz) == 4  # no se descuenta nada


def test_con_varios_productos_se_descuenta_cada_uno(auth_client) -> None:
    client, sf = auth_client
    b = _producto(sf, "B", stock=5)
    a = _producto(sf, "A", stock=5)

    respuesta = _vender(client, [{"producto_id": b, "cantidad": 1}, {"producto_id": a, "cantidad": 2}])

    assert respuesta.status_code == 201
    assert sorted((d["producto_id"], d["cantidad"]) for d in respuesta.json()["detalles"]) == sorted([(a, 2), (b, 1)])
    assert (_stock(sf, a), _stock(sf, b)) == (3, 4)


# -- Dinero recibido --


def test_el_efectivo_recibido_debe_cubrir_el_total(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, stock=10, precio=1000.0)

    corto = _vender(client, [{"producto_id": arroz, "cantidad": 3}], monto_recibido=2000)
    exacto = _vender(client, [{"producto_id": arroz, "cantidad": 3}], monto_recibido=3000)
    con_cambio = _vender(client, [{"producto_id": arroz, "cantidad": 1}], monto_recibido=5000)
    sin_dato = _vender(client, [{"producto_id": arroz, "cantidad": 1}])

    assert corto.status_code == 400 and "no cubre" in corto.json()["detail"]
    assert exacto.status_code == 201 and con_cambio.status_code == 201 and sin_dato.status_code == 201
    assert _stock(sf, arroz) == 10 - 3 - 1 - 1  # la venta rechazada no descontó nada


def test_el_efectivo_recibido_de_un_fiado_debe_cubrir_el_abono(auth_client) -> None:
    client, sf = auth_client
    from src.infrastructure.database.models import ClienteFiadoTiendaModel

    arroz = _producto(sf, stock=10, precio=1000.0)
    with sf() as db:
        cliente = ClienteFiadoTiendaModel(nombre="Marta", telefono_whatsapp="3001112233", deuda_total=0)
        db.add(cliente)
        db.commit()
        cliente_id = cliente.id
    base = {"es_fiado": True, "fiado_origen": "tienda", "cliente_tienda_id": cliente_id, "abono_inicial": 1000}

    corto = _vender(client, [{"producto_id": arroz, "cantidad": 3}], monto_recibido=500, **base)
    bien = _vender(client, [{"producto_id": arroz, "cantidad": 3}], monto_recibido=1000, **base)

    assert corto.status_code == 400
    assert bien.status_code == 201 and bien.json()["saldo_pendiente"] == 2000.0


def test_con_transferencia_el_monto_recibido_no_se_compara(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, stock=10, precio=1000.0)

    respuesta = _vender(client, [{"producto_id": arroz, "cantidad": 3}], metodo_pago="transferencia", monto_recibido=0)

    assert respuesta.status_code == 201


# -- Detalle de una venta --


def test_el_detalle_de_una_venta_trae_productos_y_quien_la_hizo(auth_client) -> None:
    client, sf = auth_client
    arroz, sal = _producto(sf, "Arroz", precio=1000.0), _producto(sf, "Sal", precio=500.0)
    venta_id = _vender(client, [{"producto_id": arroz, "cantidad": 2}, {"producto_id": sal, "cantidad": 1}], monto_recibido=5000).json()["venta_id"]

    respuesta = client.get(f"/api/ventas/{venta_id}", headers=_h(client))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["venta_id"] == venta_id and cuerpo["total"] == 2500.0 and cuerpo["vendedor"] == "vendedor1"
    assert sorted((d["nombre_producto"], d["cantidad"], d["precio_unitario"]) for d in cuerpo["detalles"]) == [("Arroz", 2, 1000.0), ("Sal", 1, 500.0)]
    assert cuerpo["metodo_pago"] == "efectivo" and cuerpo["monto_recibido"] == 5000.0 and cuerpo["anulada"] is False


def test_el_detalle_respeta_el_rol_y_la_existencia(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        cartera = VentaModel(creado_por="admin1", total=900, saldo_pendiente=0, es_fiado=False, fuera_de_caja=True)
        db.add(cartera)
        db.commit()
        cartera_id = cartera.id
    arroz = _producto(sf)
    propia = _vender(client, [{"producto_id": arroz, "cantidad": 1}]).json()["venta_id"]

    assert client.get(f"/api/ventas/{cartera_id}", headers=_h(client)).status_code == 404  # una venta de cartera no es del vendedor
    assert client.get(f"/api/ventas/{cartera_id}", headers=_h(client, "super")).status_code == 200
    assert client.get("/api/ventas/999999", headers=_h(client)).status_code == 404
    assert client.get(f"/api/ventas/{propia}", headers=_h(client, "admin")).status_code == 403


# -- Eliminar productos --


def test_el_vendedor_elimina_un_producto_de_la_tienda_y_queda_registrado(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, "Arroz viejo", stock=3)
    venta = _vender(client, [{"producto_id": arroz, "cantidad": 1}]).json()["venta_id"]

    borrado = client.delete(f"/api/productos/{arroz}", headers=_h(client))

    assert borrado.status_code == 204
    with sf() as db:
        assert db.get(ProductoModel, arroz).activo is False  # no se borra: se desactiva y su historial se conserva
        detalle = db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.modulo == "productos", AuditoriaModel.accion == "desactivar")).scalar_one()
        assert "Arroz viejo" in detalle
    assert [p["nombre"] for p in client.get("/api/productos", headers=_h(client)).json()] == []
    assert _vender(client, [{"producto_id": arroz, "cantidad": 1}]).status_code in (400, 404, 409)  # ya no se puede vender
    assert client.get(f"/api/ventas/{venta}", headers=_h(client)).json()["detalles"][0]["nombre_producto"] == "Arroz viejo"


def test_el_vendedor_no_elimina_productos_de_cartera_ni_inexistentes(auth_client) -> None:
    client, sf = auth_client
    bolso = _producto(sf, "Bolso", catalogo="cartera")

    assert client.delete(f"/api/productos/{bolso}", headers=_h(client)).status_code == 403
    assert client.delete("/api/productos/999999", headers=_h(client)).status_code == 404
    with sf() as db:
        assert db.get(ProductoModel, bolso).activo is True
