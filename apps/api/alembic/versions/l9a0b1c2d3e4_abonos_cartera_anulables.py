"""abonos de cartera anulables: quien, cuando y por que

Revision ID: l9a0b1c2d3e4
Revises: k8f9a0b1c2d3
Create Date: 2026-11-12 18:00:00

Idempotente: solo agrega las columnas que faltan. Los abonos existentes quedan como vigentes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "l9a0b1c2d3e4"
down_revision: Union[str, None] = "k8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columnas() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("abonos_cartera")}


def upgrade() -> None:
    existentes = _columnas()
    if "anulado" not in existentes:
        op.add_column("abonos_cartera", sa.Column("anulado", sa.Boolean(), nullable=False, server_default=sa.false()))
    if "anulado_en" not in existentes:
        op.add_column("abonos_cartera", sa.Column("anulado_en", sa.DateTime(), nullable=True))
    if "anulado_por" not in existentes:
        op.add_column("abonos_cartera", sa.Column("anulado_por", sa.String(length=50), nullable=True))
    if "motivo_anulacion" not in existentes:
        op.add_column("abonos_cartera", sa.Column("motivo_anulacion", sa.String(length=200), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("abonos_cartera") as lote:
        for columna in ("motivo_anulacion", "anulado_por", "anulado_en", "anulado"):
            lote.drop_column(columna)
