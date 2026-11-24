"""Resumen del turno: las cifras que explican el cuadre (ventas, anuladas, descuentos, devoluciones, abonos, gastos y compras)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from src.infrastructure.database.models import CierreCajaModel, ClienteFiadoTiendaModel, GastoModel, ProductoModel, ProveedorModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

ADMIN = {"autorizador_usuario": "angelly_admin", "autorizador_password": "cambiame123"}


def _h(client, usuario: str = "vendedor") -> dict[str, str]:
    credenciales = {"vendedor": ("vendedor1", "ventas123"), "admin": ("angelly_admin", "cambiame123")}[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def _caja_id(sf) -> int:
    with sf() as db:
        return db.execute(select(CierreCajaModel.id)).scalars().first()


def _vender(client, producto, cantidad, **extra):
    cuerpo = {"items": [{"producto_id": producto, "cantidad": cantidad}], "es_fiado": False, "metodo_pago": "efectivo", **extra}
    respuesta = client.post("/api/ventas", headers=_h(client), json=cuerpo)
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def test_un_turno_vacio_tiene_todas_las_cifras_en_cero(auth_client) -> None:
    client, sf = auth_client

    resumen = client.get(f"/api/caja/{_caja_id(sf)}/resumen", headers=_h(client)).json()

    assert resumen == {
        "ventas": 0, "vendido": 0.0, "ventas_a_credito": 0.0, "ventas_anuladas": 0, "descuentos": 0.0, "devoluciones": 0, "devuelto_en_dinero": 0.0,
        "abonos": 0, "abonos_total": 0.0, "gastos": 0, "gastos_total": 0.0, "compras": 0, "compras_total": 0.0,
    }


def test_el_resumen_cuenta_cada_cosa_del_turno(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        producto = ProductoModel(nombre="Arroz", precio_costo=500, precio_venta=1000, stock_actual=100, stock_minimo=1, catalogo="tienda")
        cliente = ClienteFiadoTiendaModel(nombre="Marta", telefono_whatsapp="3001112233", deuda_total=0)
        proveedor = ProveedorModel(nombre="Distribuidora")
        db.add_all([producto, cliente, proveedor])
        db.commit()
        arroz, marta, distribuidora = producto.id, cliente.id, proveedor.id

    contado = _vender(client, arroz, 3)  # 3.000
    _vender(client, arroz, 10, descuento_manual={"tipo": "porcentaje", "valor": 5, "motivo": "Cliente frecuente"})  # 10.000 - 500
    _vender(client, arroz, 4, es_fiado=True, fiado_origen="tienda", cliente_tienda_id=marta, abono_inicial=1000)  # 4.000 fiado
    anulada = _vender(client, arroz, 1)
    client.post(f"/api/ventas/{anulada['venta_id']}/anular", headers=_h(client), json={"motivo": "Error al digitar", **ADMIN})
    client.post(  # devuelve 1 de las 3: 1.000 en dinero
        f"/api/ventas/{contado['venta_id']}/devoluciones", headers=_h(client),
        json={"items": [{"producto_id": arroz, "cantidad": 1}], "motivo": "No le gusto", **ADMIN},
    )
    client.post(f"/api/clientes/tienda/{marta}/abonos", headers=_h(client), json={"monto": 500, "metodo_pago": "efectivo"})
    with sf() as db:
        caja = db.execute(select(CierreCajaModel)).scalars().first()
        ahora = datetime.now(UTC).replace(tzinfo=None)
        db.add_all([
            GastoModel(categoria="servicios", descripcion="luz", monto=2000, fecha=ahora, registrado_por="vendedor1", caja_id=caja.id),
            GastoModel(categoria="servicios", descripcion="error", monto=9999, fecha=ahora, registrado_por="vendedor1", caja_id=caja.id, anulado=True),
        ])
        db.commit()
    factura = client.post(
        "/api/facturas-compra", headers=_h(client),
        json={"proveedor_id": distribuidora, "medio_pago": "transferencia", "encomienda": 300, "items": [{"producto_id": arroz, "cantidad": 5, "precio_unitario": 1000}]},
    )
    assert factura.status_code == 201, factura.text

    resumen = client.get(f"/api/caja/{_caja_id(sf)}/resumen", headers=_h(client)).json()

    assert resumen["ventas"] == 3 and resumen["ventas_anuladas"] == 1
    assert resumen["vendido"] == 15500.0  # 2.000 (3.000 - 1.000 devueltos) + 9.500 + 4.000
    assert resumen["ventas_a_credito"] == 4000.0
    assert resumen["descuentos"] == 500.0
    assert (resumen["devoluciones"], resumen["devuelto_en_dinero"]) == (1, 1000.0)
    assert (resumen["abonos"], resumen["abonos_total"]) == (1, 500.0)
    assert (resumen["gastos"], resumen["gastos_total"]) == (1, 2000.0)  # el gasto anulado no cuenta
    assert (resumen["compras"], resumen["compras_total"]) == (1, 5300.0)  # con el envio


def test_el_resumen_solo_cuenta_lo_de_ese_turno_y_exige_rol(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        producto = ProductoModel(nombre="Arroz", precio_costo=500, precio_venta=1000, stock_actual=100, stock_minimo=1, catalogo="tienda")
        db.add(producto)
        db.commit()
        arroz = producto.id
    _vender(client, arroz, 2)
    primera_caja = _caja_id(sf)
    with sf() as db:  # se cierra ese turno y se abre otro, sin ventas
        db.get(CierreCajaModel, primera_caja).fecha_cierre = datetime.now(UTC).replace(tzinfo=None)
        nueva = CierreCajaModel(
            usuario="vendedor1", fecha_apertura=datetime.now(UTC).replace(tzinfo=None), monto_inicial=0.0, monto_ventas_efectivo=0.0,
            monto_ventas_transferencia=0.0, monto_gastos=0.0, estado="abierta", abierto_por="vendedor1",
        )
        db.add(nueva)
        db.commit()
        nueva_id = nueva.id

    del_primero = client.get(f"/api/caja/{primera_caja}/resumen", headers=_h(client)).json()
    del_segundo = client.get(f"/api/caja/{nueva_id}/resumen", headers=_h(client)).json()

    assert del_primero["ventas"] == 1 and del_primero["vendido"] == 2000.0
    assert del_segundo["ventas"] == 0
    assert client.get("/api/caja/999999/resumen", headers=_h(client)).status_code == 404
    assert client.get(f"/api/caja/{primera_caja}/resumen", headers=_h(client, "admin")).status_code == 403
