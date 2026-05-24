"""add activo column to usuarios, productos, clientes and fidelizacion

Revision ID: f7e8d9c0b1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-05-24 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7e8d9c0b1a2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_col(table: str, col_def: str) -> None:
    try:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_def}")
    except Exception:
        pass


def upgrade() -> None:
    _add_col("usuarios", "activo BOOLEAN NOT NULL DEFAULT TRUE")
    _add_col("productos", "activo BOOLEAN NOT NULL DEFAULT TRUE")
    _add_col("clientes", "activo BOOLEAN NOT NULL DEFAULT TRUE")
    _add_col("clientes_fidelizacion", "activo BOOLEAN NOT NULL DEFAULT TRUE")
    _add_col("clientes_fiado_tienda", "activo BOOLEAN NOT NULL DEFAULT TRUE")


def downgrade() -> None:
    for tbl in ["usuarios", "productos", "clientes", "clientes_fidelizacion", "clientes_fiado_tienda"]:
        try:
            op.execute(f"ALTER TABLE {tbl} DROP COLUMN IF EXISTS activo")
        except Exception:
            pass
