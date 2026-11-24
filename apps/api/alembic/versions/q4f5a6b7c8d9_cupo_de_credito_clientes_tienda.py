"""clientes_fiado_tienda: cupo de credito opcional (0 = sin limite)

Revision ID: q4f5a6b7c8d9
Revises: p3e4f5a6b7c8
Create Date: 2026-11-24 12:00:00

Idempotente: solo agrega la columna si falta. Los clientes existentes quedan sin limite (0), como hasta ahora.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "q4f5a6b7c8d9"
down_revision: Union[str, None] = "p3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columnas = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("clientes_fiado_tienda")}
    if "limite_credito" not in columnas:
        op.add_column("clientes_fiado_tienda", sa.Column("limite_credito", sa.Numeric(14, 2), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("clientes_fiado_tienda") as lote:
        lote.drop_column("limite_credito")
