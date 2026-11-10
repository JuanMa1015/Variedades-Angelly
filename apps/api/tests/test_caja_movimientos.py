"""Historial vivo del turno abierto, movimientos del turno y nota de cierre."""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import select

from src.infrastructure.database.models import (
    AbonoTiendaModel,
    CierreCajaModel,
    ClienteFiadoTiendaModel,
    GastoModel,
    ProductoModel,
    VentaModel,
)
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

pytestmark = pytest.mark.sin_turno


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _admin(client) -> str:
    return _login_token(client, "angelly_admin", "cambiame123")


def _producto(sf, precio: float = 1000.0) -> int:
    with sf() as db:
        producto = ProductoModel(
            nombre="Arroz", precio_costo=precio / 2, precio_venta=precio, stock_actual=100, stock_minimo=1,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _vender(client, token, producto, metodo="efectivo", cantidad=1, **extra):
    r = client.post(
        "/api/ventas",
        headers=_h(token),
        json={"items": [{"producto_id": producto, "cantidad": cantidad}], "es_fiado": False, "metodo_pago": metodo, **extra},
    )
    assert r.status_code == 201, r.text
    return r.json()["venta_id"]


def _abrir(client, token, base=50000):
    r = client.post("/api/caja/apertura", headers=_h(token), json={"monto_inicial": base})
    assert r.status_code == 201
    return r.json()["id"]


def test_el_historial_del_turno_abierto_muestra_lo_vivo_y_no_ceros(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    token = _admin(client)
    _abrir(client, token, base=50000)
    _vender(client, token, producto, "efectivo", cantidad=2)
    _vender(client, token, producto, "tarjeta", cantidad=3)

    fila = client.get("/api/caja", headers=_h(token)).json()[0]

    assert fila["esta_abierta"] is True
    assert fila["monto_ventas_efectivo"] == 2000.0
    assert fila["monto_ventas_tarjeta"] == 3000.0
    assert fila["saldo_esperado"] == 52000.0  # inicial + efectivo, sin la tarjeta


def test_el_vendedor_no_ve_el_esperado_del_turno_abierto_en_el_historial(auth_client) -> None:
    client, sf = auth_client
    _abrir(client, _vendedor(client))

    fila = client.get("/api/caja", headers=_h(_vendedor(client))).json()[0]

    assert fila["saldo_esperado"] is None


def test_el_admin_tambien_puede_cerrar_y_ver_el_historial(auth_client) -> None:
    client, _ = auth_client
    token = _admin(client)
    _abrir(client, token, base=1000)

    cierre = client.post("/api/caja/cierre", headers=_h(token), json={"monto_cierre": 1000})

    assert cierre.status_code == 200
    assert client.get("/api/caja", headers=_h(token)).status_code == 200


def test_la_nota_del_cierre_se_guarda_y_se_devuelve(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    _abrir(client, token, base=1000)

    cierre = client.post(
        "/api/caja/cierre", headers=_h(token), json={"monto_cierre": 900, "observaciones": "  Falto un vuelto de $100  "},
    ).json()

    assert cierre["observaciones"] == "Falto un vuelto de $100"
    assert client.get("/api/caja", headers=_h(token)).json()[0]["observaciones"] == "Falto un vuelto de $100"


def test_los_movimientos_explican_el_efectivo_esperado(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    token = _vendedor(client)
    caja = _abrir(client, token, base=10000)
    _vender(client, token, producto, "efectivo", cantidad=2)          # +2000
    anulada = _vender(client, token, producto, "efectivo", cantidad=5)
    client.post(f"/api/ventas/{anulada}/anular", headers=_h(_admin(client)), json={"motivo": "Error al digitar"})
    with sf() as db:
        tienda = ClienteFiadoTiendaModel(nombre="Don Pedro", telefono_whatsapp="3000000000", deuda_total=5000)
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id
        db.add(GastoModel(categoria="Aseo", descripcion="Jabon", monto=700.0, registrado_por="vendedor1"))
        db.add(AbonoTiendaModel(cliente_id=tienda_id, monto=1500.0, metodo_pago="efectivo", saldo_cliente=3500.0))
        db.commit()

    movimientos = client.get(f"/api/caja/{caja}/movimientos", headers=_h(token)).json()

    por_tipo = {m["tipo"] for m in movimientos}
    assert por_tipo == {"venta", "abono_tienda", "gasto"}
    ventas = [m for m in movimientos if m["tipo"] == "venta"]
    assert sorted((m["monto"], m["anulada"]) for m in ventas) == [(0.0, True), (2000.0, False)]
    abono = next(m for m in movimientos if m["tipo"] == "abono_tienda")
    assert abono["monto"] == 1500.0 and "Don Pedro" in abono["descripcion"]
    # Lo que entra al cajon: 2000 + 1500 - 700 gasto = lo que calcula el servidor.
    entra = sum(m["monto"] for m in movimientos if m["tipo"] == "venta" and not m["anulada"] and m["metodo_pago"] == "efectivo")
    entra += abono["monto"]
    gasto = next(m["monto"] for m in movimientos if m["tipo"] == "gasto")
    esperado = client.get("/api/caja", headers=_h(_admin(client))).json()[0]["saldo_esperado"]
    assert 10000 + entra - gasto == esperado


def test_un_fiado_muestra_lo_cobrado_y_el_total(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, precio=3000.0)
    token = _vendedor(client)
    caja = _abrir(client, token)
    with sf() as db:
        tienda = ClienteFiadoTiendaModel(nombre="Maria", telefono_whatsapp="3001112233")
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id
    _vender(client, token, producto, es_fiado=True, fiado_origen="tienda", cliente_tienda_id=tienda_id, abono_inicial=1000)

    venta = next(m for m in client.get(f"/api/caja/{caja}/movimientos", headers=_h(token)).json() if m["tipo"] == "venta")

    assert venta["monto"] == 1000.0 and venta["total"] == 3000.0 and venta["es_fiado"] is True
    assert "Maria" in venta["descripcion"]


def test_los_turnos_viejos_sin_caja_id_se_listan_por_rango_de_fechas(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        caja = CierreCajaModel(
            usuario="x", fecha_apertura=datetime(2026, 6, 1, 8), fecha_cierre=datetime(2026, 6, 1, 20),
            monto_inicial=0.0, monto_ventas_efectivo=0.0, monto_ventas_transferencia=0.0, monto_gastos=0.0,
            estado="cerrada", abierto_por="x",
        )
        db.add(caja)
        db.flush()
        db.add(GastoModel(categoria="Aseo", descripcion="Antiguo", monto=10.0, registrado_por="x", fecha=datetime(2026, 6, 1, 12)))
        db.add(GastoModel(categoria="Aseo", descripcion="Otro dia", monto=10.0, registrado_por="x", fecha=datetime(2026, 6, 2, 12)))
        db.commit()
        caja_id = caja.id
        for gasto in db.execute(select(GastoModel)).scalars():
            gasto.caja_id = None
        db.commit()

    movimientos = client.get(f"/api/caja/{caja_id}/movimientos", headers=_h(_vendedor(client))).json()

    assert [m["descripcion"] for m in movimientos] == ["Aseo · Antiguo"]


def test_movimientos_de_una_caja_inexistente_o_sin_sesion(auth_client) -> None:
    client, _ = auth_client

    assert client.get("/api/caja/999/movimientos", headers=_h(_vendedor(client))).status_code == 404
    client.cookies.clear()  # el login deja una cookie de sesion
    assert client.get("/api/caja/1/movimientos").status_code == 401


def test_las_ventas_anuladas_no_cambian_el_historial_vivo(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    token = _admin(client)
    _abrir(client, token, base=0)
    venta = _vender(client, token, producto, "efectivo", cantidad=4)
    client.post(f"/api/ventas/{venta}/anular", headers=_h(token), json={"motivo": "Error al digitar"})

    fila = client.get("/api/caja", headers=_h(token)).json()[0]

    assert fila["monto_ventas_efectivo"] == 0.0
    with sf() as db:
        assert db.get(VentaModel, venta).anulada is True


def test_corregir_el_monto_contado_recalcula_el_descuadre(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    caja = _abrir(client, token, base=1000)
    client.post("/api/caja/cierre", headers=_h(token), json={"monto_cierre": 900})
    root = _login_token(client, "angelly_superadmin", "supersecure123")
    assert client.get("/api/caja", headers=_h(root)).json()[0]["descuadre"] == -100.0

    corregido = client.patch(f"/api/caja/{caja}", headers=_h(root), json={"monto_cierre": 1000})

    assert corregido.status_code == 200
    assert corregido.json()["descuadre"] == 0.0
    assert client.get("/api/caja", headers=_h(root)).json()[0]["descuadre"] == 0.0
