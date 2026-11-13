"""Facturas de compra: medio de pago y caja, anulacion autorizada, duplicados y reglas de precio."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from src.api.services import anulacion
from src.infrastructure.database.models import AuditoriaModel, CierreCajaModel, FacturaCompraModel, PedidoProveedorModel, ProductoModel, ProveedorModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


@pytest.fixture(autouse=True)
def _sin_intentos_previos():
    anulacion.reiniciar_intentos()
    yield
    anulacion.reiniciar_intentos()


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _admin(client) -> str:
    return _login_token(client, "angelly_superadmin", "supersecure123")


def _proveedor(sf, nombre="Distribuidora") -> int:
    with sf() as db:
        proveedor = ProveedorModel(nombre=nombre)
        db.add(proveedor)
        db.commit()
        return proveedor.id


def _producto(sf, nombre="Arroz", costo=1000.0, venta=1500.0, stock=10, activo=True) -> int:
    with sf() as db:
        producto = ProductoModel(nombre=nombre, precio_costo=costo, precio_venta=venta, stock_actual=stock, stock_minimo=1, activo=activo)
        db.add(producto)
        db.commit()
        return producto.id


def _stock(sf, producto_id: int) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto_id).stock_actual


def _factura(client, token, proveedor, producto, cantidad=5, precio=1000, **extra):
    cuerpo = {
        "proveedor_id": proveedor,
        "items": [{"producto_id": producto, "cantidad": cantidad, "precio_unitario": precio}],
        **extra,
    }
    return client.post("/api/facturas-compra", headers=_h(token), json=cuerpo)


def _anular(client, token, factura_id, **extra):
    return client.post(f"/api/facturas-compra/{factura_id}/anular", headers=_h(token), json={"motivo": "Error al digitar", **extra})


def _efectivo_esperado(client) -> float:
    return client.get("/api/caja", headers=_h(_admin(client))).json()[0]["saldo_esperado"]


def _cerrar_caja(sf) -> None:
    with sf() as db:
        for caja in db.execute(select(CierreCajaModel)).scalars():
            db.delete(caja)
        db.commit()


def _cerrar_turno_y_abrir_otro(sf, caja_id: int) -> None:
    with sf() as db:
        caja = db.get(CierreCajaModel, caja_id)
        caja.estado = "cerrada"
        caja.fecha_cierre = caja.fecha_apertura.replace(year=2021)
        db.add(CierreCajaModel(
            usuario="angelly_admin", fecha_apertura=caja.fecha_apertura.replace(year=2022), monto_inicial=0.0,
            monto_ventas_efectivo=0.0, monto_ventas_transferencia=0.0, monto_gastos=0.0, estado="abierta", abierto_por="angelly_admin",
        ))
        db.commit()


def _auditoria(sf, accion: str) -> list[str]:
    with sf() as db:
        return list(db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.entidad == "factura_compra", AuditoriaModel.accion == accion)).scalars())


# -- Medio de pago y caja --


def test_una_compra_en_efectivo_resta_del_efectivo_esperado(auth_client) -> None:
    client, sf = auth_client
    antes = _efectivo_esperado(client)

    respuesta = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), cantidad=5, precio=1000, medio_pago="efectivo")

    assert respuesta.status_code == 201
    assert respuesta.json()["medio_pago"] == "efectivo"
    assert respuesta.json()["caja_id"] == 1
    assert _efectivo_esperado(client) == antes - 5000


@pytest.mark.parametrize("medio", ["transferencia", "tarjeta", "credito", None])
def test_los_otros_medios_y_la_factura_sin_dato_no_tocan_el_efectivo(auth_client, medio) -> None:
    client, sf = auth_client
    antes = _efectivo_esperado(client)
    extra = {"medio_pago": medio} if medio else {}

    assert _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), **extra).status_code == 201

    assert _efectivo_esperado(client) == antes


def test_un_medio_desconocido_se_rechaza(auth_client) -> None:
    client, sf = auth_client

    assert _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), medio_pago="cheque").status_code == 422


def test_una_compra_en_efectivo_exige_caja_abierta(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    proveedor = _proveedor(sf)
    _cerrar_caja(sf)

    respuesta = _factura(client, _vendedor(client), proveedor, producto, medio_pago="efectivo")

    assert respuesta.status_code == 409
    assert "caja" in respuesta.json()["detail"].lower()
    assert _stock(sf, producto) == 10


def test_con_la_caja_cerrada_se_puede_registrar_una_compra_por_transferencia(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf)
    _cerrar_caja(sf)

    respuesta = _factura(client, _vendedor(client), proveedor, producto, medio_pago="transferencia")

    assert respuesta.status_code == 201
    assert respuesta.json()["caja_id"] is None
    assert _stock(sf, producto) == 15


def test_las_compras_aparecen_en_los_movimientos_del_turno(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    _factura(client, token, _proveedor(sf), _producto(sf), medio_pago="efectivo")

    movimientos = client.get("/api/caja/1/movimientos", headers=_h(token)).json()

    compra = next(m for m in movimientos if m["tipo"] == "compra")
    assert compra["monto"] == 5000
    assert compra["metodo_pago"] == "efectivo"
    assert "Distribuidora" in compra["descripcion"]


# -- Anulacion --


def test_el_vendedor_no_anula_sin_la_autorizacion_de_un_admin(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    factura = _factura(client, _vendedor(client), _proveedor(sf), producto).json()

    respuesta = _anular(client, _vendedor(client), factura["id"])

    assert respuesta.status_code == 403
    assert _stock(sf, producto) == 15


def test_el_vendedor_anula_con_la_clave_de_un_admin_y_se_devuelve_el_stock_y_el_efectivo(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    antes = _efectivo_esperado(client)
    factura = _factura(client, _vendedor(client), _proveedor(sf), producto, medio_pago="efectivo").json()

    respuesta = _anular(client, _vendedor(client), factura["id"], autorizador_usuario="angelly_admin", autorizador_password="cambiame123")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["anulada"] is True
    assert cuerpo["anulada_por"] == "vendedor1"
    assert cuerpo["autorizada_por"] == "angelly_admin"
    assert cuerpo["motivo_anulacion"] == "Error al digitar"
    assert _stock(sf, producto) == 10
    assert _efectivo_esperado(client) == antes


def test_el_admin_se_autoriza_a_si_mismo(auth_client) -> None:
    client, sf = auth_client
    factura = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf)).json()

    assert _anular(client, _admin(client), factura["id"]).json()["autorizada_por"] == "angelly_superadmin"


def test_la_clave_incorrecta_no_anula(auth_client) -> None:
    client, sf = auth_client
    factura = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf)).json()

    respuesta = _anular(client, _vendedor(client), factura["id"], autorizador_usuario="angelly_admin", autorizador_password="mala")

    assert respuesta.status_code == 403


def test_no_se_anula_dos_veces_ni_una_que_no_existe(auth_client) -> None:
    client, sf = auth_client
    factura = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf)).json()
    assert _anular(client, _admin(client), factura["id"]).status_code == 200

    assert _anular(client, _admin(client), factura["id"]).status_code == 409
    assert _anular(client, _admin(client), 999).status_code == 404


def test_no_se_anula_si_ya_se_vendio_parte_de_la_mercancia(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=0)
    factura = _factura(client, _vendedor(client), _proveedor(sf), producto, cantidad=5).json()
    with sf() as db:  # se vendieron 3 de las 5
        db.get(ProductoModel, producto).stock_actual = 2
        db.commit()

    respuesta = _anular(client, _admin(client), factura["id"])

    assert respuesta.status_code == 409
    assert "vendio" in respuesta.json()["detail"]
    with sf() as db:
        assert db.get(FacturaCompraModel, factura["id"]).anulada is False


def test_una_compra_en_efectivo_de_un_turno_cerrado_no_se_anula(auth_client) -> None:
    client, sf = auth_client
    factura = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), medio_pago="efectivo").json()
    _cerrar_turno_y_abrir_otro(sf, factura["caja_id"])

    respuesta = _anular(client, _admin(client), factura["id"])

    assert respuesta.status_code == 409
    assert "turno" in respuesta.json()["detail"]


def test_una_compra_por_transferencia_se_anula_aunque_la_caja_este_cerrada(auth_client) -> None:
    client, sf = auth_client
    factura = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), medio_pago="transferencia").json()
    _cerrar_caja(sf)

    assert _anular(client, _admin(client), factura["id"]).status_code == 200


def test_anular_libera_el_pedido_que_cumplia(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _proveedor(sf)
    pedido = client.post("/api/proveedores/pedidos", headers=_h(token), json={"proveedor_id": proveedor, "descripcion": "Pedido semanal", "monto_estimado": 1000}).json()
    factura = _factura(client, token, proveedor, _producto(sf), pedido_id=pedido["id"]).json()

    _anular(client, _admin(client), factura["id"])

    with sf() as db:
        guardado = db.get(PedidoProveedorModel, pedido["id"])
        assert guardado.estado == "enviado" and guardado.factura_id is None


def test_anular_deja_auditoria_y_el_historial_de_stock(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    factura = _factura(client, _vendedor(client), _proveedor(sf), producto).json()
    _anular(client, _admin(client), factura["id"])

    registro = _auditoria(sf, "anular")
    movimientos = client.get(f"/api/productos/{producto}/movimientos-stock", headers=_h(_vendedor(client))).json()["data"]

    assert len(registro) == 1 and "Autorizo: angelly_superadmin" in registro[0] and "Error al digitar" in registro[0]
    assert movimientos[0]["delta"] == -5
    assert movimientos[0]["motivo"] == "Factura de compra anulada"


def test_la_lista_marca_las_anuladas(auth_client) -> None:
    client, sf = auth_client
    token = _admin(client)
    factura = _factura(client, token, _proveedor(sf), _producto(sf)).json()
    _anular(client, token, factura["id"])

    lista = client.get("/api/facturas-compra", headers=_h(token)).json()

    assert lista[0]["anulada"] is True and lista[0]["motivo_anulacion"] == "Error al digitar"


def test_una_factura_anulada_no_se_edita(auth_client) -> None:
    client, sf = auth_client
    token = _admin(client)
    factura = _factura(client, token, _proveedor(sf), _producto(sf)).json()
    _anular(client, token, factura["id"])

    assert client.patch(f"/api/facturas-compra/{factura['id']}", headers=_h(token), json={"total_factura": 1}).status_code == 409


def test_una_compra_en_efectivo_de_un_turno_se_anula_no_se_borra(auth_client) -> None:
    client, sf = auth_client
    factura = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), medio_pago="efectivo").json()

    respuesta = client.delete(f"/api/facturas-compra/{factura['id']}", headers=_h(_admin(client)))

    assert respuesta.status_code == 409
    assert "anul" in respuesta.json()["detail"]


def test_no_se_cambia_el_total_de_una_compra_en_efectivo_de_un_turno_cerrado(auth_client) -> None:
    client, sf = auth_client
    factura = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), medio_pago="efectivo").json()
    _cerrar_turno_y_abrir_otro(sf, factura["caja_id"])

    respuesta = client.patch(f"/api/facturas-compra/{factura['id']}", headers=_h(_admin(client)), json={"total_factura": 1})

    assert respuesta.status_code == 409


# -- Duplicados y numero --


def test_no_se_registra_dos_veces_la_misma_factura_del_mismo_proveedor(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor, producto = _proveedor(sf), _producto(sf)
    primera = _factura(client, token, proveedor, producto, numero_factura="FEV-36965").json()

    repetida = _factura(client, token, proveedor, producto, numero_factura="  fev-36965 ")

    assert repetida.status_code == 409
    assert f"#{primera['id']}" in repetida.json()["detail"]
    assert _stock(sf, producto) == 15  # solo la primera sumo stock


def test_el_mismo_numero_de_otro_proveedor_si_se_acepta(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    producto = _producto(sf)
    _factura(client, token, _proveedor(sf, "Bimbo"), producto, numero_factura="FEV-1000")

    assert _factura(client, token, _proveedor(sf, "Coca-Cola"), producto, numero_factura="FEV-1000").status_code == 201


def test_anular_libera_el_numero_para_registrarla_bien(auth_client) -> None:
    client, sf = auth_client
    token = _admin(client)
    proveedor, producto = _proveedor(sf), _producto(sf)
    primera = _factura(client, token, proveedor, producto, numero_factura="FEV-1000").json()
    _anular(client, token, primera["id"])

    assert _factura(client, token, proveedor, producto, numero_factura="FEV-1000").status_code == 201


@pytest.mark.parametrize("numero", ["0", "ab", "  7 "])
def test_un_numero_demasiado_corto_se_rechaza(auth_client, numero) -> None:
    client, sf = auth_client

    respuesta = _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), numero_factura=numero)

    assert respuesta.status_code == 400
    assert "numero" in respuesta.json()["detail"]


def test_sin_numero_la_factura_se_acepta(auth_client) -> None:
    client, sf = auth_client

    assert _factura(client, _vendedor(client), _proveedor(sf), _producto(sf), numero_factura="   ").status_code == 201


# -- Productos y precios --


def test_no_se_compra_un_producto_desactivado(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, nombre="Viejo", activo=False)

    respuesta = _factura(client, _vendedor(client), _proveedor(sf), producto)

    assert respuesta.status_code == 409
    assert "Viejo" in respuesta.json()["detail"]
    assert _stock(sf, producto) == 10


def _con_precio_de_venta(client, sf, venta: float, **item_extra):
    producto = _producto(sf)
    cuerpo = {
        "proveedor_id": _proveedor(sf),
        "items": [{"producto_id": producto, "cantidad": 1, "precio_unitario": 2000, "actualizar_precio": True, "precio_venta": venta, **item_extra}],
    }
    return client.post("/api/facturas-compra", headers=_h(_vendedor(client)), json=cuerpo), producto


def test_un_precio_de_venta_bajo_el_costo_se_rechaza(auth_client) -> None:
    client, sf = auth_client

    respuesta, producto = _con_precio_de_venta(client, sf, venta=1500)

    assert respuesta.status_code == 400
    assert "por debajo del costo" in respuesta.json()["detail"]
    assert _stock(sf, producto) == 10


def test_el_precio_bajo_el_costo_se_acepta_si_se_confirma(auth_client) -> None:
    client, sf = auth_client

    respuesta, producto = _con_precio_de_venta(client, sf, venta=1500, permitir_bajo_costo=True)

    assert respuesta.status_code == 201
    with sf() as db:
        assert float(db.get(ProductoModel, producto).precio_venta) == 1500


def test_un_precio_igual_o_mayor_al_costo_no_pide_confirmacion(auth_client) -> None:
    client, sf = auth_client

    assert _con_precio_de_venta(client, sf, venta=2000)[0].status_code == 201


# -- Filtro de fecha --


def test_la_fecha_final_incluye_todo_ese_dia(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    factura = _factura(client, token, _proveedor(sf), _producto(sf)).json()
    with sf() as db:
        db.get(FacturaCompraModel, factura["id"]).fecha_creacion = datetime(2026, 3, 15, 22, 30)
        db.commit()

    incluida = client.get("/api/facturas-compra?fecha_hasta=2026-03-15", headers=_h(token)).json()
    excluida = client.get("/api/facturas-compra?fecha_hasta=2026-03-14", headers=_h(token)).json()
    paginada = client.get("/api/facturas-compra/paginadas?fecha_hasta=2026-03-15", headers=_h(token)).json()

    assert [f["id"] for f in incluida] == [factura["id"]]
    assert excluida == []
    assert paginada["page"]["total"] == 1
    assert datetime(2026, 3, 15, 22, 30) < datetime(2026, 3, 15) + timedelta(days=1)
