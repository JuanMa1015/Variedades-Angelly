"""cartera fuera de la caja del vendedor y abono inicial enlazado a su venta

Revision ID: k8f9a0b1c2d3
Revises: j7e8f9a0b1c2
Create Date: 2026-11-12 14:00:00

Idempotente: solo agrega lo que falta. Las ventas con cliente de cartera que no tienen ``creado_por`` son las
del modulo de cartera (el punto de venta siempre lo guarda): se marcan fuera de caja. No cambia ningun total
porque el dinero de una venta de cartera entra por sus abonos, y los abonos existentes no se tocan.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "k8f9a0b1c2d3"
down_revision: Union[str, None] = "j7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDICE_VENTA = "ix_abonos_cartera_venta_id"


def _columnas(tabla: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(tabla)}


def upgrade() -> None:
    falso = sa.false()
    if "fuera_de_caja" not in _columnas("ventas"):
        op.add_column("ventas", sa.Column("fuera_de_caja", sa.Boolean(), nullable=False, server_default=falso))
        op.execute(sa.text("UPDATE ventas SET fuera_de_caja = :v WHERE cliente_id IS NOT NULL AND creado_por IS NULL").bindparams(v=True))
    if "fuera_de_caja" not in _columnas("abonos_cartera"):
        op.add_column("abonos_cartera", sa.Column("fuera_de_caja", sa.Boolean(), nullable=False, server_default=falso))
    if "venta_id" not in _columnas("abonos_cartera"):
        with op.batch_alter_table("abonos_cartera") as lote:
            lote.add_column(sa.Column("venta_id", sa.Integer(), nullable=True))
            lote.create_foreign_key("fk_abonos_cartera_venta_id", "ventas", ["venta_id"], ["id"], ondelete="SET NULL")
    indices = {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("abonos_cartera")}
    if INDICE_VENTA not in indices:
        op.create_index(INDICE_VENTA, "abonos_cartera", ["venta_id"])


def downgrade() -> None:
    indices = {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("abonos_cartera")}
    if INDICE_VENTA in indices:
        op.drop_index(INDICE_VENTA, table_name="abonos_cartera")
    with op.batch_alter_table("abonos_cartera") as lote:
        lote.drop_constraint("fk_abonos_cartera_venta_id", type_="foreignkey")
        lote.drop_column("venta_id")
        lote.drop_column("fuera_de_caja")
    with op.batch_alter_table("ventas") as lote:
        lote.drop_column("fuera_de_caja")
