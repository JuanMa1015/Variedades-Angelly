"""usuarios: sesiones_desde (cerrar las sesiones abiertas al cambiar la clave o desactivar)

Revision ID: m0b1c2d3e4f5
Revises: l9a0b1c2d3e4
Create Date: 2026-11-12 20:00:00

Idempotente: solo agrega la columna si falta. Un token emitido antes de ``sesiones_desde`` deja de valer.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "m0b1c2d3e4f5"
down_revision: Union[str, None] = "l9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columnas = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("usuarios")}
    if "sesiones_desde" not in columnas:
        op.add_column("usuarios", sa.Column("sesiones_desde", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("usuarios") as lote:
        lote.drop_column("sesiones_desde")
