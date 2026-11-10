"""La migracion que completa columnas funciona para bases que aplicaron la version corta o la completa."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

RUTA = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "b9c0d1e2f3a4_completar_columnas_canje_y_consentimiento.py"
NUEVAS_VENTAS = {"monto_recibido", "puntos_canjeados", "descuento_puntos"}
NUEVAS_CLIENTES = {"acepta_datos", "acepta_datos_en"}


def _migracion():
    spec = importlib.util.spec_from_file_location("migracion_columnas", RUTA)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _subir(engine) -> None:
    modulo = _migracion()
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            modulo.upgrade()


def _columnas(engine, tabla: str) -> set[str]:
    return {col["name"] for col in inspect(engine).get_columns(tabla)}


def _base_con_version_corta():
    """Como la produccion: ya tiene la anulacion (a8b9c0d1e2f3 corta) pero no el canje ni el consentimiento."""
    engine = create_engine("sqlite+pysqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE ventas (id INTEGER PRIMARY KEY, total NUMERIC, anulada BOOLEAN DEFAULT 0)"))
        conn.execute(text("INSERT INTO ventas (id, total) VALUES (1, 1000)"))
        conn.execute(text("CREATE TABLE clientes_fidelizacion (id INTEGER PRIMARY KEY, nombre TEXT)"))
        conn.execute(text("INSERT INTO clientes_fidelizacion (id, nombre) VALUES (1, 'Ana')"))
    return engine


def test_agrega_las_columnas_que_faltan_y_conserva_los_datos() -> None:
    engine = _base_con_version_corta()

    _subir(engine)

    assert NUEVAS_VENTAS <= _columnas(engine, "ventas")
    assert NUEVAS_CLIENTES <= _columnas(engine, "clientes_fidelizacion")
    with engine.connect() as conn:
        fila = conn.execute(text("SELECT total, puntos_canjeados, descuento_puntos, monto_recibido FROM ventas")).one()
        cliente = conn.execute(text("SELECT nombre, acepta_datos, acepta_datos_en FROM clientes_fidelizacion")).one()
    assert tuple(fila) == (1000, 0, 0, None)  # las ventas existentes quedan sin canje
    assert tuple(cliente) == ("Ana", 0, None)  # los clientes existentes no han autorizado aun


def test_es_inofensiva_si_las_columnas_ya_existen() -> None:
    engine = _base_con_version_corta()
    _subir(engine)

    _subir(engine)  # segunda vez: no debe fallar ni duplicar

    assert NUEVAS_VENTAS <= _columnas(engine, "ventas")


def test_no_toca_una_base_que_aplico_la_version_completa() -> None:
    engine = create_engine("sqlite+pysqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE ventas (id INTEGER PRIMARY KEY, monto_recibido NUMERIC, puntos_canjeados INTEGER, descuento_puntos NUMERIC)",
        ))
        conn.execute(text(
            "CREATE TABLE clientes_fidelizacion (id INTEGER PRIMARY KEY, acepta_datos BOOLEAN, acepta_datos_en DATETIME)",
        ))

    _subir(engine)

    assert _columnas(engine, "ventas") == {"id", *NUEVAS_VENTAS}


def test_el_downgrade_no_hace_nada() -> None:
    modulo = _migracion()
    assert modulo.downgrade() is None
    assert modulo.down_revision == "a8b9c0d1e2f3"
