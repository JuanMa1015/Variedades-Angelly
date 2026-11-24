"""ventas: clave de idempotencia (repetir un cobro no duplica la venta)

Revision ID: n1c2d3e4f5a6
Revises: m0b1c2d3e4f5
Create Date: 2026-11-23 12:00:00

Idempotente: solo agrega lo que falta. Las ventas anteriores quedan con la clave en NULL (varias filas con NULL
no chocan en el indice unico).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "n1c2d3e4f5a6"
down_revision: Union[str, None] = "m0b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDICE = "ux_ventas_clave_idempotencia"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columnas = {c["name"] for c in inspector.get_columns("ventas")}
    if "clave_idempotencia" not in columnas:
        op.add_column("ventas", sa.Column("clave_idempotencia", sa.String(length=64), nullable=True))
    if "huella_idempotencia" not in columnas:
        op.add_column("ventas", sa.Column("huella_idempotencia", sa.String(length=64), nullable=True))
    if INDICE not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("ventas")}:
        op.create_index(INDICE, "ventas", ["creado_por", "clave_idempotencia"], unique=True)


def downgrade() -> None:
    op.drop_index(INDICE, table_name="ventas")
    with op.batch_alter_table("ventas") as lote:
        lote.drop_column("huella_idempotencia")
        lote.drop_column("clave_idempotencia")
