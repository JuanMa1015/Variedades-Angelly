"""Cartera: repetir un cobro (venta o abono) no lo duplica ni mueve dos veces la deuda o el stock."""

from __future__ import annotations

from sqlalchemy import func, select

from src.api.routers import clientes_cartera_cobros as cobros_router
from src.api.routers import clientes_cartera_ventas as ventas_router
from src.infrastructure.database.models import AbonoCarteraModel, ClienteModel, ProductoModel, VentaModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

CLAVE = "cobro-cartera-0001"


def _admin(client) -> dict[str, str]:
    return {"Authorization": f"Bearer {_login_token(client, 'angelly_admin', 'cambiame123')}"}


def _cliente(sf, deuda=10000.0) -> int:
    with sf() as db:
        cliente = ClienteModel(nombre="Maria Perez", documento="1001", limite_credito=1000000, deuda_total=deuda)
        db.add(cliente)
        db.commit()
        return cliente.id


def _producto(sf, stock=50) -> int:
    with sf() as db:
        producto = ProductoModel(nombre="Bolso de mano", precio_costo=500, precio_venta=1000, stock_actual=stock, stock_minimo=1, catalogo="cartera")
        db.add(producto)
        db.commit()
        return producto.id


def _deuda(sf, cliente_id) -> float:
    with sf() as db:
        return float(db.get(ClienteModel, cliente_id).deuda_total)


def _abonos(sf) -> int:
    with sf() as db:
        return db.execute(select(func.count(AbonoCarteraModel.id))).scalar_one()


def _ventas(sf) -> int:
    with sf() as db:
        return db.execute(select(func.count(VentaModel.id))).scalar_one()


def _stock(sf, producto_id) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto_id).stock_actual


def _abonar(client, cliente_id, monto=3000, clave=CLAVE, **extra):
    cuerpo = {"monto": monto, "metodo_pago": "efectivo", **extra}
    if clave is not None:
        cuerpo["clave_idempotencia"] = clave
    return client.post(f"/api/cartera/clientes/{cliente_id}/abonos", headers=_admin(client), json=cuerpo)


def _vender(client, cliente_id, producto, cantidad=3, clave=CLAVE, **extra):
    cuerpo = {"cliente_id": cliente_id, "items": [{"producto_id": producto, "cantidad": cantidad}], **extra}
    if clave is not None:
        cuerpo["clave_idempotencia"] = clave
    return client.post("/api/cartera/ventas", headers=_admin(client), json=cuerpo)


# -- Abonos --


def test_el_mismo_abono_repetido_devuelve_el_mismo_y_baja_la_deuda_una_sola_vez(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)

    primero = _abonar(client, cliente)
    segundo = _abonar(client, cliente)

    assert primero.status_code == 201 and segundo.status_code == 200
    assert segundo.headers["Idempotent-Replay"] == "true" and "Idempotent-Replay" not in primero.headers
    assert segundo.json()["id"] == primero.json()["id"]
    assert _abonos(sf) == 1 and _deuda(sf, cliente) == 7000.0


def test_la_misma_clave_con_otro_monto_es_un_error_y_no_abona(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)
    _abonar(client, cliente, monto=3000)

    distinto = _abonar(client, cliente, monto=5000)

    assert distinto.status_code == 409 and "clave de cobro" in distinto.json()["detail"]
    assert _abonos(sf) == 1 and _deuda(sf, cliente) == 7000.0


def test_claves_distintas_o_sin_clave_son_abonos_distintos(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=20000.0)

    _abonar(client, cliente, 1000, clave="abono-aaaaaaaa-1")
    _abonar(client, cliente, 1000, clave="abono-aaaaaaaa-2")
    _abonar(client, cliente, 1000, clave=None)
    _abonar(client, cliente, 1000, clave=None)

    assert _abonos(sf) == 4 and _deuda(sf, cliente) == 16000.0


def test_un_abono_rechazado_no_deja_la_clave_gastada(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=2000.0)

    de_mas = _abonar(client, cliente, monto=5000)
    corregido = _abonar(client, cliente, monto=2000)  # mismo intento de cobro, ya con un monto valido

    assert de_mas.status_code == 400
    assert corregido.status_code == 201 and _deuda(sf, cliente) == 0.0


