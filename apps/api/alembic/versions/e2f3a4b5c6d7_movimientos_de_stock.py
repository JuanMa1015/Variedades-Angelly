"""movimientos_stock: historial de por que cambia el stock de cada producto

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-11-11 09:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "movimientos_stock",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id"), nullable=False),
        sa.Column("fecha", sa.DateTime(), nullable=False),
        sa.Column("tipo", sa.String(length=30), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("stock_resultante", sa.Integer(), nullable=False),
        sa.Column("motivo", sa.String(length=200), nullable=True),
        sa.Column("usuario", sa.String(length=50), nullable=False),
        sa.Column("referencia_tipo", sa.String(length=30), nullable=True),
        sa.Column("referencia_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_movimientos_stock_producto_fecha", "movimientos_stock", ["producto_id", "fecha"])


def downgrade() -> None:
    op.drop_index("ix_movimientos_stock_producto_fecha", table_name="movimientos_stock")
    op.drop_table("movimientos_stock")
