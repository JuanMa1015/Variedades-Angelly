"""facturas_compra: medio de pago, turno de caja y anulacion con motivo y autorizacion

Revision ID: i6d7e8f9a0b1
Revises: h5c6d7e8f9a0
Create Date: 2026-11-11 20:00:00

Idempotente: solo agrega lo que falta. Las facturas que ya existen quedan sin dato de pago (NULL): no tocan la caja.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "i6d7e8f9a0b1"
down_revision: Union[str, None] = "h5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNAS = {
    "medio_pago": lambda: sa.Column("medio_pago", sa.String(length=20), nullable=True),
    "anulada": lambda: sa.Column("anulada", sa.Boolean(), nullable=False, server_default=sa.false()),
    "anulada_en": lambda: sa.Column("anulada_en", sa.DateTime(), nullable=True),
    "anulada_por": lambda: sa.Column("anulada_por", sa.String(length=50), nullable=True),
    "autorizada_por": lambda: sa.Column("autorizada_por", sa.String(length=50), nullable=True),
    "motivo_anulacion": lambda: sa.Column("motivo_anulacion", sa.String(length=200), nullable=True),
}


def upgrade() -> None:
    existentes = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("facturas_compra")}
    with op.batch_alter_table("facturas_compra") as batch:
        for nombre, columna in COLUMNAS.items():
            if nombre not in existentes:
                batch.add_column(columna())
        if "caja_id" not in existentes:
            batch.add_column(sa.Column("caja_id", sa.Integer(), nullable=True))
            batch.create_foreign_key("fk_facturas_compra_caja", "cierres_caja", ["caja_id"], ["id"], ondelete="SET NULL")
            batch.create_index("ix_facturas_compra_caja_id", ["caja_id"])


def downgrade() -> None:
    with op.batch_alter_table("facturas_compra") as batch:
        batch.drop_index("ix_facturas_compra_caja_id")
        batch.drop_constraint("fk_facturas_compra_caja", type_="foreignkey")
        batch.drop_column("motivo_anulacion")
        batch.drop_column("autorizada_por")
        batch.drop_column("anulada_por")
        batch.drop_column("anulada_en")
        batch.drop_column("anulada")
        batch.drop_column("caja_id")
        batch.drop_column("medio_pago")
