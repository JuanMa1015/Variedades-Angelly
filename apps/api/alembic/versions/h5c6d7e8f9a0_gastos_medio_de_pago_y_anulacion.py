"""gastos: medio de pago (solo el efectivo resta del cajon) y anulacion con motivo y autorizacion

Revision ID: h5c6d7e8f9a0
Revises: g4b5c6d7e8f9
Create Date: 2026-11-11 18:00:00

Idempotente: solo agrega las columnas que faltan.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "h5c6d7e8f9a0"
down_revision: Union[str, None] = "g4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNAS = {
    # Los gastos que ya existen se pagaron del cajon: quedan como efectivo.
    "medio_pago": lambda: sa.Column("medio_pago", sa.String(length=20), nullable=False, server_default="efectivo"),
    "anulado": lambda: sa.Column("anulado", sa.Boolean(), nullable=False, server_default=sa.false()),
    "anulado_en": lambda: sa.Column("anulado_en", sa.DateTime(), nullable=True),
    "anulado_por": lambda: sa.Column("anulado_por", sa.String(length=50), nullable=True),
    "autorizado_por": lambda: sa.Column("autorizado_por", sa.String(length=50), nullable=True),
    "motivo_anulacion": lambda: sa.Column("motivo_anulacion", sa.String(length=200), nullable=True),
}


def upgrade() -> None:
    existentes = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("gastos")}
    faltan = [nombre for nombre in COLUMNAS if nombre not in existentes]
    if not faltan:
        return
    with op.batch_alter_table("gastos") as batch:
        for nombre in faltan:
            batch.add_column(COLUMNAS[nombre]())


def downgrade() -> None:
    with op.batch_alter_table("gastos") as batch:
        batch.drop_column("motivo_anulacion")
        batch.drop_column("autorizado_por")
        batch.drop_column("anulado_por")
        batch.drop_column("anulado_en")
        batch.drop_column("anulado")
        batch.drop_column("medio_pago")
