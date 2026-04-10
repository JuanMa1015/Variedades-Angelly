"""Verifica que modelos SQLAlchemy y migraciones Alembic no tengan drift."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

from sqlalchemy import create_engine

from src.infrastructure.database.models import Base


def _run_alembic(args: list[str], env: dict[str, str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", *args],
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_alembic_no_schema_drift(tmp_path: Path) -> None:
    backend_root = Path(__file__).resolve().parents[1]
    db_path = tmp_path / "alembic_drift.sqlite3"

    env = os.environ.copy()
    env["APP_ENV"] = "test"
    env["DATABASE_URL"] = f"sqlite+pysqlite:///{db_path.as_posix()}"

    engine = create_engine(env["DATABASE_URL"])
    Base.metadata.create_all(bind=engine)

    stamp = _run_alembic(["stamp", "head"], env=env, cwd=backend_root)
    assert stamp.returncode == 0, (
        "No se pudo hacer stamp head en DB temporal.\n"
        f"STDOUT:\n{stamp.stdout}\nSTDERR:\n{stamp.stderr}"
    )

    check = _run_alembic(["check"], env=env, cwd=backend_root)
    assert check.returncode == 0, (
        "Alembic detecto drift entre modelos y migraciones.\n"
        f"STDOUT:\n{check.stdout}\nSTDERR:\n{check.stderr}"
    )
