"""Factura de compra: la encomienda (envio) suma al total, las anteriores conservan su calculo, y se consulta una factura."""

from __future__ import annotations

from sqlalchemy import select

from src.infrastructure.database.models import FacturaCompraDetalleModel, FacturaCompraModel, ProductoModel, ProveedorModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(client, usuario: str = "vendedor") -> dict[str, str]:
    credenciales = {"vendedor": ("vendedor1", "ventas123"), "admin": ("angelly_admin", "cambiame123"), "super": ("angelly_superadmin", "supersecure123")}[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def _proveedor_y_producto(sf):
    with sf() as db:
        proveedor = ProveedorModel(nombre="Distribuidora")
        producto = ProductoModel(nombre="Arroz", precio_costo=1000, precio_venta=1500, stock_actual=10, stock_minimo=1)
        db.add_all([proveedor, producto])
        db.commit()
        return proveedor.id, producto.id


def _crear(client, proveedor, producto, **extra):
    return client.post(
        "/api/facturas-compra", headers=_h(client),
        json={"proveedor_id": proveedor, "medio_pago": "transferencia", "items": [{"producto_id": producto, "cantidad": 5, "precio_unitario": 1000}], **extra},
    )


def test_la_encomienda_se_suma_al_total_de_la_factura(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor_y_producto(sf)

    con = _crear(client, proveedor, producto, encomienda=2000)
    sin = _crear(client, proveedor, producto)

    assert con.status_code == 201 and sin.status_code == 201
    assert con.json()["subtotal"] == 5000.0 and con.json()["total_factura"] == 7000.0  # 5.000 + 2.000 de envio
    assert con.json()["encomienda"] == 2000.0 and con.json()["encomienda_suma"] is True
    assert sin.json()["total_factura"] == 5000.0


def test_el_efectivo_que_sale_del_cajon_incluye_el_envio(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor_y_producto(sf)

    respuesta = _crear(client, proveedor, producto, encomienda=2000, medio_pago="efectivo")

    assert respuesta.status_code == 201
    caja = client.get("/api/caja", headers=_h(client, "super")).json()[0]
    assert caja["saldo_esperado"] == -7000.0 + caja["monto_inicial"]  # la compra en efectivo sale completa, con el envio


def test_una_factura_anterior_conserva_su_total_y_se_marca_que_la_encomienda_se_resto(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor_y_producto(sf)
    with sf() as db:
        vieja = FacturaCompraModel(proveedor_id=proveedor, creado_por="vendedor1", subtotal=5000, total_iva=0, total_factura=3000, encomienda=2000, medio_pago="credito")
        db.add(vieja)
        db.commit()
        vieja_id = vieja.id

    respuesta = client.get(f"/api/facturas-compra/{vieja_id}", headers=_h(client))

    assert respuesta.status_code == 200
    assert respuesta.json()["total_factura"] == 3000.0 and respuesta.json()["encomienda_suma"] is False


def test_el_detalle_de_una_factura_trae_sus_productos(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor_y_producto(sf)
    creada = _crear(client, proveedor, producto, encomienda=500, numero_factura="FV-2026").json()

    respuesta = client.get(f"/api/facturas-compra/{creada['id']}", headers=_h(client))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["proveedor_nombre"] == "Distribuidora" and cuerpo["numero_factura"] == "FV-2026"
    assert [(i["nombre_producto"], i["cantidad"], i["precio_unitario"]) for i in cuerpo["items"]] == [("Arroz", 5, 1000.0)]
    with sf() as db:
        assert db.execute(select(FacturaCompraDetalleModel)).scalars().first() is not None


def test_el_detalle_de_una_factura_inexistente_o_para_el_admin_se_rechaza(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor_y_producto(sf)
    creada = _crear(client, proveedor, producto).json()

    assert client.get("/api/facturas-compra/999999", headers=_h(client)).status_code == 404
    assert client.get(f"/api/facturas-compra/{creada['id']}", headers=_h(client, "admin")).status_code == 403
