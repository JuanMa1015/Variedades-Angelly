"""abonos_cartera: clave de idempotencia (repetir un cobro no duplica el abono)

Revision ID: r5a6b7c8d9e0
Revises: q4f5a6b7c8d9
Create Date: 2026-11-24 15:00:00

Idempotente: solo agrega lo que falta. Los abonos anteriores quedan con la clave en NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "r5a6b7c8d9e0"
down_revision: Union[str, None] = "q4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDICE = "ux_abonos_cartera_clave_idempotencia"


def upgrade() -> None:
    columnas = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("abonos_cartera")}
    if "clave_idempotencia" not in columnas:
        op.add_column("abonos_cartera", sa.Column("clave_idempotencia", sa.String(length=64), nullable=True))
    if "huella_idempotencia" not in columnas:
        op.add_column("abonos_cartera", sa.Column("huella_idempotencia", sa.String(length=64), nullable=True))
    if INDICE not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("abonos_cartera")}:
        op.create_index(INDICE, "abonos_cartera", ["clave_idempotencia"], unique=True)


def downgrade() -> None:
    op.drop_index(INDICE, table_name="abonos_cartera")
    with op.batch_alter_table("abonos_cartera") as lote:
        lote.drop_column("huella_idempotencia")
        lote.drop_column("clave_idempotencia")
