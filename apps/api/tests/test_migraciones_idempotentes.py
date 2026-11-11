"""Una base que arranco con la app en desarrollo (create_all + ALTER) ya tiene tablas y columnas nuevas
sin que Alembic lo sepa: las migraciones pendientes no deben fallar por "ya existe"."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect

from src.infrastructure.database.models import Base

BACKEND = Path(__file__).resolve().parents[1]
# Ultima revision anterior a las que crean columnas y tablas que create_all ya pudo haber hecho.
ANTES_DE_LAS_NUEVAS = "c0d1e2f3a4b5"


def _alembic(args: list[str], url: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "APP_ENV": "test", "DATABASE_URL": url}
    return subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", *args],
        cwd=str(BACKEND), env=env, capture_output=True, text=True, check=False,
    )


def test_upgrade_head_no_falla_si_las_columnas_y_tablas_ya_existen(tmp_path: Path) -> None:
    url = f"sqlite+pysqlite:///{(tmp_path / 'ya_creada.sqlite3').as_posix()}"
    engine = create_engine(url)
    Base.metadata.create_all(bind=engine)  # el esquema actual completo, como lo deja el arranque en desarrollo
    assert _alembic(["stamp", ANTES_DE_LAS_NUEVAS], url).returncode == 0

    resultado = _alembic(["upgrade", "head"], url)

    assert resultado.returncode == 0, f"STDOUT:\n{resultado.stdout}\nSTDERR:\n{resultado.stderr}"
    columnas = {c["name"] for c in inspect(engine).get_columns("abonos_tienda")}
    assert {"anulado", "motivo_anulacion"} <= columnas
    assert "movimientos_stock" in inspect(engine).get_table_names()


def test_upgrade_head_repetido_no_cambia_nada(tmp_path: Path) -> None:
    url = f"sqlite+pysqlite:///{(tmp_path / 'repetida.sqlite3').as_posix()}"
    engine = create_engine(url)
    Base.metadata.create_all(bind=engine)
    assert _alembic(["stamp", ANTES_DE_LAS_NUEVAS], url).returncode == 0
    assert _alembic(["upgrade", "head"], url).returncode == 0

    segunda = _alembic(["upgrade", "head"], url)

    assert segunda.returncode == 0, segunda.stderr
    assert _alembic(["check"], url).returncode == 0
