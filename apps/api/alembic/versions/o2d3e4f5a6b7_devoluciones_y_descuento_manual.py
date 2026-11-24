"""ventas: devoluciones parciales y descuento manual

Revision ID: o2d3e4f5a6b7
Revises: n1c2d3e4f5a6
Create Date: 2026-11-23 15:00:00

Idempotente: solo crea o agrega lo que falta (una base que arranco en desarrollo ya puede tenerlo).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "o2d3e4f5a6b7"
down_revision: Union[str, None] = "n1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _dinero_cero() -> sa.Column:
    return sa.Numeric(14, 2)


def _agregar(tabla: str, columna: sa.Column) -> None:
    existentes = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(tabla)}
    if columna.name not in existentes:
        op.add_column(tabla, columna)


def _indice(tabla: str, nombre: str, columnas: list[str]) -> None:
    if nombre not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(tabla)}:
        op.create_index(nombre, tabla, columnas)


def upgrade() -> None:
    _agregar("ventas", sa.Column("descuento_manual", sa.Numeric(14, 2), nullable=False, server_default="0"))
    _agregar("ventas", sa.Column("descuento_manual_motivo", sa.String(length=200), nullable=True))
    _agregar("ventas", sa.Column("descuento_autorizado_por", sa.String(length=50), nullable=True))
    _agregar("ventas", sa.Column("total_devuelto", sa.Numeric(14, 2), nullable=False, server_default="0"))
    _agregar("ventas", sa.Column("deuda_reducida", sa.Numeric(14, 2), nullable=False, server_default="0"))
    _agregar("detalle_ventas", sa.Column("cantidad_devuelta", sa.Integer(), nullable=False, server_default="0"))

    tablas = set(sa.inspect(op.get_bind()).get_table_names())
    if "devoluciones_venta" not in tablas:
        op.create_table(
            "devoluciones_venta",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("venta_id", sa.Integer(), sa.ForeignKey("ventas.id"), nullable=False),
            sa.Column("fecha", sa.DateTime(), nullable=False),
            sa.Column("registrado_por", sa.String(length=50), nullable=False),
            sa.Column("autorizado_por", sa.String(length=50), nullable=False),
            sa.Column("motivo", sa.String(length=200), nullable=False),
            sa.Column("total_devuelto", sa.Numeric(14, 2), nullable=False),
            sa.Column("monto_reembolsado", sa.Numeric(14, 2), nullable=False, server_default="0"),
            sa.Column("deuda_reducida", sa.Numeric(14, 2), nullable=False, server_default="0"),
            sa.Column("metodo_pago", sa.String(length=20), nullable=True),
            sa.Column("caja_id", sa.Integer(), sa.ForeignKey("cierres_caja.id", ondelete="SET NULL"), nullable=True),
            sa.Column("puntos_revertidos", sa.Integer(), nullable=False, server_default="0"),
        )
    _indice("devoluciones_venta", "ix_devoluciones_venta_venta", ["venta_id"])
    _indice("devoluciones_venta", "ix_devoluciones_venta_caja", ["caja_id"])

    if "devoluciones_venta_detalle" not in set(sa.inspect(op.get_bind()).get_table_names()):
        op.create_table(
            "devoluciones_venta_detalle",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("devolucion_id", sa.Integer(), sa.ForeignKey("devoluciones_venta.id"), nullable=False),
            sa.Column("detalle_venta_id", sa.Integer(), sa.ForeignKey("detalle_ventas.id"), nullable=False),
            sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id"), nullable=False),
            sa.Column("nombre_producto", sa.String(length=120), nullable=False),
            sa.Column("cantidad", sa.Integer(), nullable=False),
            sa.Column("valor", sa.Numeric(14, 2), nullable=False),
        )
    _indice("devoluciones_venta_detalle", "ix_devoluciones_detalle_devolucion", ["devolucion_id"])


def downgrade() -> None:
    op.drop_index("ix_devoluciones_detalle_devolucion", table_name="devoluciones_venta_detalle")
    op.drop_table("devoluciones_venta_detalle")
    op.drop_index("ix_devoluciones_venta_caja", table_name="devoluciones_venta")
    op.drop_index("ix_devoluciones_venta_venta", table_name="devoluciones_venta")
    op.drop_table("devoluciones_venta")
    with op.batch_alter_table("detalle_ventas") as lote:
        lote.drop_column("cantidad_devuelta")
    with op.batch_alter_table("ventas") as lote:
        for columna in ("deuda_reducida", "total_devuelto", "descuento_autorizado_por", "descuento_manual_motivo", "descuento_manual"):
            lote.drop_column(columna)
