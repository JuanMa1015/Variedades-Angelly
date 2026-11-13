"""Solo puede haber un turno de caja abierto: lo garantiza la base de datos, no solo la API."""

from __future__ import annotations

import importlib.util
from datetime import datetime
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from src.api.routers import caja as caja_router
from src.infrastructure.database.models import CierreCajaModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

RUTA = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "c0d1e2f3a4b5_un_solo_turno_de_caja_abierto.py"


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _turno(abierto: bool = True, usuario: str = "vendedor1") -> CierreCajaModel:
    return CierreCajaModel(
        usuario=usuario,
        fecha_apertura=datetime(2026, 11, 10, 8),
        fecha_cierre=None if abierto else datetime(2026, 11, 10, 20),
        monto_inicial=0.0,
        monto_ventas_efectivo=0.0,
        monto_ventas_transferencia=0.0,
        monto_gastos=0.0,
        estado="abierta" if abierto else "cerrada",
        abierto_por=usuario,
    )


# -- La base de datos --


@pytest.mark.sin_turno
def test_la_base_rechaza_un_segundo_turno_abierto_aunque_sea_de_otro_usuario(auth_client) -> None:
    _, sf = auth_client
    with sf() as db:
        db.add(_turno(usuario="vendedor1"))
        db.commit()
        db.add(_turno(usuario="otro_usuario"))
        with pytest.raises(IntegrityError):
            db.commit()


@pytest.mark.sin_turno
def test_los_turnos_cerrados_no_cuentan_y_se_puede_abrir_otro_despues(auth_client) -> None:
    _, sf = auth_client
    with sf() as db:
        db.add_all([_turno(abierto=False), _turno(abierto=False)])
        db.commit()
        db.add(_turno(abierto=True))
        db.commit()  # un solo abierto junto a varios cerrados: permitido

        abierto = db.query(CierreCajaModel).filter(CierreCajaModel.fecha_cierre.is_(None)).one()
        abierto.fecha_cierre = datetime(2026, 11, 10, 21)
        db.commit()
        db.add(_turno(abierto=True))
        db.commit()  # al cerrarse el anterior, se puede abrir uno nuevo


# -- La API --


@pytest.mark.sin_turno
def test_dos_usuarios_distintos_no_pueden_abrir_cajas_a_la_vez(auth_client) -> None:
    client, _ = auth_client
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_superadmin", "supersecure123")

    primera = client.post("/api/caja/apertura", headers=_h(vendedor), json={"monto_inicial": 1000})
    segunda = client.post("/api/caja/apertura", headers=_h(admin), json={"monto_inicial": 5000})

    assert primera.status_code == 201
    assert segunda.status_code == 409
    assert "Ya hay una caja abierta" in segunda.json()["detail"]


@pytest.mark.sin_turno
def test_si_la_api_pierde_la_carrera_responde_lo_mismo_en_vez_de_un_error_500(auth_client, monkeypatch) -> None:
    client, sf = auth_client
    with sf() as db:
        db.add(_turno())  # otra peticion ya abrio el turno...
        db.commit()
    # ...pero esta peticion aun no lo ve (la revision previa pasa): solo el indice de la base lo detiene.
    monkeypatch.setattr(caja_router, "_hay_caja_abierta", lambda _db: False)

    respuesta = client.post("/api/caja/apertura", headers=_h(_login_token(client, "vendedor1", "ventas123")), json={"monto_inicial": 0})

    assert respuesta.status_code == 409
    assert "Ya hay una caja abierta" in respuesta.json()["detail"]
    with sf() as db:
        assert db.query(CierreCajaModel).count() == 1


@pytest.mark.sin_turno
def test_tras_el_conflicto_se_puede_seguir_usando_la_api(auth_client, monkeypatch) -> None:
    client, sf = auth_client
    vendedor = _login_token(client, "vendedor1", "ventas123")
    with sf() as db:
        db.add(_turno())
        db.commit()
    monkeypatch.setattr(caja_router, "_hay_caja_abierta", lambda _db: False)
    assert client.post("/api/caja/apertura", headers=_h(vendedor), json={"monto_inicial": 0}).status_code == 409
    monkeypatch.undo()

    cierre = client.post("/api/caja/cierre", headers=_h(vendedor), json={"monto_cierre": 0})
    reabierta = client.post("/api/caja/apertura", headers=_h(vendedor), json={"monto_inicial": 0})

    assert cierre.status_code == 200
    assert reabierta.status_code == 201


# -- La migracion --


def _indices(engine) -> set[str]:
    # El inspector de SQLAlchemy no lista los indices de expresion en SQLite: se consulta el catalogo.
    with engine.connect() as conn:
        filas = conn.execute(text("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'cierres_caja'"))
        return {fila[0] for fila in filas}


def _migracion():
    spec = importlib.util.spec_from_file_location("migracion_un_turno", RUTA)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _subir(engine) -> None:
    modulo = _migracion()
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            modulo.upgrade()


def _base_con_turnos(abiertos: int):
    engine = create_engine("sqlite+pysqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE cierres_caja (id INTEGER PRIMARY KEY, fecha_cierre DATETIME)"))
        conn.execute(text("INSERT INTO cierres_caja (id, fecha_cierre) VALUES (1, '2026-11-01 20:00:00')"))
        for i in range(abiertos):
            conn.execute(text("INSERT INTO cierres_caja (id, fecha_cierre) VALUES (:i, NULL)"), {"i": 10 + i})
    return engine


def test_la_migracion_crea_el_indice_si_hay_a_lo_sumo_un_turno_abierto() -> None:
    for abiertos in (0, 1):
        engine = _base_con_turnos(abiertos)

        _subir(engine)

        assert "ux_cierres_caja_un_turno_abierto" in _indices(engine)


def test_la_migracion_se_detiene_sin_tocar_nada_si_ya_hay_turnos_abiertos_de_mas() -> None:
    engine = _base_con_turnos(2)

    with pytest.raises(RuntimeError, match=r"ids: 10, 11"):
        _subir(engine)

    assert "ux_cierres_caja_un_turno_abierto" not in _indices(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM cierres_caja")).scalar() == 3


def test_el_downgrade_quita_el_indice() -> None:
    engine = _base_con_turnos(1)
    _subir(engine)
    modulo = _migracion()

    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            modulo.downgrade()

    assert "ux_cierres_caja_un_turno_abierto" not in _indices(engine)
