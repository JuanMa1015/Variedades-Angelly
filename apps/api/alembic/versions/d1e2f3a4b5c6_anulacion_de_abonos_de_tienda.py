"""abonos_tienda: anulacion con motivo, responsable y autorizacion

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-11-11 09:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c0d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("abonos_tienda") as batch:
        batch.add_column(sa.Column("anulado", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("anulado_en", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("anulado_por", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("autorizado_por", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("motivo_anulacion", sa.String(length=200), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("abonos_tienda") as batch:
        batch.drop_column("motivo_anulacion")
        batch.drop_column("autorizado_por")
        batch.drop_column("anulado_por")
        batch.drop_column("anulado_en")
        batch.drop_column("anulado")
