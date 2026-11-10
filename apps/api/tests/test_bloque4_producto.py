"""Pruebas de producto: puntos de fidelizacion automaticos y cierre de caja ciego."""

from __future__ import annotations

import pytest
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from src.infrastructure.database.models import (
    ClienteFidelizacionModel,
    ClienteFiadoTiendaModel,
    ProductoModel,
)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _producto(sf, precio: float = 1000.0, stock: int = 50) -> int:
    with sf() as db:
        producto = ProductoModel(
            nombre=f"Prod {precio}", precio_costo=precio / 2, precio_venta=precio,
            stock_actual=stock, stock_minimo=1,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _cliente_fidelizacion(sf, puntos: int = 0, activo: bool = True) -> int:
    with sf() as db:
        cliente = ClienteFidelizacionModel(
            nombre="Fiel", telefono_whatsapp=f"57300{puntos}{activo}", puntos_acumulados=puntos, activo=activo,
        )
        db.add(cliente)
        db.commit()
        return cliente.id


def _puntos(sf, cliente_id: int) -> int:
    with sf() as db:
        return db.get(ClienteFidelizacionModel, cliente_id).puntos_acumulados


def _vender(client, token, producto, fidelizacion_id=None, cantidad=5):
    body = {
        "items": [{"producto_id": producto, "cantidad": cantidad}],
        "es_fiado": False,
        "metodo_pago": "efectivo",
    }
    if fidelizacion_id is not None:
        body["cliente_fidelizacion_id"] = fidelizacion_id
    return client.post("/api/ventas", headers=_h(token), json=body)


# ── Fidelizacion ──


def test_venta_de_contado_suma_un_punto_por_cada_mil_pesos(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_fidelizacion(sf, puntos=10)
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _vender(client, token, producto, cliente)  # 5 x 1000 = 5000

    assert respuesta.status_code == 201
    assert respuesta.json()["puntos_otorgados"] == 5
    assert _puntos(sf, cliente) == 15


def test_fiado_de_tienda_solo_da_puntos_por_el_abono(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_fidelizacion(sf)
    with sf() as db:
        fiado = ClienteFiadoTiendaModel(nombre="Deudor")
        db.add(fiado)
        db.commit()
        fiado_id = fiado.id
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = client.post(
        "/api/ventas",
        headers=_h(token),
        json={
            "cliente_tienda_id": fiado_id,
            "cliente_fidelizacion_id": cliente,
            "items": [{"producto_id": producto, "cantidad": 5}],
            "es_fiado": True,
            "fiado_origen": "tienda",
            "abono_inicial": 2000,
            "metodo_pago": "efectivo",
        },
    )

    assert respuesta.status_code == 201
    assert respuesta.json()["puntos_otorgados"] == 2  # solo cuentan los 2000 cobrados
    assert _puntos(sf, cliente) == 2


def test_eliminar_la_venta_quita_los_puntos_otorgados(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_fidelizacion(sf, puntos=3)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    venta_id = _vender(client, vendedor, producto, cliente).json()["venta_id"]
    assert _puntos(sf, cliente) == 8

    assert client.delete(f"/api/ventas/{venta_id}", headers=_h(admin)).status_code == 204

    assert _puntos(sf, cliente) == 3


def test_cliente_de_fidelizacion_invalido_cancela_la_venta(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, stock=10)
    inactivo = _cliente_fidelizacion(sf, activo=False)
    token = _login_token(client, "vendedor1", "ventas123")

    assert _vender(client, token, producto, 99999).status_code == 400
    assert _vender(client, token, producto, inactivo).status_code == 400
    with sf() as db:
        assert db.get(ProductoModel, producto).stock_actual == 10  # no se desconto stock


def test_venta_sin_cliente_de_fidelizacion_no_da_puntos(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    token = _login_token(client, "vendedor1", "ventas123")

    assert _vender(client, token, producto).json()["puntos_otorgados"] == 0


def test_config_de_fidelizacion_usa_el_entorno(auth_client, monkeypatch) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    monkeypatch.setenv("FIDELIZACION_UMBRAL_BONO", "50")
    monkeypatch.setenv("FIDELIZACION_PESOS_POR_PUNTO", "abc")  # invalido: cae al valor por defecto
    monkeypatch.setenv("FIDELIZACION_VALOR_PUNTO", "25")

    config = client.get("/api/fidelizacion/config", headers=_h(token)).json()

    assert config == {"umbral_bono": 50, "pesos_por_punto": 1000, "valor_punto": 25}


# ── Cierre de caja ciego ──


@pytest.mark.sin_turno
def test_vendedor_no_ve_el_efectivo_esperado_con_la_caja_abierta(auth_client) -> None:
    client, _ = auth_client
    vendedor = _login_token(client, "vendedor1", "ventas123")
    superadmin = _login_token(client, "angelly_superadmin", "supersecure123")
    client.post("/api/caja/apertura", headers=_h(vendedor), json={"monto_inicial": 5000})

    del_vendedor = client.get("/api/caja/estado", headers=_h(vendedor)).json()["caja_actual"]
    del_superadmin = client.get("/api/caja/estado", headers=_h(superadmin)).json()["caja_actual"]
    historial = client.get("/api/caja", headers=_h(vendedor)).json()

    assert del_vendedor["saldo_esperado"] is None
    assert del_superadmin["saldo_esperado"] == 5000
    assert historial[0]["saldo_esperado"] is None


@pytest.mark.sin_turno
def test_al_cerrar_el_vendedor_conoce_el_descuadre(auth_client) -> None:
    client, _ = auth_client
    vendedor = _login_token(client, "vendedor1", "ventas123")
    client.post("/api/caja/apertura", headers=_h(vendedor), json={"monto_inicial": 5000})

    cierre = client.post("/api/caja/cierre", headers=_h(vendedor), json={"monto_cierre": 4500}).json()
    historial = client.get("/api/caja", headers=_h(vendedor)).json()

    assert cierre["saldo_esperado"] == 5000
    assert cierre["descuadre"] == -500
    assert historial[0]["saldo_esperado"] == 5000  # ya cerrada: visible
