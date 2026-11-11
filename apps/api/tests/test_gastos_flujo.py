"""Gastos: solo el efectivo resta del cajon, caja abierta para pagar en efectivo, anulacion autorizada y auditoria."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.api.services import anulacion
from src.auth.security import hash_password
from src.infrastructure.database.models import AuditoriaModel, CierreCajaModel, GastoModel, UsuarioModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


@pytest.fixture(autouse=True)
def _sin_intentos_previos():
    anulacion.reiniciar_intentos()
    yield
    anulacion.reiniciar_intentos()


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _admin(client) -> str:
    return _login_token(client, "angelly_admin", "cambiame123")


def _gasto(client, token, monto=50000, medio="efectivo", categoria="servicios", descripcion="Pago de la luz", **extra):
    return client.post(
        "/api/gastos", headers=_h(token),
        json={"categoria": categoria, "descripcion": descripcion, "monto": monto, "medio_pago": medio, **extra},
    )


def _anular(client, token, gasto_id, **extra):
    return client.post(f"/api/gastos/{gasto_id}/anular", headers=_h(token), json={"motivo": "Error al digitar", **extra})


def _efectivo_esperado(client) -> float:
    return client.get("/api/caja", headers=_h(_admin(client))).json()[0]["saldo_esperado"]


def _cerrar_caja(sf) -> None:
    with sf() as db:
        for caja in db.execute(select(CierreCajaModel)).scalars():
            db.delete(caja)
        db.commit()


def _auditoria(sf, accion: str) -> list[str]:
    with sf() as db:
        return list(db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.entidad == "gasto", AuditoriaModel.accion == accion)).scalars())


# -- Efectivo vs otros medios --


def test_un_gasto_en_efectivo_resta_del_efectivo_esperado(auth_client) -> None:
    client, _ = auth_client
    antes = _efectivo_esperado(client)

    assert _gasto(client, _vendedor(client), monto=50000).status_code == 201

    assert _efectivo_esperado(client) == antes - 50000


@pytest.mark.parametrize("medio", ["transferencia", "tarjeta"])
def test_un_gasto_pagado_por_otro_medio_no_toca_el_efectivo_esperado(auth_client, medio) -> None:
    client, _ = auth_client
    antes = _efectivo_esperado(client)

    respuesta = _gasto(client, _vendedor(client), monto=50000, medio=medio)

    assert respuesta.status_code == 201
    assert respuesta.json()["medio_pago"] == medio
    assert _efectivo_esperado(client) == antes


def test_el_medio_por_defecto_es_efectivo_y_uno_desconocido_se_rechaza(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)

    sin_medio = client.post("/api/gastos", headers=_h(token), json={"categoria": "servicios", "descripcion": "Pago de la luz", "monto": 1000})
    raro = _gasto(client, token, medio="cheque")

    assert sin_medio.json()["medio_pago"] == "efectivo"
    assert raro.status_code == 422


def test_los_movimientos_del_turno_muestran_el_medio_de_cada_gasto(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    _gasto(client, token, monto=1000, medio="transferencia")

    movimientos = client.get("/api/caja/1/movimientos", headers=_h(token)).json()

    gasto = next(m for m in movimientos if m["tipo"] == "gasto")
    assert gasto["metodo_pago"] == "transferencia"
    assert gasto["monto"] == 1000


# -- Caja abierta --


def test_un_gasto_en_efectivo_exige_caja_abierta(auth_client) -> None:
    client, sf = auth_client
    _cerrar_caja(sf)

    respuesta = _gasto(client, _vendedor(client), medio="efectivo")

    assert respuesta.status_code == 409
    assert "caja" in respuesta.json()["detail"].lower()
    with sf() as db:
        assert db.execute(select(GastoModel)).first() is None


def test_con_la_caja_cerrada_se_puede_registrar_un_gasto_por_transferencia(auth_client) -> None:
    client, sf = auth_client
    _cerrar_caja(sf)

    respuesta = _gasto(client, _vendedor(client), medio="transferencia")

    assert respuesta.status_code == 201
    assert respuesta.json()["caja_id"] is None


def test_el_gasto_queda_en_el_turno_abierto(auth_client) -> None:
    client, _ = auth_client

    assert _gasto(client, _vendedor(client)).json()["caja_id"] == 1


# -- Datos --


def test_la_categoria_se_normaliza(auth_client) -> None:
    client, _ = auth_client

    respuesta = _gasto(client, _vendedor(client), categoria="  ARRIENDO   Local ")

    assert respuesta.json()["categoria"] == "arriendo local"


def test_el_monto_tiene_un_tope_y_no_acepta_cero(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)

    assert _gasto(client, token, monto=1_000_000_000).status_code == 422
    assert _gasto(client, token, monto=0).status_code == 422
    assert _gasto(client, token, monto=999_999_999, medio="transferencia").status_code == 201


def test_descripcion_en_blanco_se_rechaza_con_un_mensaje_claro(auth_client) -> None:
    client, _ = auth_client

    respuesta = _gasto(client, _vendedor(client), descripcion="      ab    ")

    assert respuesta.status_code == 400
    assert "descripcion" in respuesta.json()["detail"]


def test_un_gasto_por_transferencia_puede_llevar_la_fecha_de_otro_dia(auth_client) -> None:
    client, _ = auth_client

    respuesta = _gasto(client, _vendedor(client), medio="transferencia", fecha="2026-03-15")

    assert respuesta.status_code == 201
    assert respuesta.json()["fecha"].startswith("2026-03-15")


def test_un_gasto_en_efectivo_no_se_puede_fechar_en_el_pasado(auth_client) -> None:
    client, _ = auth_client

    respuesta = _gasto(client, _vendedor(client), medio="efectivo", fecha="2026-03-15")

    assert respuesta.status_code == 400
    assert "hoy" in respuesta.json()["detail"]


def test_la_fecha_no_puede_ser_futura(auth_client) -> None:
    client, _ = auth_client

    assert _gasto(client, _vendedor(client), medio="transferencia", fecha="2999-01-01").status_code == 400


# -- Anulacion --


def test_el_vendedor_no_puede_anular_sin_la_autorizacion_de_un_admin(auth_client) -> None:
    client, sf = auth_client
    gasto = _gasto(client, _vendedor(client)).json()

    respuesta = _anular(client, _vendedor(client), gasto["id"])

    assert respuesta.status_code == 403
    with sf() as db:
        assert db.get(GastoModel, gasto["id"]).anulado is False


def test_el_vendedor_anula_con_la_clave_de_un_admin_y_el_efectivo_se_recupera(auth_client) -> None:
    client, _ = auth_client
    antes = _efectivo_esperado(client)
    gasto = _gasto(client, _vendedor(client), monto=50000).json()

    respuesta = _anular(client, _vendedor(client), gasto["id"], autorizador_usuario="angelly_admin", autorizador_password="cambiame123")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["anulado"] is True
    assert cuerpo["anulado_por"] == "vendedor1"
    assert cuerpo["autorizado_por"] == "angelly_admin"
    assert cuerpo["motivo_anulacion"] == "Error al digitar"
    assert _efectivo_esperado(client) == antes


def test_el_admin_anula_su_propia_autorizacion(auth_client) -> None:
    client, _ = auth_client
    gasto = _gasto(client, _vendedor(client)).json()

    respuesta = _anular(client, _admin(client), gasto["id"])

    assert respuesta.status_code == 200
    assert respuesta.json()["autorizado_por"] == "angelly_admin"


def test_una_clave_de_admin_incorrecta_no_anula(auth_client) -> None:
    client, _ = auth_client
    gasto = _gasto(client, _vendedor(client)).json()

    respuesta = _anular(client, _vendedor(client), gasto["id"], autorizador_usuario="angelly_admin", autorizador_password="mala")

    assert respuesta.status_code == 403


def test_la_clave_de_otro_vendedor_no_autoriza(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        db.add(UsuarioModel(username="vendedor2", password_hash=hash_password("ventas456"), rol="vendedor", activo=True))
        db.commit()
    gasto = _gasto(client, _vendedor(client)).json()

    respuesta = _anular(client, _vendedor(client), gasto["id"], autorizador_usuario="vendedor2", autorizador_password="ventas456")

    assert respuesta.status_code == 403


def test_no_se_anula_dos_veces(auth_client) -> None:
    client, _ = auth_client
    gasto = _gasto(client, _vendedor(client)).json()
    assert _anular(client, _admin(client), gasto["id"]).status_code == 200

    assert _anular(client, _admin(client), gasto["id"]).status_code == 409


def test_anular_pide_un_motivo(auth_client) -> None:
    client, _ = auth_client
    gasto = _gasto(client, _vendedor(client)).json()

    respuesta = client.post(f"/api/gastos/{gasto['id']}/anular", headers=_h(_admin(client)), json={"motivo": "x"})

    assert respuesta.status_code == 422


def test_anular_un_gasto_que_no_existe(auth_client) -> None:
    client, _ = auth_client

    assert _anular(client, _admin(client), 999).status_code == 404


def test_un_gasto_en_efectivo_de_un_turno_cerrado_no_se_anula(auth_client) -> None:
    client, sf = auth_client
    gasto = _gasto(client, _vendedor(client)).json()
    with sf() as db:  # el turno del gasto se cierra y se abre otro
        caja = db.get(CierreCajaModel, gasto["caja_id"])
        caja.estado = "cerrada"
        caja.fecha_cierre = caja.fecha_apertura.replace(year=2021)
        db.add(CierreCajaModel(
            usuario="angelly_admin", fecha_apertura=caja.fecha_apertura.replace(year=2022), monto_inicial=0.0,
            monto_ventas_efectivo=0.0, monto_ventas_transferencia=0.0, monto_gastos=0.0, estado="abierta", abierto_por="angelly_admin",
        ))
        db.commit()

    respuesta = _anular(client, _admin(client), gasto["id"])

    assert respuesta.status_code == 409
    assert "turno" in respuesta.json()["detail"]


def test_un_gasto_por_transferencia_se_puede_anular_aunque_la_caja_este_cerrada(auth_client) -> None:
    client, sf = auth_client
    gasto = _gasto(client, _vendedor(client), medio="transferencia").json()
    _cerrar_caja(sf)

    assert _anular(client, _admin(client), gasto["id"]).status_code == 200


def test_el_gasto_anulado_se_ve_en_los_movimientos_pero_no_suma(auth_client) -> None:
    client, _ = auth_client
    token = _admin(client)
    gasto = _gasto(client, token, monto=50000).json()
    _anular(client, token, gasto["id"])

    movimientos = client.get("/api/caja/1/movimientos", headers=_h(token)).json()

    fila = next(m for m in movimientos if m["tipo"] == "gasto")
    assert fila["anulada"] is True
    assert fila["total"] == 50000


# -- Edicion y borrado (admin) --


def test_el_vendedor_no_edita_ni_borra_gastos(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    gasto = _gasto(client, token).json()

    assert client.patch(f"/api/gastos/{gasto['id']}", headers=_h(token), json={"monto": 1}).status_code == 403
    assert client.delete(f"/api/gastos/{gasto['id']}", headers=_h(token)).status_code == 403


def test_el_admin_edita_un_gasto_del_turno_abierto_y_el_efectivo_se_ajusta(auth_client) -> None:
    client, sf = auth_client
    gasto = _gasto(client, _vendedor(client), monto=50000).json()
    antes = _efectivo_esperado(client)

    respuesta = client.patch(f"/api/gastos/{gasto['id']}", headers=_h(_admin(client)), json={"monto": 20000, "categoria": "ARRIENDO"})

    assert respuesta.status_code == 200
    assert respuesta.json()["categoria"] == "arriendo"
    assert _efectivo_esperado(client) == antes + 30000
    assert "monto: 50000.0 -> 20000.0" in _auditoria(sf, "actualizar")[0]


def test_un_gasto_anulado_no_se_edita(auth_client) -> None:
    client, _ = auth_client
    token = _admin(client)
    gasto = _gasto(client, token).json()
    _anular(client, token, gasto["id"])

    assert client.patch(f"/api/gastos/{gasto['id']}", headers=_h(token), json={"monto": 1}).status_code == 409


def test_no_se_cambia_el_monto_de_un_gasto_en_efectivo_de_un_turno_cerrado(auth_client) -> None:
    client, sf = auth_client
    gasto = _gasto(client, _vendedor(client)).json()
    with sf() as db:
        caja = db.get(CierreCajaModel, gasto["caja_id"])
        caja.estado = "cerrada"
        caja.fecha_cierre = caja.fecha_apertura.replace(year=2021)
        db.commit()

    respuesta = client.patch(f"/api/gastos/{gasto['id']}", headers=_h(_admin(client)), json={"monto": 1})

    assert respuesta.status_code == 409


def test_un_gasto_de_un_turno_no_se_borra_se_anula(auth_client) -> None:
    client, _ = auth_client
    gasto = _gasto(client, _vendedor(client)).json()

    respuesta = client.delete(f"/api/gastos/{gasto['id']}", headers=_h(_admin(client)))

    assert respuesta.status_code == 409
    assert "anul" in respuesta.json()["detail"]


def test_un_gasto_sin_turno_si_se_borra_y_deja_registro(auth_client) -> None:
    client, sf = auth_client
    _cerrar_caja(sf)
    gasto = _gasto(client, _vendedor(client), medio="transferencia").json()

    assert client.delete(f"/api/gastos/{gasto['id']}", headers=_h(_admin(client))).status_code == 204

    assert len(_auditoria(sf, "eliminar")) == 1


# -- Auditoria --


def test_crear_y_anular_dejan_registro(auth_client) -> None:
    client, sf = auth_client
    gasto = _gasto(client, _vendedor(client), monto=50000, categoria="servicios", descripcion="Pago de la luz").json()
    _anular(client, _admin(client), gasto["id"])

    assert _auditoria(sf, "crear") == ["servicios: 50000.0 por efectivo. Pago de la luz"]
    anulacion_registro = _auditoria(sf, "anular")
    assert len(anulacion_registro) == 1
    assert "Autorizo: angelly_admin" in anulacion_registro[0]
    assert "Error al digitar" in anulacion_registro[0]


# -- Exportacion --


def test_la_exportacion_incluye_el_medio_y_el_estado(auth_client) -> None:
    client, _ = auth_client
    token = _admin(client)
    vigente = _gasto(client, token, monto=1000, descripcion="Gasto vigente").json()
    anulado = _gasto(client, token, monto=2000, medio="transferencia", descripcion="Gasto anulado").json()
    _anular(client, token, anulado["id"])

    csv = client.get("/api/export/gastos", headers=_h(token)).text

    assert "medio_pago,estado" in csv
    assert f"{vigente['id']}," in csv
    assert "transferencia,anulado" in csv
    assert "efectivo,vigente" in csv
