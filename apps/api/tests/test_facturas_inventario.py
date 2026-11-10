"""Pruebas: una factura de compra actualiza stock, costo y (si se confirma) precio de venta."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from src.api.services.compras import costo_unitario, redondear_precio_venta
from src.infrastructure.database.models import (
    AuditoriaModel,
    FacturaCompraModel,
    ProductoModel,
    ProveedorModel,
)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _proveedor(sf) -> int:
    with sf() as db:
        proveedor = ProveedorModel(nombre="Distribuidora")
        db.add(proveedor)
        db.commit()
        return proveedor.id


def _producto(sf, nombre="Arroz", costo=1000.0, venta=1500.0, stock=10) -> int:
    with sf() as db:
        producto = ProductoModel(
            nombre=nombre, precio_costo=costo, precio_venta=venta, stock_actual=stock, stock_minimo=1,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _estado(sf, producto_id: int) -> tuple[int, float, float]:
    with sf() as db:
        p = db.get(ProductoModel, producto_id)
        return p.stock_actual, float(p.precio_costo), float(p.precio_venta)


def _factura(client, token, proveedor, items, porcentaje=0.70):
    return client.post(
        "/api/facturas-compra",
        headers=_h(token),
        json={"proveedor_id": proveedor, "items": items, "porcentaje_ganancia": porcentaje},
    )


# ── Utilidades puras ──


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [(3847.0, 3850.0), (3850.0, 3850.0), (3850.0000001, 3850.0), (3851.0, 3900.0), (0.0, 0.0), (49.99, 50.0)],
)
def test_redondeo_de_precio_al_siguiente_multiplo_de_50(valor: float, esperado: float) -> None:
    assert redondear_precio_venta(valor) == esperado


def test_costo_unitario_incluye_iva_solo_cuando_aplica() -> None:
    assert costo_unitario(2000.0, False, 0.19) == 2000.0
    assert costo_unitario(2000.0, True, 0.19) == 2380.0


# ── Crear factura ──


def test_factura_suma_stock_y_deja_el_ultimo_costo_sin_tocar_el_precio_de_venta(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    respuesta = _factura(client, admin, proveedor, [
        {"producto_id": producto, "cantidad": 5, "precio_unitario": 2000, "aplica_iva": True},
    ])

    assert respuesta.status_code == 201
    stock, costo, venta = _estado(sf, producto)
    assert (stock, costo, venta) == (15, 2380.0, 1500.0)  # precio de venta intacto
    detalle = respuesta.json()["items"][0]
    assert detalle["precio_venta_sugerido"] == 3400.0  # 2380 / 0.70, ya en multiplo de 50


def test_el_vendedor_registra_y_consulta_facturas_de_compra(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")

    respuesta = _factura(client, vendedor, proveedor, [
        {"producto_id": producto, "cantidad": 4, "precio_unitario": 1000, "aplica_iva": False},
    ])

    assert respuesta.status_code == 201
    assert _estado(sf, producto)[0] == 14
    assert client.get("/api/facturas-compra", headers=_h(vendedor)).status_code == 200


def test_factura_con_confirmacion_actualiza_el_precio_con_el_sugerido_redondeado(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    _factura(client, admin, proveedor, [
        {"producto_id": producto, "cantidad": 1, "precio_unitario": 2000, "actualizar_precio": True},
    ])

    assert _estado(sf, producto)[2] == 2900.0  # 2000 / 0.70 = 2857,14 -> 2900


def test_factura_respeta_el_precio_editado_por_el_usuario(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    _factura(client, admin, proveedor, [
        {"producto_id": producto, "cantidad": 1, "precio_unitario": 2000, "actualizar_precio": True, "precio_venta": 3000},
    ])

    assert _estado(sf, producto)[2] == 3000.0


def test_lineas_repetidas_del_mismo_producto_acumulan_stock(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf, stock=0)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    _factura(client, admin, proveedor, [
        {"producto_id": producto, "cantidad": 3, "precio_unitario": 1000},
        {"producto_id": producto, "cantidad": 4, "precio_unitario": 1200},
    ])

    stock, costo, _ = _estado(sf, producto)
    assert (stock, costo) == (7, 1200.0)


def test_factura_deja_auditoria_de_costo_y_precio(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    _factura(client, admin, proveedor, [
        {"producto_id": producto, "cantidad": 2, "precio_unitario": 2000, "actualizar_precio": True},
    ])

    with sf() as db:
        fila = db.execute(select(AuditoriaModel).where(AuditoriaModel.accion == "compra")).scalar_one()
    assert fila.usuario == "angelly_admin"
    assert "+2 u." in fila.detalle and "costo 1000.0->2000.0" in fila.detalle and "venta 1500.0->2900.0" in fila.detalle


def test_margen_fuera_de_rango_se_rechaza(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    respuesta = _factura(client, admin, proveedor, [
        {"producto_id": producto, "cantidad": 1, "precio_unitario": 1000},
    ], porcentaje=0.01)

    assert respuesta.status_code == 422
    assert _estado(sf, producto)[0] == 10


# ── Eliminar factura ──


def test_eliminar_factura_devuelve_el_stock_que_sumo(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf)
    admin = _login_token(client, "angelly_admin", "cambiame123")
    factura_id = _factura(client, admin, proveedor, [
        {"producto_id": producto, "cantidad": 5, "precio_unitario": 2000},
    ]).json()["id"]

    assert client.delete(f"/api/facturas-compra/{factura_id}", headers=_h(admin)).status_code == 204

    assert _estado(sf, producto)[0] == 10
    with sf() as db:
        assert db.get(FacturaCompraModel, factura_id) is None


def test_no_se_elimina_una_factura_cuya_mercancia_ya_se_vendio(auth_client) -> None:
    client, sf = auth_client
    proveedor, producto = _proveedor(sf), _producto(sf, stock=0)
    admin = _login_token(client, "angelly_admin", "cambiame123")
    factura_id = _factura(client, admin, proveedor, [
        {"producto_id": producto, "cantidad": 5, "precio_unitario": 2000},
    ]).json()["id"]
    vendedor = _login_token(client, "vendedor1", "ventas123")
    client.post("/api/ventas", headers=_h(vendedor), json={
        "items": [{"producto_id": producto, "cantidad": 4}], "es_fiado": False, "metodo_pago": "efectivo",
    })

    respuesta = client.delete(f"/api/facturas-compra/{factura_id}", headers=_h(admin))

    assert respuesta.status_code == 409
    assert "ya se vendio" in respuesta.json()["detail"]
    assert _estado(sf, producto)[0] == 1  # nada cambio
    with sf() as db:
        assert db.get(FacturaCompraModel, factura_id) is not None
