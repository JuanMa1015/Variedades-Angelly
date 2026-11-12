"""Historial de ventas de cartera: busqueda, filtros, fechas, paginacion y lineas de cada venta."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from src.infrastructure.database.models import VentaModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from tests.test_cartera_ventas_reglas import _anular, _producto, _vender
from tests.test_clientes_cartera_reglas import _admin, _cliente


def _lista(client, **params):
    return client.get("/api/cartera/ventas/paginadas", headers=_admin(client), params=params)


def _ids(respuesta) -> list[int]:
    return [v["venta_id"] for v in respuesta.json()["data"]]


def test_solo_cartera_y_con_autenticacion(auth_client) -> None:
    client, _ = auth_client
    client.cookies.clear()
    assert client.get("/api/cartera/ventas/paginadas").status_code == 401
    vendedor = {"Authorization": f"Bearer {_login_token(client, 'vendedor1', 'ventas123')}"}
    assert client.get("/api/cartera/ventas/paginadas", headers=vendedor).status_code == 403


def test_cada_venta_trae_sus_lineas_el_abono_inicial_y_si_se_puede_anular(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, nombre="Maria Perez"), _producto(sf, precio=2000.0)
    venta_id = _vender(client, cliente, producto, cantidad=3, abono=1000).json()["venta_id"]

    dato = _lista(client).json()["data"][0]

    assert dato["venta_id"] == venta_id and dato["cliente_nombre"] == "Maria Perez"
    assert dato["total"] == 6000 and dato["es_fiado"] is True and dato["abono_inicial"] == 1000
    assert dato["saldo_cliente"] == 5000 and dato["anulable"] is True and dato["anulada"] is False
    assert dato["lineas"] == [{"nombre_producto": "Arroz", "cantidad": 3, "precio_unitario": 2000.0, "subtotal": 6000.0}]
    assert dato["creado_por"] == "angelly_admin"


def test_filtra_por_fiado_contado_y_anuladas(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    fiado = _vender(client, cliente, producto, cantidad=2).json()["venta_id"]
    contado = _vender(client, cliente, producto, cantidad=1, abono=1000).json()["venta_id"]
    anulada = _vender(client, cliente, producto, cantidad=1).json()["venta_id"]
    _anular(client, anulada)

    assert sorted(_ids(_lista(client))) == sorted([fiado, contado, anulada])
    assert _ids(_lista(client, estado="fiado")) == [fiado]
    assert _ids(_lista(client, estado="contado")) == [contado]
    resultado = _lista(client, estado="anuladas").json()["data"]
    assert [v["venta_id"] for v in resultado] == [anulada]
    assert resultado[0]["anulable"] is False and resultado[0]["motivo_anulacion"] == "Se digito mal"


def test_busca_por_nombre_del_cliente_o_numero_de_venta(auth_client) -> None:
    client, sf = auth_client
    ana, beto = _cliente(sf, nombre="Ana Torres", documento="10001"), _cliente(sf, nombre="Beto Gomez", documento="20002")
    producto = _producto(sf)
    de_ana = _vender(client, ana, producto, cantidad=1).json()["venta_id"]
    de_beto = _vender(client, beto, producto, cantidad=1).json()["venta_id"]

    assert _ids(_lista(client, q="ana")) == [de_ana]
    assert _ids(_lista(client, q=f"#{de_beto}")) == [de_beto]
    assert _ids(_lista(client, q="nadie")) == []


def test_filtra_por_fechas_y_pagina(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    hace_diez = (datetime.now(UTC) - timedelta(days=10)).isoformat()
    vieja = _vender(client, cliente, producto, cantidad=1, fecha_venta=hace_diez).json()["venta_id"]
    nuevas = [_vender(client, cliente, producto, cantidad=1).json()["venta_id"] for _ in range(2)]
    hoy = datetime.now(UTC).date().isoformat()

    assert _ids(_lista(client, desde=hoy)) == sorted(nuevas, reverse=True)
    assert _ids(_lista(client, hasta=(datetime.now(UTC) - timedelta(days=5)).date().isoformat())) == [vieja]
    primera = _lista(client, limit=2, page=1).json()
    assert primera["page"] == {"total": 3, "total_pages": 2, "current_page": 1, "limit": 2}
    assert _ids(_lista(client, limit=2, page=2)) == [vieja]


def test_una_venta_vieja_sin_enlace_no_inventa_el_abono_y_la_del_punto_de_venta_no_se_anula(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)
    with sf() as db:
        db.add(VentaModel(cliente_id=cliente, total=4000, saldo_pendiente=3000, es_fiado=True, tipo_fiado="cartera", fuera_de_caja=True))
        db.add(VentaModel(cliente_id=cliente, total=1000, saldo_pendiente=0, creado_por="vendedor1", fuera_de_caja=False))
        db.commit()

    datos = {v["total"]: v for v in _lista(client).json()["data"]}

    assert datos[4000]["abono_inicial"] is None and datos[4000]["anulable"] is True
    assert datos[1000]["anulable"] is False
