"""dinero a NUMERIC(14,2)

Revision ID: d4e5f6a7b8c9
Revises: 3e51986812ce
Create Date: 2026-11-09 20:00:00

Los montos pasan de FLOAT (binario, acumula errores de redondeo) a NUMERIC(14,2).
Solo aplica en PostgreSQL; SQLite (pruebas) ya guarda los valores con afinidad numerica.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "3e51986812ce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNAS_DINERO: dict[str, tuple[str, ...]] = {
    "clientes": ("limite_credito", "deuda_total"),
    "clientes_fiado_tienda": ("deuda_total",),
    "productos": ("precio_costo", "precio_venta"),
    "ventas": ("total", "saldo_pendiente"),
    "detalle_ventas": ("precio_unitario", "subtotal"),
    "pedidos_proveedor": ("monto_estimado",),
    "facturas_compra": ("subtotal", "total_iva", "total_factura", "encomienda"),
    "factura_compra_detalles": ("precio_unitario", "precio_total", "precio_venta_sugerido", "ganancia_estimada"),
    "gastos": ("monto",),
    "abonos_cartera": ("monto", "saldo_cliente"),
    "abonos_tienda": ("monto", "saldo_cliente"),
    "cierres_caja": (
        "monto_inicial",
        "monto_ventas_efectivo",
        "monto_ventas_transferencia",
        "monto_gastos",
        "monto_efectivo_real",
        "esperado_vs_real",
        "monto_cierre",
    ),
}


def _es_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not _es_postgres():
        return
    for tabla, columnas in COLUMNAS_DINERO.items():
        for columna in columnas:
            op.alter_column(
                tabla,
                columna,
                type_=sa.Numeric(14, 2),
                existing_type=sa.Float(),
                postgresql_using=f"ROUND({columna}::numeric, 2)",
            )


def downgrade() -> None:
    if not _es_postgres():
        return
    for tabla, columnas in COLUMNAS_DINERO.items():
        for columna in columnas:
            op.alter_column(
                tabla,
                columna,
                type_=sa.Float(),
                existing_type=sa.Numeric(14, 2),
                postgresql_using=f"{columna}::double precision",
            )
