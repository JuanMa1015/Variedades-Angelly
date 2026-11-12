"""Clientes de cartera: lista con busqueda, filtros y pagina en el servidor, y resumen de toda la cartera."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from tests.test_clientes_cartera_reglas import _admin, _cliente, _venta_fiada
from src.infrastructure.database.models import VentaModel


def _lista(client, **params):
    return client.get("/api/cartera/clientes/paginados", headers=_admin(client), params=params)


def _nombres(respuesta) -> list[str]:
    return [c["nombre"] for c in respuesta.json()["data"]]


def _sembrar(sf) -> None:
    _cliente(sf, nombre="Ana Torres", documento="10001", telefono="573001112233")
    reciente = _cliente(sf, nombre="Beto Reciente", documento="20002", deuda=900000.0)
    _venta_fiada(sf, reciente, 900000.0, dias=2)
    alerta = _cliente(sf, nombre="Carla Alerta", documento="30003", deuda=40000.0)
    _venta_fiada(sf, alerta, 40000.0, dias=40)
    moroso = _cliente(sf, nombre="Dario Moroso", documento="40004", deuda=10000.0)
    _venta_fiada(sf, moroso, 10000.0, dias=90)
    _cliente(sf, nombre="Eva Inactiva", documento="50005", activo=False)


def test_la_lista_pide_autenticacion_y_solo_deja_pasar_a_admin(auth_client) -> None:
    client, _ = auth_client
    client.cookies.clear()
    assert client.get("/api/cartera/clientes/paginados").status_code == 401
    vendedor = {"Authorization": f"Bearer {_login_token(client, 'vendedor1', 'ventas123')}"}
    assert client.get("/api/cartera/clientes/paginados", headers=vendedor).status_code == 403
    assert client.get("/api/cartera/clientes/resumen-deuda", headers=vendedor).status_code == 403


def test_por_defecto_muestra_los_activos_por_nombre_con_su_semaforo(auth_client) -> None:
    client, sf = auth_client
    _sembrar(sf)

    respuesta = _lista(client)

    assert respuesta.status_code == 200
    assert _nombres(respuesta) == ["Ana Torres", "Beto Reciente", "Carla Alerta", "Dario Moroso"]
    estados = {c["nombre"]: c["estado_deuda"] for c in respuesta.json()["data"]}
    assert estados == {"Ana Torres": "sin_deuda", "Beto Reciente": "al_dia", "Carla Alerta": "alerta", "Dario Moroso": "moroso"}
    assert respuesta.json()["page"]["total"] == 4


def test_los_filtros_de_deuda_se_juzgan_por_antiguedad_y_ordenan_por_lo_que_deben(auth_client) -> None:
    client, sf = auth_client
    _sembrar(sf)

    assert _nombres(_lista(client, estado="con_deuda")) == ["Beto Reciente", "Carla Alerta", "Dario Moroso"]
    assert _nombres(_lista(client, estado="alerta")) == ["Carla Alerta"]
    assert _nombres(_lista(client, estado="moroso")) == ["Dario Moroso"]
    assert _nombres(_lista(client, estado="desactivados")) == ["Eva Inactiva"]
    assert len(_nombres(_lista(client, estado="todos"))) == 5


def test_un_filtro_sin_coincidencias_devuelve_una_lista_vacia(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="Solo Sin Deuda", documento="10001")

    respuesta = _lista(client, estado="moroso")

    assert respuesta.status_code == 200
    assert respuesta.json()["data"] == [] and respuesta.json()["page"]["total"] == 0


def test_busca_por_nombre_documento_y_whatsapp_aunque_se_escriba_distinto(auth_client) -> None:
    client, sf = auth_client
    _sembrar(sf)

    assert _nombres(_lista(client, q="CARLA")) == ["Carla Alerta"]
    assert _nombres(_lista(client, q="20002")) == ["Beto Reciente"]
    assert _nombres(_lista(client, q="300 111")) == ["Ana Torres"]
    assert _nombres(_lista(client, q="zzz")) == []


def test_pagina_y_dice_cuantas_hay(auth_client) -> None:
    client, sf = auth_client
    for n in range(7):
        _cliente(sf, nombre=f"Cliente Numero {n}", documento=f"9000{n}")

    primera = _lista(client, limit=3, page=1).json()
    ultima = _lista(client, limit=3, page=3).json()

    assert primera["page"] == {"total": 7, "total_pages": 3, "current_page": 1, "limit": 3}
    assert [c["nombre"] for c in primera["data"]] == ["Cliente Numero 0", "Cliente Numero 1", "Cliente Numero 2"]
    assert [c["nombre"] for c in ultima["data"]] == ["Cliente Numero 6"]


def test_cada_cliente_trae_cuantas_compras_hizo(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, nombre="Buen Cliente", documento="10001")
    with sf() as db:
        db.add_all([VentaModel(cliente_id=cliente, total=1000, saldo_pendiente=0), VentaModel(cliente_id=cliente, total=2500, saldo_pendiente=0)])
        db.commit()

    dato = _lista(client).json()["data"][0]

    assert dato["compras_cantidad"] == 2 and dato["compras_total"] == 3500.0


def test_el_resumen_cuenta_toda_la_cartera(auth_client) -> None:
    client, sf = auth_client
    _sembrar(sf)

    resumen = client.get("/api/cartera/clientes/resumen-deuda", headers=_admin(client)).json()

    assert resumen == {
        "clientes_activos": 4,
        "con_deuda": 3,
        "deuda_total": 950000.0,
        "en_alerta": 1,
        "deuda_en_alerta": 40000.0,
        "morosos": 1,
        "deuda_morosa": 10000.0,
        "desactivados": 1,
    }
