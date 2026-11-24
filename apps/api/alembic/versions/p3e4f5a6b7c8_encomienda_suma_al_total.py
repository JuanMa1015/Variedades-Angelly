"""facturas_compra: la encomienda suma al total (las facturas anteriores conservan el calculo con que se guardaron)

Revision ID: p3e4f5a6b7c8
Revises: o2d3e4f5a6b7
Create Date: 2026-11-24 10:00:00

Idempotente: solo agrega la columna si falta. Las facturas existentes quedan en false (su total ya restaba la encomienda).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "p3e4f5a6b7c8"
down_revision: Union[str, None] = "o2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columnas = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("facturas_compra")}
    if "encomienda_suma" not in columnas:
        op.add_column("facturas_compra", sa.Column("encomienda_suma", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("facturas_compra") as lote:
        lote.drop_column("encomienda_suma")
