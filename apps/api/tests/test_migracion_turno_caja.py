"""Prueba la migracion del turno de caja sobre un esquema minimo (la cadena historica es solo PostgreSQL)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

RUTA = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "f6a7b8c9d0e1_turno_de_caja_y_tarjeta.py"
TABLAS_CON_TURNO = ("ventas", "abonos_cartera", "abonos_tienda", "gastos")


def _cargar_migracion():
    spec = importlib.util.spec_from_file_location("migracion_turno", RUTA)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _esquema_anterior(conn, fecha_cierre_abierta: bool) -> None:
    conn.execute(text(
        "CREATE TABLE cierres_caja (id INTEGER PRIMARY KEY, fecha_apertura DATETIME, fecha_cierre DATETIME)",
    ))
    for tabla in TABLAS_CON_TURNO:
        conn.execute(text(f"CREATE TABLE {tabla} (id INTEGER PRIMARY KEY, fecha DATETIME)"))
    # Turno 1 cerrado y turno 2 (abierto o no segun el caso).
    conn.execute(text("INSERT INTO cierres_caja VALUES (1, '2026-11-01 08:00:00', '2026-11-01 20:00:00')"))
    cierre = "NULL" if fecha_cierre_abierta else "'2026-11-09 20:00:00'"
    conn.execute(text(f"INSERT INTO cierres_caja VALUES (2, '2026-11-09 08:00:00', {cierre})"))
    for tabla in TABLAS_CON_TURNO:
        conn.execute(text(
            f"INSERT INTO {tabla} (id, fecha) VALUES (1, '2026-11-01 10:00:00'), (2, '2026-11-09 07:59:00'), "
            "(3, '2026-11-09 08:00:00'), (4, '2026-11-09 15:30:00')",
        ))


def _aplicar(engine, direccion: str) -> None:
    modulo = _cargar_migracion()
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            getattr(modulo, direccion)()


def _caja_ids(engine, tabla: str) -> dict[int, int | None]:
    with engine.connect() as conn:
        return {fila[0]: fila[1] for fila in conn.execute(text(f"SELECT id, caja_id FROM {tabla} ORDER BY id"))}


@pytest.mark.parametrize("tabla", TABLAS_CON_TURNO)
def test_la_caja_abierta_conserva_lo_registrado_desde_su_apertura(tabla) -> None:
    engine = create_engine("sqlite+pysqlite://")
    with engine.begin() as conn:
        _esquema_anterior(conn, fecha_cierre_abierta=True)

    _aplicar(engine, "upgrade")

    # Lo anterior a la apertura de hoy (y lo de turnos ya cerrados) queda sin turno; lo de hoy, en la caja 2.
    assert _caja_ids(engine, tabla) == {1: None, 2: None, 3: 2, 4: 2}


def test_sin_caja_abierta_no_se_asocia_nada() -> None:
    engine = create_engine("sqlite+pysqlite://")
    with engine.begin() as conn:
        _esquema_anterior(conn, fecha_cierre_abierta=False)

    _aplicar(engine, "upgrade")

    for tabla in TABLAS_CON_TURNO:
        assert set(_caja_ids(engine, tabla).values()) == {None}


def test_agrega_la_columna_de_tarjeta_con_cero_y_los_indices() -> None:
    engine = create_engine("sqlite+pysqlite://")
    with engine.begin() as conn:
        _esquema_anterior(conn, fecha_cierre_abierta=True)

    _aplicar(engine, "upgrade")

    inspector = inspect(engine)
    columnas = {c["name"] for c in inspector.get_columns("cierres_caja")}
    assert "monto_ventas_tarjeta" in columnas
    for tabla in TABLAS_CON_TURNO:
        assert f"ix_{tabla}_caja_id" in {i["name"] for i in inspector.get_indexes(tabla)}
    with engine.connect() as conn:
        assert conn.execute(text("SELECT monto_ventas_tarjeta FROM cierres_caja WHERE id = 1")).scalar_one() == 0


def test_el_downgrade_deja_el_esquema_como_estaba() -> None:
    engine = create_engine("sqlite+pysqlite://")
    with engine.begin() as conn:
        _esquema_anterior(conn, fecha_cierre_abierta=True)
    _aplicar(engine, "upgrade")

    _aplicar(engine, "downgrade")

    inspector = inspect(engine)
    assert "monto_ventas_tarjeta" not in {c["name"] for c in inspector.get_columns("cierres_caja")}
    for tabla in TABLAS_CON_TURNO:
        assert "caja_id" not in {c["name"] for c in inspector.get_columns(tabla)}
