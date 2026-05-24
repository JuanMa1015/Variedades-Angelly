"""create cierres_caja table

Revision ID: a1b2c3d4e5f6
Revises: 683d65d3108c
Create Date: 2026-05-24 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "683d65d3108c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_col(table: str, col_def: str) -> None:
    """Agrega columna con IF NOT EXISTS (PostgreSQL 9.6+) y fallback a try/except."""
    try:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_def}")
    except Exception:
        pass


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cierres_caja (
            id SERIAL PRIMARY KEY,
            monto_inicial DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            monto_ventas_efectivo DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            monto_ventas_transferencia DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            monto_gastos DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            monto_cierre DOUBLE PRECISION,
            fecha_apertura TIMESTAMP NOT NULL,
            fecha_cierre TIMESTAMP,
            abierto_por VARCHAR(50) NOT NULL,
            cerrado_por VARCHAR(50)
        )
        """,
    )

    _add_col("cierres_caja", "monto_ventas_efectivo DOUBLE PRECISION NOT NULL DEFAULT 0.0")
    _add_col("cierres_caja", "monto_ventas_transferencia DOUBLE PRECISION NOT NULL DEFAULT 0.0")
    _add_col("cierres_caja", "monto_gastos DOUBLE PRECISION NOT NULL DEFAULT 0.0")
    _add_col("cierres_caja", "monto_cierre DOUBLE PRECISION")
    _add_col("cierres_caja", "fecha_apertura TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00'")
    _add_col("cierres_caja", "fecha_cierre TIMESTAMP")
    _add_col("cierres_caja", "abierto_por VARCHAR(50) NOT NULL DEFAULT ''")
    _add_col("cierres_caja", "cerrado_por VARCHAR(50)")

    import sqlalchemy as sa

    for chk_name, condition in [
        ("ck_caja_monto_inicial", "monto_inicial >= 0"),
        ("ck_caja_monto_ventas_efectivo", "monto_ventas_efectivo >= 0"),
        ("ck_caja_monto_ventas_transferencia", "monto_ventas_transferencia >= 0"),
        ("ck_caja_monto_gastos", "monto_gastos >= 0"),
    ]:
        try:
            op.create_check_constraint(chk_name, "cierres_caja", sa.text(condition))
        except Exception:
            pass


def downgrade() -> None:
    for chk_name in [
        "ck_caja_monto_inicial",
        "ck_caja_monto_ventas_efectivo",
        "ck_caja_monto_ventas_transferencia",
        "ck_caja_monto_gastos",
    ]:
        try:
            op.drop_constraint(chk_name, "cierres_caja", type_="check")
        except Exception:
            pass
    op.execute("DROP TABLE IF EXISTS cierres_caja")
