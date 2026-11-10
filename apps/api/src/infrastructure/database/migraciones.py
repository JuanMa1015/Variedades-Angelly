"""Comprueba si la base de datos tiene aplicadas todas las migraciones de Alembic."""

from __future__ import annotations

from pathlib import Path

from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Engine

ALEMBIC_DIR = Path(__file__).resolve().parents[3] / "alembic"


def estado_migraciones(engine: Engine, alembic_dir: Path = ALEMBIC_DIR) -> dict[str, object]:
    """Compara la revision de la base con la ultima que conoce el codigo."""
    esperada = ScriptDirectory(str(alembic_dir)).get_current_head()
    with engine.connect() as conn:
        actual = MigrationContext.configure(conn).get_current_revision()
    return {"actual": actual, "esperada": esperada, "al_dia": actual == esperada}
