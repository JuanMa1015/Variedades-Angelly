"""turno de caja en ventas/abonos/gastos y ventas por tarjeta en el cierre

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-10 09:00:00

- ``caja_id``: cada venta, abono y gasto queda asociado al turno de caja en que se registro.
- ``cierres_caja.monto_ventas_tarjeta``: la tarjeta se separa de la transferencia.
- Se asocian al turno abierto (si lo hay) las operaciones hechas desde su apertura.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLAS_CON_TURNO = ("ventas", "abonos_cartera", "abonos_tienda", "gastos")


def upgrade() -> None:
    with op.batch_alter_table("cierres_caja") as batch:
        batch.add_column(
            sa.Column("monto_ventas_tarjeta", sa.Numeric(14, 2), nullable=False, server_default="0"),
        )

    for tabla in TABLAS_CON_TURNO:
        with op.batch_alter_table(tabla) as batch:
            batch.add_column(sa.Column("caja_id", sa.Integer(), nullable=True))
            batch.create_foreign_key(f"fk_{tabla}_caja", "cierres_caja", ["caja_id"], ["id"], ondelete="SET NULL")
        op.create_index(f"ix_{tabla}_caja_id", tabla, ["caja_id"])

    # La caja abierta hoy no pierde lo vendido desde que se abrio.
    for tabla in TABLAS_CON_TURNO:
        op.execute(
            sa.text(
                f"UPDATE {tabla} SET caja_id = ("
                "SELECT id FROM cierres_caja WHERE fecha_cierre IS NULL ORDER BY id DESC LIMIT 1) "
                "WHERE fecha >= ("
                "SELECT fecha_apertura FROM cierres_caja WHERE fecha_cierre IS NULL ORDER BY id DESC LIMIT 1)",
            ),
        )


def downgrade() -> None:
    for tabla in TABLAS_CON_TURNO:
        op.drop_index(f"ix_{tabla}_caja_id", table_name=tabla)
        with op.batch_alter_table(tabla) as batch:
            batch.drop_constraint(f"fk_{tabla}_caja", type_="foreignkey")
            batch.drop_column("caja_id")

    with op.batch_alter_table("cierres_caja") as batch:
        batch.drop_column("monto_ventas_tarjeta")
