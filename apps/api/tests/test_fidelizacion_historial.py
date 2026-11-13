"""Fidelizacion: historial de puntos, ajustes con motivo, telefono unico y auditoria."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from src.api.services import anulacion
from src.infrastructure.database.models import AuditoriaModel, Base, ClienteFidelizacionModel, MovimientoPuntosModel
from tests.test_canje_puntos import _admin, _cliente, _h, _producto, _puntos, _vendedor, _vender
from tests.test_auth_api import auth_client  # noqa: F401  (fixture)


@pytest.fixture(autouse=True)
def _sin_intentos_previos():
    anulacion.reiniciar_intentos()
    yield
    anulacion.reiniciar_intentos()


def _movimientos(sf, cliente_id: int) -> list[dict]:
    with sf() as db:
        filas = db.execute(select(MovimientoPuntosModel).where(MovimientoPuntosModel.cliente_id == cliente_id).order_by(MovimientoPuntosModel.id)).scalars().all()
        return [{"tipo": m.tipo, "puntos": m.puntos, "saldo": m.saldo, "usuario": m.usuario, "ref": (m.referencia_tipo, m.referencia_id), "motivo": m.motivo} for m in filas]


def _auditoria(sf, accion: str) -> list[str]:
    with sf() as db:
        return list(db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.entidad == "cliente_fidelizacion", AuditoriaModel.accion == accion)).scalars())


def _inscribir(client, token, nombre="Maria Perez", telefono="3104445566", **extra):
    return client.post("/api/fidelizacion/clientes", headers=_h(token), json={"nombre": nombre, "telefono_whatsapp": telefono, "acepta_datos": True, **extra})


def _ajustar(client, token, cliente_id, modo="sumar", puntos=10, motivo="Cortesia del dueno"):
    return client.post(f"/api/fidelizacion/clientes/{cliente_id}/ajustes", headers=_h(token), json={"modo": modo, "puntos": puntos, "motivo": motivo})


# -- Historial por venta --


def test_una_venta_deja_el_movimiento_de_los_puntos_ganados_con_su_numero(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, puntos=0), _producto(sf, precio=10000)

    venta = _vender(client, _vendedor(client), producto, cliente=cliente, cantidad=3).json()["venta_id"]  # 30.000 -> 30 puntos

    assert _movimientos(sf, cliente) == [
        {"tipo": "venta", "puntos": 30, "saldo": 30, "usuario": "vendedor1", "ref": ("venta", venta), "motivo": "Compra"},
    ]


def test_un_canje_y_la_compra_quedan_como_dos_movimientos(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, puntos=150), _producto(sf, precio=10000)

    venta = _vender(client, _vendedor(client), producto, cliente=cliente, canje=100, cantidad=2).json()["venta_id"]  # 20.000 - 2.000

    movimientos = _movimientos(sf, cliente)
    assert [(m["tipo"], m["puntos"], m["saldo"]) for m in movimientos] == [("canje", -100, 50), ("venta", 18, 68)]
    assert all(m["ref"] == ("venta", venta) for m in movimientos)
    assert _puntos(sf, cliente) == 68


def test_una_venta_sin_puntos_para_dar_no_registra_nada(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, puntos=0), _producto(sf, precio=500)

    _vender(client, _vendedor(client), producto, cliente=cliente)

    assert _movimientos(sf, cliente) == []


def test_anular_la_venta_devuelve_lo_canjeado_y_quita_lo_ganado_en_el_historial(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, puntos=150), _producto(sf, precio=10000)
    venta = _vender(client, _vendedor(client), producto, cliente=cliente, canje=100, cantidad=2).json()["venta_id"]

    respuesta = client.post(f"/api/ventas/{venta}/anular", headers=_h(_admin(client)), json={"motivo": "Error al digitar"})

    assert respuesta.status_code == 200
    anulaciones = [m for m in _movimientos(sf, cliente) if m["tipo"] == "anulacion_venta"]
    assert [(m["puntos"], m["saldo"], m["usuario"], m["ref"]) for m in anulaciones] == [
        (100, 168, "angelly_superadmin", ("venta", venta)),
        (-18, 150, "angelly_superadmin", ("venta", venta)),
    ]
    assert _puntos(sf, cliente) == 150


def test_eliminar_la_venta_tambien_queda_en_el_historial(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, puntos=0), _producto(sf, precio=10000)
    venta = _vender(client, _vendedor(client), producto, cliente=cliente, cantidad=2).json()["venta_id"]

    assert client.delete(f"/api/ventas/{venta}", headers=_h(_admin(client))).status_code in (200, 204)

    tipos = [m["tipo"] for m in _movimientos(sf, cliente)]
    assert tipos == ["venta", "eliminacion_venta"]
    assert _puntos(sf, cliente) == 0


def test_el_historial_siempre_suma_el_saldo_del_cliente(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, puntos=0), _producto(sf, precio=10000)
    token = _vendedor(client)
    for _ in range(3):
        _vender(client, token, producto, cliente=cliente, cantidad=2)
    _ajustar(client, _admin(client), cliente, modo="restar", puntos=5)

    movimientos = _movimientos(sf, cliente)

    assert sum(m["puntos"] for m in movimientos) == _puntos(sf, cliente) == 55
    assert movimientos[-1]["saldo"] == 55


def test_revertir_nunca_baja_de_cero_y_registra_lo_realmente_aplicado(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, puntos=0), _producto(sf, precio=10000)
    venta = _vender(client, _vendedor(client), producto, cliente=cliente, cantidad=3).json()["venta_id"]  # +30
    _ajustar(client, _admin(client), cliente, modo="fijar", puntos=10)

    client.post(f"/api/ventas/{venta}/anular", headers=_h(_admin(client)), json={"motivo": "Error al digitar"})

    ultimo = _movimientos(sf, cliente)[-1]
    assert (ultimo["tipo"], ultimo["puntos"], ultimo["saldo"]) == ("anulacion_venta", -10, 0)
    assert _puntos(sf, cliente) == 0


# -- Ajustes manuales --


@pytest.mark.parametrize(("modo", "puntos", "esperado"), [("sumar", 25, 125), ("restar", 40, 60), ("fijar", 30, 30), ("fijar", 400, 400)])
def test_el_admin_ajusta_los_puntos(auth_client, modo, puntos, esperado) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, puntos=100)

    respuesta = _ajustar(client, _admin(client), cliente, modo=modo, puntos=puntos, motivo="Conteo de una promocion")

    assert respuesta.status_code == 200
    assert respuesta.json()["puntos_acumulados"] == esperado
    ultimo = _movimientos(sf, cliente)[-1]
    assert (ultimo["tipo"], ultimo["saldo"], ultimo["usuario"], ultimo["motivo"]) == ("ajuste", esperado, "angelly_superadmin", "Conteo de una promocion")


def test_el_ajuste_exige_motivo_y_lo_deja_en_la_auditoria(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, puntos=100)

    assert _ajustar(client, _admin(client), cliente, motivo="x").status_code == 422
    assert _ajustar(client, _admin(client), cliente, motivo="   ab   ").status_code == 400  # con los espacios de mas parecia largo
    _ajustar(client, _admin(client), cliente, modo="restar", puntos=30, motivo="Puntos mal  dados")

    assert _auditoria(sf, "ajustar_puntos") == ["Ana: 100 -> 70 puntos. Motivo: Puntos mal dados"]


def test_reglas_del_ajuste(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, puntos=50)
    token = _admin(client)

    assert _ajustar(client, token, cliente, modo="restar", puntos=80).status_code == 400   # solo tiene 50
    assert _ajustar(client, token, cliente, modo="sumar", puntos=0).status_code == 400     # nada que sumar
    assert _ajustar(client, token, cliente, modo="fijar", puntos=50).status_code == 400    # ya los tiene
    assert _ajustar(client, token, cliente, modo="fijar", puntos=0).status_code == 200     # fijar en cero si vale
    assert _ajustar(client, token, 999, modo="sumar", puntos=5).status_code == 404
    assert _ajustar(client, token, cliente, modo="regalar", puntos=5).status_code == 422
    assert _puntos(sf, cliente) == 0


def test_el_vendedor_no_ajusta_puntos(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, puntos=50)

    assert _ajustar(client, _vendedor(client), cliente).status_code == 403
    assert _puntos(sf, cliente) == 50


def test_editar_los_puntos_desde_el_panel_tambien_deja_movimiento_y_auditoria(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, puntos=50)

    respuesta = client.patch(f"/api/fidelizacion/clientes/{cliente}", headers=_h(_admin(client)), json={"puntos_acumulados": 80})

    assert respuesta.json()["puntos_acumulados"] == 80
    ultimo = _movimientos(sf, cliente)[-1]
    assert (ultimo["tipo"], ultimo["puntos"], ultimo["saldo"]) == ("ajuste", 30, 80)
    assert "puntos: 50 -> 80" in _auditoria(sf, "actualizar")[0]


def test_guardar_sin_cambios_no_llena_el_historial_ni_la_auditoria(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, puntos=50)

    client.patch(f"/api/fidelizacion/clientes/{cliente}", headers=_h(_admin(client)), json={"nombre": "Ana", "puntos_acumulados": 50})

    assert _movimientos(sf, cliente) == []
    assert _auditoria(sf, "actualizar") == []


# -- Inscripcion --


def test_inscribir_con_puntos_iniciales_deja_su_movimiento_solo_si_es_admin(auth_client) -> None:
    client, sf = auth_client

    del_admin = _inscribir(client, _admin(client), nombre="Beto Gomez", telefono="3109998877", puntos_acumulados=40).json()
    del_vendedor = _inscribir(client, _vendedor(client), nombre="Carla Ruiz", telefono="3008887766", puntos_acumulados=999).json()

    assert [(m["tipo"], m["puntos"]) for m in _movimientos(sf, del_admin["id"])] == [("inicial", 40)]
    assert del_vendedor["puntos_acumulados"] == 0 and _movimientos(sf, del_vendedor["id"]) == []
    assert any("Beto Gomez" in d for d in _auditoria(sf, "crear"))


def test_el_nombre_se_guarda_sin_espacios_de_mas(auth_client) -> None:
    client, _ = auth_client

    assert _inscribir(client, _vendedor(client), nombre="  Maria    Perez  ").json()["nombre"] == "Maria Perez"


# -- Telefono --


def test_el_telefono_se_guarda_en_formato_unico(auth_client) -> None:
    client, _ = auth_client

    assert _inscribir(client, _vendedor(client), telefono="310 444-5566").json()["telefono_whatsapp"] == "573104445566"


@pytest.mark.parametrize("repetido", ["3104445566", "310 444 5566", "+57 310-444-5566", "573104445566"])
def test_el_mismo_numero_no_se_inscribe_dos_veces_aunque_se_escriba_distinto(auth_client, repetido) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    assert _inscribir(client, token, nombre="Maria Perez", telefono="3104445566").status_code == 201

    respuesta = _inscribir(client, token, nombre="Otra Persona", telefono=repetido)

    assert respuesta.status_code == 409
    assert "Maria Perez" in respuesta.json()["detail"]


def test_un_cliente_viejo_guardado_sin_el_57_tambien_choca(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, puntos=0)  # guardado como "3001112233"

    assert _inscribir(client, _vendedor(client), nombre="Doble Cuenta", telefono="300 111 2233").status_code == 409


@pytest.mark.parametrize("malo", ["12345678", "abcdefgh", "123456789012345"])
def test_un_telefono_imposible_se_rechaza(auth_client, malo) -> None:
    client, _ = auth_client

    respuesta = _inscribir(client, _vendedor(client), telefono=malo)

    assert respuesta.status_code == 400


def test_editar_no_puede_tomar_el_telefono_de_otro_pero_si_conservar_el_propio(auth_client) -> None:
    client, _ = auth_client
    admin = _admin(client)
    uno = _inscribir(client, admin, nombre="Uno Uno", telefono="3101111111").json()
    otro = _inscribir(client, admin, nombre="Dos Dos", telefono="3102222222").json()

    robado = client.patch(f"/api/fidelizacion/clientes/{otro['id']}", headers=_h(admin), json={"telefono_whatsapp": "310 111 1111"})
    propio = client.patch(f"/api/fidelizacion/clientes/{uno['id']}", headers=_h(admin), json={"telefono_whatsapp": "310 111 1111", "nombre": "Uno Cambiado"})

    assert robado.status_code == 409 and "Uno Uno" in robado.json()["detail"]
    assert propio.status_code == 200 and propio.json()["nombre"] == "Uno Cambiado"


# -- Historial por API --


def test_el_historial_se_pagina_del_mas_nuevo_al_mas_antiguo(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, puntos=0)
    token = _admin(client)
    for puntos in (10, 20, 30):
        _ajustar(client, token, cliente, modo="sumar", puntos=puntos, motivo=f"Premio de {puntos}")

    pagina1 = client.get(f"/api/fidelizacion/clientes/{cliente}/movimientos?limit=2&page=1", headers=_h(_vendedor(client))).json()
    pagina2 = client.get(f"/api/fidelizacion/clientes/{cliente}/movimientos?limit=2&page=2", headers=_h(_vendedor(client))).json()

    assert pagina1["page"]["total"] == 3 and pagina1["page"]["total_pages"] == 2
    assert [m["puntos"] for m in pagina1["data"]] + [m["puntos"] for m in pagina2["data"]] == [30, 20, 10]
    assert pagina1["data"][0]["saldo"] == 60 and pagina1["data"][0]["motivo"] == "Premio de 30"


def test_el_historial_de_un_cliente_que_no_existe_es_404_y_requiere_sesion(auth_client) -> None:
    client, _ = auth_client

    assert client.get("/api/fidelizacion/clientes/999/movimientos", headers=_h(_vendedor(client))).status_code == 404
    client.cookies.clear()  # el inicio de sesion deja una cookie: sin ella ni token no hay acceso
    assert client.get("/api/fidelizacion/clientes/1/movimientos").status_code in (401, 403)


# -- Desactivar y reactivar --


def test_desactivar_y_reactivar_dejan_registro(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, puntos=70)
    token = _admin(client)

    assert client.delete(f"/api/fidelizacion/clientes/{cliente}", headers=_h(token)).status_code == 204
    assert client.put(f"/api/fidelizacion/clientes/{cliente}/reactivar", headers=_h(token)).status_code == 200

    assert _auditoria(sf, "desactivar") == ["Ana (70 puntos)"]
    assert _auditoria(sf, "reactivar") == ["Ana"]


# -- Migracion: saldo anterior --


def _alembic(args: list[str], url: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "APP_ENV": "test", "DATABASE_URL": url}
    backend = Path(__file__).resolve().parents[1]
    return subprocess.run([sys.executable, "-m", "alembic", "-c", "alembic.ini", *args], cwd=str(backend), env=env, capture_output=True, text=True, check=False)


def test_la_migracion_registra_el_saldo_anterior_una_sola_vez(tmp_path: Path) -> None:
    url = f"sqlite+pysqlite:///{(tmp_path / 'puntos.sqlite3').as_posix()}"
    engine = create_engine(url)
    Base.metadata.create_all(bind=engine)
    with sessionmaker(bind=engine)() as db:
        db.add_all([
            ClienteFidelizacionModel(nombre="Con puntos", telefono_whatsapp="573001110001", puntos_acumulados=75),
            ClienteFidelizacionModel(nombre="Sin puntos", telefono_whatsapp="573001110002", puntos_acumulados=0),
        ])
        db.commit()
    assert _alembic(["stamp", "i6d7e8f9a0b1"], url).returncode == 0

    primera = _alembic(["upgrade", "head"], url)
    assert primera.returncode == 0, primera.stderr
    with sessionmaker(bind=engine)() as db:
        filas = db.execute(select(MovimientoPuntosModel)).scalars().all()
        assert [(f.tipo, f.puntos, f.saldo, f.usuario) for f in filas] == [("saldo_inicial", 75, 75, "sistema")]

    # Volver a correr la migracion con la tabla ya creada (como una base que la tenia sin que Alembic lo supiera) no duplica nada.
    assert _alembic(["stamp", "i6d7e8f9a0b1"], url).returncode == 0
    assert _alembic(["upgrade", "head"], url).returncode == 0
    with sessionmaker(bind=engine)() as db:
        assert len(db.execute(select(MovimientoPuntosModel)).scalars().all()) == 1
