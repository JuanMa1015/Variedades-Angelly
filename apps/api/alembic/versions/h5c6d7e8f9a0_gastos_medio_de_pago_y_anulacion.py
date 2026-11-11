"""gastos: medio de pago (solo el efectivo resta del cajon) y anulacion con motivo y autorizacion

Revision ID: h5c6d7e8f9a0
Revises: g4b5c6d7e8f9
Create Date: 2026-11-11 18:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "h5c6d7e8f9a0"
down_revision: Union[str, None] = "g4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("gastos") as batch:
        # Los gastos que ya existen se pagaron del cajon: quedan como efectivo.
        batch.add_column(sa.Column("medio_pago", sa.String(length=20), nullable=False, server_default="efectivo"))
        batch.add_column(sa.Column("anulado", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("anulado_en", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("anulado_por", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("autorizado_por", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("motivo_anulacion", sa.String(length=200), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("gastos") as batch:
        batch.drop_column("motivo_anulacion")
        batch.drop_column("autorizado_por")
        batch.drop_column("anulado_por")
        batch.drop_column("anulado_en")
        batch.drop_column("anulado")
        batch.drop_column("medio_pago")
