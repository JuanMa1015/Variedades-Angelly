"""Canje de puntos como descuento en la venta, inscripcion por el vendedor y seguridad de la anulacion."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from src.api.services import anulacion
from src.api.services.fidelizacion import valor_punto
from src.infrastructure.database.models import (
    AbonoTiendaModel,
    ClienteFiadoTiendaModel,
    ClienteFidelizacionModel,
    ProductoModel,
    VentaModel,
)
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


@pytest.fixture(autouse=True)
def _sin_intentos_previos():
    anulacion.reiniciar_intentos()
    yield
    anulacion.reiniciar_intentos()


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _admin(client) -> str:
    return _login_token(client, "angelly_superadmin", "supersecure123")


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _producto(sf, precio: float = 10000.0, stock: int = 100) -> int:
    with sf() as db:
        producto = ProductoModel(
            nombre="Aceite", precio_costo=precio / 2, precio_venta=precio, stock_actual=stock, stock_minimo=1,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _cliente(sf, puntos: int = 150) -> int:
    with sf() as db:
        cliente = ClienteFidelizacionModel(nombre="Ana", telefono_whatsapp="3001112233", puntos_acumulados=puntos)
        db.add(cliente)
        db.commit()
        return cliente.id


def _puntos(sf, cliente_id: int) -> int:
    with sf() as db:
        return db.get(ClienteFidelizacionModel, cliente_id).puntos_acumulados


def _vender(client, token, producto, cliente=None, canje=0, cantidad=1, **extra):
    cuerpo = {
        "items": [{"producto_id": producto, "cantidad": cantidad}],
        "es_fiado": False,
        "metodo_pago": "efectivo",
        "puntos_a_canjear": canje,
        **extra,
    }
    if cliente is not None:
        cuerpo["cliente_fidelizacion_id"] = cliente
    return client.post("/api/ventas", headers=_h(token), json=cuerpo)


# -- Canje --


def test_el_valor_de_un_punto_es_20_pesos_por_defecto() -> None:
    assert valor_punto() == 20


def test_la_config_informa_el_valor_del_punto(auth_client) -> None:
    client, _ = auth_client

    config = client.get("/api/fidelizacion/config", headers=_h(_vendedor(client))).json()

    assert config["valor_punto"] == 20


def test_canjear_puntos_descuenta_el_total_y_los_puntos(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente(sf, puntos=150)

    respuesta = _vender(client, _vendedor(client), producto, cliente, canje=100, monto_recibido=10000)

    assert respuesta.status_code == 201
    cuerpo = respuesta.json()
    assert cuerpo["total"] == 8000.0  # 10.000 - 100 puntos x $20
    assert cuerpo["descuento_puntos"] == 2000.0
    assert cuerpo["puntos_canjeados"] == 100
    assert cuerpo["monto_recibido"] == 10000.0
    # Gana puntos solo por lo cobrado (8.000 -> 8) y gasta 100.
    assert _puntos(sf, cliente) == 150 - 100 + 8


def test_no_se_puede_canjear_mas_de_lo_que_tiene_ni_sin_alcanzar_el_minimo(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, precio=50000.0)
    rico, pobre = _cliente(sf, puntos=150), None
    with sf() as db:
        otro = ClienteFidelizacionModel(nombre="Beto", telefono_whatsapp="3009998877", puntos_acumulados=50)
        db.add(otro)
        db.commit()
        pobre = otro.id
    token = _vendedor(client)

    assert _vender(client, token, producto, rico, canje=151).status_code == 400
    assert _vender(client, token, producto, pobre, canje=10).status_code == 400  # no llega al minimo de 100
    assert _puntos(sf, rico) == 150 and _puntos(sf, pobre) == 50


def test_el_descuento_no_puede_superar_el_total(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf, precio=1000.0), _cliente(sf, puntos=500)

    respuesta = _vender(client, _vendedor(client), producto, cliente, canje=100)  # $2.000 > $1.000

    assert respuesta.status_code == 400
    assert _puntos(sf, cliente) == 500


def test_canjear_exige_un_cliente_de_fidelizacion(auth_client) -> None:
    client, sf = auth_client

    respuesta = _vender(client, _vendedor(client), _producto(sf), cliente=None, canje=100)

    assert respuesta.status_code == 400


def test_anular_una_venta_con_canje_devuelve_los_puntos_gastados_y_quita_los_ganados(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente(sf, puntos=150)
    venta = _vender(client, _admin(client), producto, cliente, canje=100).json()["venta_id"]
    assert _puntos(sf, cliente) == 58

    anulada = client.post(f"/api/ventas/{venta}/anular", headers=_h(_admin(client)), json={"motivo": "Error al digitar"})

    assert anulada.status_code == 200
    assert _puntos(sf, cliente) == 150


def test_borrar_una_venta_con_canje_tambien_devuelve_los_puntos(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente(sf, puntos=150)
    venta = _vender(client, _admin(client), producto, cliente, canje=100).json()["venta_id"]

    assert client.delete(f"/api/ventas/{venta}", headers=_h(_admin(client))).status_code == 204

    assert _puntos(sf, cliente) == 150


def test_un_fiado_con_canje_baja_la_deuda_en_el_descuento(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente(sf, puntos=150)
    with sf() as db:
        tienda = ClienteFiadoTiendaModel(nombre="Don Pedro", telefono_whatsapp="3000000000")
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id

    respuesta = _vender(
        client, _vendedor(client), producto, cliente, canje=100,
        es_fiado=True, fiado_origen="tienda", cliente_tienda_id=tienda_id, abono_inicial=3000,
    )

    assert respuesta.status_code == 201
    assert respuesta.json()["total"] == 8000.0
    with sf() as db:
        assert float(db.get(ClienteFiadoTiendaModel, tienda_id).deuda_total) == 5000.0


# -- Inscripcion de clientes --


def test_el_vendedor_inscribe_clientes_con_autorizacion_de_datos(auth_client) -> None:
    client, sf = auth_client

    respuesta = client.post(
        "/api/fidelizacion/clientes",
        headers=_h(_vendedor(client)),
        json={"nombre": "Maria Perez", "telefono_whatsapp": "3104445566", "acepta_datos": True, "puntos_acumulados": 999},
    )

    assert respuesta.status_code == 201
    assert respuesta.json()["puntos_acumulados"] == 0  # un vendedor no regala puntos
    with sf() as db:
        guardado = db.execute(select(ClienteFidelizacionModel)).scalars().one()
        assert guardado.acepta_datos is True and guardado.acepta_datos_en is not None


def test_sin_autorizacion_de_datos_no_se_inscribe(auth_client) -> None:
    client, sf = auth_client

    respuesta = client.post(
        "/api/fidelizacion/clientes",
        headers=_h(_vendedor(client)),
        json={"nombre": "Maria Perez", "telefono_whatsapp": "3104445566"},
    )

    assert respuesta.status_code == 400
    with sf() as db:
        assert db.execute(select(ClienteFidelizacionModel)).first() is None


def test_el_admin_puede_fijar_puntos_iniciales(auth_client) -> None:
    client, _ = auth_client

    respuesta = client.post(
        "/api/fidelizacion/clientes",
        headers=_h(_admin(client)),
        json={"nombre": "Maria Perez", "telefono_whatsapp": "3104445566", "acepta_datos": True, "puntos_acumulados": 40},
    )

    assert respuesta.json()["puntos_acumulados"] == 40


# -- Seguridad de la anulacion --


def _venta_del_vendedor(client, sf) -> int:
    return _vender(client, _vendedor(client), _producto(sf)).json()["venta_id"]


def test_tras_varios_intentos_fallidos_se_bloquea_al_autorizador(auth_client) -> None:
    client, sf = auth_client
    venta = _venta_del_vendedor(client, sf)
    token = _vendedor(client)
    mala = {"motivo": "Error al digitar", "autorizador_usuario": "angelly_admin", "autorizador_password": "mal"}

    for _ in range(anulacion.MAX_INTENTOS_FALLIDOS):
        assert client.post(f"/api/ventas/{venta}/anular", headers=_h(token), json=mala).status_code == 403

    bloqueado = client.post(
        f"/api/ventas/{venta}/anular",
        headers=_h(token),
        json={**mala, "autorizador_password": "cambiame123"},  # aun con la clave correcta
    )
    assert bloqueado.status_code == 429


def test_un_acierto_borra_los_fallos_de_esa_cuenta(auth_client) -> None:
    client, sf = auth_client
    venta = _venta_del_vendedor(client, sf)
    token = _vendedor(client)
    cuerpo = {"motivo": "Error al digitar", "autorizador_usuario": "angelly_admin"}
    for _ in range(anulacion.MAX_INTENTOS_FALLIDOS - 1):
        client.post(f"/api/ventas/{venta}/anular", headers=_h(token), json={**cuerpo, "autorizador_password": "mal"})

    ok = client.post(f"/api/ventas/{venta}/anular", headers=_h(token), json={**cuerpo, "autorizador_password": "cambiame123"})

    assert ok.status_code == 200


def test_los_fallos_vencen_con_el_tiempo(monkeypatch) -> None:
    anulacion._registrar_fallo(["destino:x"])
    ahora = anulacion.time.monotonic() + anulacion.VENTANA_BLOQUEO_SEGUNDOS + 1
    monkeypatch.setattr(anulacion.time, "monotonic", lambda: ahora)

    anulacion._exigir_sin_bloqueo(["destino:x"])  # no lanza
    assert "destino:x" not in anulacion._fallos


def test_no_se_anula_un_fiado_con_abonos_posteriores(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    with sf() as db:
        tienda = ClienteFiadoTiendaModel(nombre="Don Pedro", telefono_whatsapp="3000000000")
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id
    venta = _vender(
        client, _admin(client), producto, es_fiado=True, fiado_origen="tienda", cliente_tienda_id=tienda_id,
    ).json()["venta_id"]
    with sf() as db:
        fecha = db.get(VentaModel, venta).fecha
        db.add(AbonoTiendaModel(
            cliente_id=tienda_id, monto=1000.0, metodo_pago="efectivo", saldo_cliente=9000.0,
            fecha=fecha + timedelta(minutes=5),
        ))
        db.commit()

    respuesta = client.post(f"/api/ventas/{venta}/anular", headers=_h(_admin(client)), json={"motivo": "Error al digitar"})

    assert respuesta.status_code == 409
    assert "abonos" in respuesta.json()["detail"]
