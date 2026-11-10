"""ventas: anulacion con motivo, responsable y autorizacion

Revision ID: a8b9c0d1e2f3
Revises: f6a7b8c9d0e1
Create Date: 2026-11-10 10:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ventas") as batch:
        batch.add_column(sa.Column("anulada", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("anulada_en", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("anulada_por", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("autorizada_por", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("motivo_anulacion", sa.String(length=200), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ventas") as batch:
        batch.drop_column("motivo_anulacion")
        batch.drop_column("autorizada_por")
        batch.drop_column("anulada_por")
        batch.drop_column("anulada_en")
        batch.drop_column("anulada")
