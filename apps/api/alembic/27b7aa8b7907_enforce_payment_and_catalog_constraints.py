"""enforce_payment_and_catalog_constraints

Revision ID: 27b7aa8b7907
Revises: 73b065969db9
Create Date: 2026-04-09 22:14:30.207467

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '27b7aa8b7907'
down_revision: Union[str, None] = '73b065969db9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Normaliza datos legacy antes de endurecer constraints.
    op.execute(
        "UPDATE productos "
        "SET catalogo = 'tienda' "
        "WHERE catalogo IS NULL OR catalogo NOT IN ('tienda', 'cartera');",
    )
    op.execute(
        "UPDATE ventas "
        "SET metodo_pago = NULL "
        "WHERE metodo_pago IS NOT NULL "
        "AND metodo_pago NOT IN ('efectivo', 'transferencia');",
    )
    op.execute(
        "UPDATE abonos_cartera "
        "SET metodo_pago = NULL "
        "WHERE metodo_pago IS NOT NULL "
        "AND metodo_pago NOT IN ('efectivo', 'transferencia');",
    )

    op.execute("ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_catalogo_valido;")
    op.execute("ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ck_ventas_metodo_pago_valido;")
    op.execute("ALTER TABLE abonos_cartera DROP CONSTRAINT IF EXISTS ck_abonos_metodo_pago_valido;")
    op.execute("ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_stock_no_negativo;")

    op.execute(
        "ALTER TABLE productos "
        "ADD CONSTRAINT ck_productos_catalogo_valido "
        "CHECK (catalogo IN ('tienda', 'cartera'));",
    )
    op.execute(
        "ALTER TABLE productos "
        "ADD CONSTRAINT ck_productos_stock_no_negativo "
        "CHECK (stock_actual >= 0 AND stock_minimo >= 0);",
    )
    op.execute(
        "ALTER TABLE ventas "
        "ADD CONSTRAINT ck_ventas_metodo_pago_valido "
        "CHECK (metodo_pago IS NULL OR metodo_pago IN ('efectivo', 'transferencia'));",
    )
    op.execute(
        "ALTER TABLE abonos_cartera "
        "ADD CONSTRAINT ck_abonos_metodo_pago_valido "
        "CHECK (metodo_pago IS NULL OR metodo_pago IN ('efectivo', 'transferencia'));",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE abonos_cartera DROP CONSTRAINT IF EXISTS ck_abonos_metodo_pago_valido;")
    op.execute("ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ck_ventas_metodo_pago_valido;")
    op.execute("ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_stock_no_negativo;")
    op.execute("ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_catalogo_valido;")