def test_dos_envios_simultaneos_del_mismo_abono_dejan_uno_solo(auth_client, monkeypatch) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)
    primero = _abonar(client, cliente)
    real = cobros_router._abono_de_la_clave
    llamadas = []

    def ciega_la_primera_vez(db, clave):  # el segundo envio no veia todavia el abono del primero
        llamadas.append(1)
        return None if len(llamadas) == 1 else real(db, clave)

    monkeypatch.setattr(cobros_router, "_abono_de_la_clave", ciega_la_primera_vez)

    segundo = _abonar(client, cliente)

    assert segundo.status_code == 200 and segundo.json()["id"] == primero.json()["id"]
    assert _abonos(sf) == 1 and _deuda(sf, cliente) == 7000.0


def test_el_abono_directo_por_admin_tambien_es_idempotente(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)
    cuerpo = {"cliente_id": cliente, "monto": 2500, "metodo_pago": "transferencia", "clave_idempotencia": "directo-cartera-01"}

    primero = client.post("/api/cartera/abonos", headers=_admin(client), json=cuerpo)
    segundo = client.post("/api/cartera/abonos", headers=_admin(client), json=cuerpo)

    assert primero.status_code == 201 and segundo.status_code == 200 and segundo.json()["id"] == primero.json()["id"]
    assert _deuda(sf, cliente) == 7500.0


def test_el_formato_de_la_clave_se_valida(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)

    assert _abonar(client, cliente, clave="corta").status_code == 422
    assert _abonar(client, cliente, clave="con espacios y ñ").status_code == 422
    assert _abonos(sf) == 0


# -- Venta de cartera --


def test_la_misma_venta_de_cartera_repetida_devuelve_la_misma_sin_duplicar_deuda_ni_stock(auth_client) -> None:
    client, sf = auth_client
    cliente, bolso = _cliente(sf, deuda=0.0), _producto(sf)

    primera = _vender(client, cliente, bolso)
    segunda = _vender(client, cliente, bolso)

    assert primera.status_code == 201 and segunda.status_code == 200
    assert segunda.headers["Idempotent-Replay"] == "true"
    assert segunda.json()["venta_id"] == primera.json()["venta_id"]
    assert segunda.json()["total"] == 3000.0 and [d["cantidad"] for d in segunda.json()["detalles"]] == [3]
    assert _ventas(sf) == 1 and _stock(sf, bolso) == 47 and _deuda(sf, cliente) == 3000.0


def test_la_misma_clave_con_otra_venta_se_rechaza(auth_client) -> None:
    client, sf = auth_client
    cliente, bolso = _cliente(sf, deuda=0.0), _producto(sf)
    _vender(client, cliente, bolso, cantidad=3)

    distinta = _vender(client, cliente, bolso, cantidad=5)

    assert distinta.status_code == 409
    assert _ventas(sf) == 1 and _stock(sf, bolso) == 47


def test_la_venta_de_cartera_con_abono_inicial_se_repite_sin_duplicar_el_abono(auth_client) -> None:
    client, sf = auth_client
    cliente, bolso = _cliente(sf, deuda=0.0), _producto(sf)

    primera = _vender(client, cliente, bolso, cantidad=4, abono_inicial=1000, metodo_pago="efectivo")
    segunda = _vender(client, cliente, bolso, cantidad=4, abono_inicial=1000, metodo_pago="efectivo")

    assert primera.status_code == 201 and segunda.status_code == 200
    assert _abonos(sf) == 1 and _deuda(sf, cliente) == 3000.0


def test_dos_envios_simultaneos_de_la_misma_venta_de_cartera_dejan_una_sola(auth_client, monkeypatch) -> None:
    client, sf = auth_client
    cliente, bolso = _cliente(sf, deuda=0.0), _producto(sf)
    primera = _vender(client, cliente, bolso)
    real = ventas_router._venta_de_la_clave
    llamadas = []

    def ciega_la_primera_vez(db, usuario, clave):
        llamadas.append(1)
        return None if len(llamadas) == 1 else real(db, usuario, clave)

    monkeypatch.setattr(ventas_router, "_venta_de_la_clave", ciega_la_primera_vez)

    segunda = _vender(client, cliente, bolso)

    assert segunda.status_code == 200 and segunda.json()["venta_id"] == primera.json()["venta_id"]
    assert _ventas(sf) == 1 and _stock(sf, bolso) == 47 and _deuda(sf, cliente) == 3000.0


def test_sin_clave_dos_ventas_de_cartera_son_dos_ventas(auth_client) -> None:
    client, sf = auth_client
    cliente, bolso = _cliente(sf, deuda=0.0), _producto(sf)

    _vender(client, cliente, bolso, clave=None)
    _vender(client, cliente, bolso, clave=None)

    assert _ventas(sf) == 2 and _stock(sf, bolso) == 44
