"""pedidos_proveedor: quien lo resolvio, nota y factura que lo cumplio (estados recibido/cancelado)

Revision ID: g4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-11-11 16:00:00

Idempotente: solo agrega lo que falta (una base que arranco con la app en desarrollo ya puede tenerlo).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "g4b5c6d7e8f9"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existentes = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("pedidos_proveedor")}
    with op.batch_alter_table("pedidos_proveedor") as batch:
        if "resuelto_por" not in existentes:
            batch.add_column(sa.Column("resuelto_por", sa.String(length=50), nullable=True))
        if "nota" not in existentes:
            batch.add_column(sa.Column("nota", sa.String(length=200), nullable=True))
        if "factura_id" not in existentes:
            batch.add_column(sa.Column("factura_id", sa.Integer(), nullable=True))
            batch.create_foreign_key("fk_pedidos_proveedor_factura", "facturas_compra", ["factura_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("pedidos_proveedor") as batch:
        batch.drop_constraint("fk_pedidos_proveedor_factura", type_="foreignkey")
        batch.drop_column("factura_id")
        batch.drop_column("nota")
        batch.drop_column("resuelto_por")
