"""Resumen de lo que cartera cobra (hoy, semana y mes de Bogota, por medio de pago), separado de la caja del vendedor."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from src.infrastructure.database.models import AbonoCarteraModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from tests.test_cartera_ventas_reglas import _producto, _vender
from tests.test_clientes_cartera_reglas import _admin, _cliente

BOGOTA = timezone(timedelta(hours=-5))


def _resumen(client):
    return client.get("/api/cartera/cobros/resumen", headers=_admin(client))


def _abono_en(sf, cliente, monto, momento_bogota: datetime, metodo="efectivo", **extra) -> None:
    with sf() as db:
        db.add(
            AbonoCarteraModel(
                cliente_id=cliente, monto=monto, metodo_pago=metodo, saldo_cliente=0, fuera_de_caja=True,
                fecha=momento_bogota.astimezone(UTC).replace(tzinfo=None), **extra,
            ),
        )
        db.commit()


def test_solo_cartera_y_con_autenticacion(auth_client) -> None:
    client, _ = auth_client
    client.cookies.clear()
    assert client.get("/api/cartera/cobros/resumen").status_code == 401
    vendedor = {"Authorization": f"Bearer {_login_token(client, 'vendedor1', 'ventas123')}"}
    assert client.get("/api/cartera/cobros/resumen", headers=vendedor).status_code == 403


def test_sin_cobros_todo_es_cero(auth_client) -> None:
    client, _ = auth_client

    assert _resumen(client).json() == {
        "hoy": {"total": 0, "efectivo": 0, "transferencia": 0, "tarjeta": 0, "abonos": 0},
        "semana": {"total": 0, "efectivo": 0, "transferencia": 0, "tarjeta": 0, "abonos": 0},
        "mes": {"total": 0, "efectivo": 0, "transferencia": 0, "tarjeta": 0, "abonos": 0},
    }


def test_cuenta_los_abonos_y_el_abono_inicial_de_las_ventas_por_medio_de_pago(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, deuda=10000.0), _producto(sf)
    client.post(f"/api/cartera/clientes/{cliente}/abonos", headers=_admin(client), json={"monto": 3000, "metodo_pago": "transferencia"})
    _vender(client, cliente, producto, cantidad=2, abono=2000, metodo="efectivo")  # contado: 2.000 en efectivo

    hoy = _resumen(client).json()["hoy"]

    assert hoy == {"total": 5000, "efectivo": 2000, "transferencia": 3000, "tarjeta": 0, "abonos": 2}


def test_separa_hoy_semana_y_mes_con_la_hora_de_bogota(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)
    ahora = datetime.now(BOGOTA)
    inicio_dia = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    lunes = inicio_dia - timedelta(days=inicio_dia.weekday())
    primero = inicio_dia.replace(day=1)
    _abono_en(sf, cliente, 100, inicio_dia + timedelta(minutes=1))  # hoy
    _abono_en(sf, cliente, 200, inicio_dia - timedelta(minutes=1))  # ayer, 23:59 de Bogota
    _abono_en(sf, cliente, 400, primero - timedelta(minutes=1))  # el mes pasado

    resumen = _resumen(client).json()

    assert resumen["hoy"]["total"] == 100
    esperado_semana = 100 + (200 if lunes <= inicio_dia - timedelta(minutes=1) else 0)
    assert resumen["semana"]["total"] == esperado_semana
    esperado_mes = 100 + (200 if primero <= inicio_dia - timedelta(minutes=1) else 0)
    assert resumen["mes"]["total"] == esperado_mes  # lo del mes pasado nunca entra


def test_no_cuenta_abonos_anulados_ni_los_del_punto_de_venta(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    abono_id = client.post(f"/api/cartera/clientes/{cliente}/abonos", headers=_admin(client), json={"monto": 1000, "metodo_pago": "efectivo"}).json()["id"]
    client.delete(f"/api/cartera/abonos/{abono_id}", headers=_admin(client), params={"motivo": "Se anoto mal"})
    with sf() as db:  # abono hecho por el vendedor en el punto de venta: va a su caja, no a cartera
        db.add(AbonoCarteraModel(cliente_id=cliente, monto=700, metodo_pago="efectivo", saldo_cliente=0, fuera_de_caja=False))
        db.commit()

    assert _resumen(client).json()["hoy"]["total"] == 0
