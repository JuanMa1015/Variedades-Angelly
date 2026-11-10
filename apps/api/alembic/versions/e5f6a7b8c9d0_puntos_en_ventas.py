"""ventas: cliente de fidelizacion y puntos otorgados

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-09 21:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ventas") as batch:
        batch.add_column(sa.Column("cliente_fidelizacion_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("puntos_otorgados", sa.Integer(), nullable=False, server_default="0"))
        batch.create_foreign_key(
            "fk_ventas_cliente_fidelizacion",
            "clientes_fidelizacion",
            ["cliente_fidelizacion_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("ventas") as batch:
        batch.drop_constraint("fk_ventas_cliente_fidelizacion", type_="foreignkey")
        batch.drop_column("puntos_otorgados")
        batch.drop_column("cliente_fidelizacion_id")
