"""pedidos_proveedor.descripcion: de 255 a 1000 caracteres para pedidos con muchos productos

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-11-11 15:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pedidos_proveedor") as batch:
        batch.alter_column(
            "descripcion",
            existing_type=sa.String(length=255),
            type_=sa.String(length=1000),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("pedidos_proveedor") as batch:
        batch.alter_column(
            "descripcion",
            existing_type=sa.String(length=1000),
            type_=sa.String(length=255),
            existing_nullable=False,
        )
