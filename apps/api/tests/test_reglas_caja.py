"""Pruebas: turno de caja, tarjeta distinta de transferencia y consistencia de los cobros."""

from __future__ import annotations

import pytest
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    AbonoTiendaModel,
    CierreCajaModel,
    ClienteFiadoTiendaModel,
    ClienteModel,
    GastoModel,
    ProductoModel,
    VentaModel,
)


pytestmark = pytest.mark.sin_turno


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _producto(sf, precio: float = 1000.0, stock: int = 100) -> int:
    with sf() as db:
        producto = ProductoModel(
            nombre=f"Prod {precio}", precio_costo=precio / 2, precio_venta=precio, stock_actual=stock, stock_minimo=1,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _vender(client, token, producto, metodo="efectivo", cantidad=1):
    return client.post(
        "/api/ventas",
        headers=_h(token),
        json={"items": [{"producto_id": producto, "cantidad": cantidad}], "es_fiado": False, "metodo_pago": metodo},
    )


def _abrir(client, token, base=0):
    return client.post("/api/caja/apertura", headers=_h(token), json={"monto_inicial": base})


def _estado(client, token):
    return client.get("/api/caja/estado", headers=_h(token)).json()["caja_actual"]


def _venta_caja_id(sf, venta_id: int):
    with sf() as db:
        return db.get(VentaModel, venta_id).caja_id


# ── Turno de caja ──


def test_la_venta_queda_asociada_al_turno_abierto(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    caja_id = _abrir(client, vendedor).json()["id"]

    venta_id = _vender(client, vendedor, producto).json()["venta_id"]

    assert _venta_caja_id(sf, venta_id) == caja_id


def test_con_la_caja_cerrada_no_se_vende_y_lo_anterior_queda_en_su_turno(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")

    assert _vender(client, vendedor, producto).status_code == 409
    caja_id = _abrir(client, vendedor).json()["id"]
    venta = _vender(client, vendedor, producto).json()["venta_id"]
    client.post("/api/caja/cierre", headers=_h(vendedor), json={"monto_cierre": 0})
    rechazada = _vender(client, vendedor, producto)

    assert _venta_caja_id(sf, venta) == caja_id
    assert rechazada.status_code == 409


def test_cada_turno_cuenta_solo_lo_suyo(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    superadmin = _login_token(client, "angelly_superadmin", "supersecure123")

    _abrir(client, vendedor, base=1000)
    _vender(client, vendedor, producto, cantidad=3)  # 3000 en efectivo
    cierre_1 = client.post("/api/caja/cierre", headers=_h(vendedor), json={"monto_cierre": 4000}).json()
    _abrir(client, vendedor, base=500)
    _vender(client, vendedor, producto, cantidad=2)  # 2000 en efectivo

    turno_2 = _estado(client, superadmin)

    assert cierre_1["monto_ventas_efectivo"] == 3000
    assert turno_2["monto_ventas_efectivo"] == 2000
    assert turno_2["saldo_esperado"] == 2500  # 500 de base + 2000


def test_abonos_y_gastos_tambien_pertenecen_al_turno(auth_client) -> None:
    client, sf = auth_client
    vendedor = _login_token(client, "vendedor1", "ventas123")
    superadmin = _login_token(client, "angelly_superadmin", "supersecure123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    with sf() as db:
        cartera = ClienteModel(nombre="Cartera", documento="1", limite_credito=100000, deuda_total=10000)
        tienda = ClienteFiadoTiendaModel(nombre="Tienda", deuda_total=8000)
        db.add_all([cartera, tienda])
        db.commit()
        cartera_id, tienda_id = cartera.id, tienda.id
    caja_id = _abrir(client, vendedor, base=0).json()["id"]

    client.post(f"/api/cartera/clientes/{cartera_id}/abonos", headers=_h(admin), json={"monto": 3000, "metodo_pago": "efectivo"})
    client.post(f"/api/clientes/tienda/{tienda_id}/abonos", headers=_h(vendedor), json={"monto": 2000, "metodo_pago": "transferencia"})
    client.post("/api/gastos", headers=_h(vendedor), json={"categoria": "servicios", "descripcion": "pago de luz", "monto": 500})

    with sf() as db:
        assert db.execute(select(AbonoCarteraModel.caja_id)).scalar_one() == caja_id
        assert db.execute(select(AbonoTiendaModel.caja_id)).scalar_one() == caja_id
        assert db.execute(select(GastoModel.caja_id)).scalar_one() == caja_id
    turno = _estado(client, superadmin)
    assert turno["monto_ventas_efectivo"] == 3000
    assert turno["monto_ventas_transferencia"] == 2000
    assert turno["monto_gastos"] == 500
    assert turno["saldo_esperado"] == 2500  # 3000 efectivo - 500 de gastos


def test_un_abono_con_fecha_anterior_a_la_apertura_no_entra_al_turno(auth_client) -> None:
    client, sf = auth_client
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    with sf() as db:
        cliente = ClienteModel(nombre="Cartera", documento="1", limite_credito=100000, deuda_total=10000)
        db.add(cliente)
        db.commit()
        cliente_id = cliente.id
    _abrir(client, vendedor)
    ayer = (datetime.now(UTC) - timedelta(days=3)).isoformat()

    client.post(
        f"/api/cartera/clientes/{cliente_id}/abonos",
        headers=_h(admin),
        json={"monto": 4000, "metodo_pago": "efectivo", "fecha": ayer},
    )

    with sf() as db:
        assert db.execute(select(AbonoCarteraModel.caja_id)).scalar_one() is None


def test_borrar_un_turno_no_borra_sus_ventas(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    superadmin = _login_token(client, "angelly_superadmin", "supersecure123")
    _abrir(client, vendedor)
    venta_id = _vender(client, vendedor, producto).json()["venta_id"]
    client.post("/api/caja/cierre", headers=_h(vendedor), json={"monto_cierre": 1000})
    with sf() as db:
        caja_id = db.execute(select(CierreCajaModel.id)).scalar_one()

    respuesta = client.delete(f"/api/caja/{caja_id}", headers=_h(superadmin))

    assert respuesta.status_code == 204
    with sf() as db:
        assert db.get(VentaModel, venta_id) is not None


# ── Tarjeta distinta de transferencia ──


def test_la_tarjeta_se_cuenta_aparte_y_no_entra_al_efectivo(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    superadmin = _login_token(client, "angelly_superadmin", "supersecure123")
    _abrir(client, vendedor, base=1000)

    _vender(client, vendedor, producto, "efectivo", cantidad=1)  # 1000
    _vender(client, vendedor, producto, "transferencia", cantidad=2)  # 2000
    _vender(client, vendedor, producto, "tarjeta", cantidad=4)  # 4000

    turno = _estado(client, superadmin)

    assert turno["monto_ventas_efectivo"] == 1000
    assert turno["monto_ventas_transferencia"] == 2000
    assert turno["monto_ventas_tarjeta"] == 4000
    assert turno["total_ingresos"] == 7000
    assert turno["saldo_esperado"] == 2000  # solo base + efectivo estan en el cajon


def test_el_cierre_guarda_la_tarjeta(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    _abrir(client, vendedor)
    _vender(client, vendedor, producto, "tarjeta", cantidad=3)

    cierre = client.post("/api/caja/cierre", headers=_h(vendedor), json={"monto_cierre": 0}).json()
    historial = client.get("/api/caja", headers=_h(vendedor)).json()

    assert cierre["monto_ventas_tarjeta"] == 3000
    assert historial[0]["monto_ventas_tarjeta"] == 3000
    assert cierre["descuadre"] == 0  # sin efectivo esperado, contar 0 cuadra


def test_el_dashboard_separa_tarjeta_transferencia_y_efectivo(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    _abrir(client, vendedor)
    _vender(client, vendedor, producto, "efectivo", cantidad=1)
    _vender(client, vendedor, producto, "transferencia", cantidad=2)
    _vender(client, vendedor, producto, "tarjeta", cantidad=3)
    with sf() as db:
        tienda = ClienteFiadoTiendaModel(nombre="Tienda", deuda_total=5000)
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id
    client.post(f"/api/clientes/tienda/{tienda_id}/abonos", headers=_h(vendedor), json={"monto": 1500, "metodo_pago": "efectivo"})

    resumen = client.get("/api/dashboard/resumen", headers=_h(admin)).json()

    assert resumen["pagos_efectivo"] == 2500  # venta 1000 + abono de tienda 1500
    assert resumen["pagos_transferencia"] == 2000
    assert resumen["pagos_tarjeta"] == 3000


def test_los_abonos_aceptan_tarjeta_pero_no_metodos_inventados(auth_client) -> None:
    client, sf = auth_client
    vendedor = _login_token(client, "vendedor1", "ventas123")
    _abrir(client, vendedor)
    with sf() as db:
        tienda = ClienteFiadoTiendaModel(nombre="Tienda", deuda_total=5000)
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id

    con_tarjeta = client.post(f"/api/clientes/tienda/{tienda_id}/abonos", headers=_h(vendedor), json={"monto": 1000, "metodo_pago": "tarjeta"})
    inventado = client.post(f"/api/clientes/tienda/{tienda_id}/abonos", headers=_h(vendedor), json={"monto": 1000, "metodo_pago": "cheque"})

    assert con_tarjeta.status_code == 201
    assert inventado.status_code == 422


def test_el_superadmin_ve_el_efectivo_esperado_sin_sumar_transferencias(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    superadmin = _login_token(client, "angelly_superadmin", "supersecure123")
    _abrir(client, vendedor, base=1000)
    _vender(client, vendedor, producto, "transferencia", cantidad=5)
    client.post("/api/caja/cierre", headers=_h(vendedor), json={"monto_cierre": 1000})

    lista = client.get("/api/superadmin/caja", headers=_h(superadmin)).json()

    assert lista[0]["saldo_esperado"] == 1000  # antes sumaba las transferencias (6000)
    assert lista[0]["monto_ventas_transferencia"] == 5000
    assert lista[0]["monto_ventas_tarjeta"] == 0
