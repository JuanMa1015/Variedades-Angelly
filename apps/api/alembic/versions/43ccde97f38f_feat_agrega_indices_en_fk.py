"""feat: agrega indices en columnas FK para mejorar performance

Revision ID: 43ccde97f38f
Revises: f7e8d9c0b1a2
Create Date: 2026-05-25 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "43ccde97f38f"
down_revision: Union[str, None] = "f7e8d9c0b1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- ventas ---
    op.create_index(op.f("ix_ventas_cliente_id"), "ventas", ["cliente_id"])
    op.create_index(op.f("ix_ventas_usuario_id"), "ventas", ["usuario_id"])

    # --- detalle_ventas ---
    op.create_index(op.f("ix_detalle_ventas_venta_id"), "detalle_ventas", ["venta_id"])
    op.create_index(op.f("ix_detalle_ventas_producto_id"), "detalle_ventas", ["producto_id"])

    # --- clientes_cartera ---
    op.create_index(op.f("ix_clientes_cartera_cliente_id"), "clientes_cartera", ["cliente_id"])

    # --- abonos_cartera ---
    op.create_index(op.f("ix_abonos_cartera_cliente_id"), "abonos_cartera", ["cliente_id"])
    op.create_index(op.f("ix_abonos_cartera_usuario_id"), "abonos_cartera", ["usuario_id"])

    # --- facturas_compra ---
    op.create_index(op.f("ix_facturas_compra_proveedor_id"), "facturas_compra", ["proveedor_id"])

    # --- factura_compra_detalles ---
    op.create_index(
        op.f("ix_factura_compra_detalles_factura_id"),
        "factura_compra_detalles",
        ["factura_id"],
    )
    op.create_index(
        op.f("ix_factura_compra_detalles_producto_id"),
        "factura_compra_detalles",
        ["producto_id"],
    )

    # --- pedidos_proveedor ---
    op.create_index(op.f("ix_pedidos_proveedor_proveedor_id"), "pedidos_proveedor", ["proveedor_id"])

    # --- gastos ---
    op.create_index(op.f("ix_gastos_categoria_id"), "gastos", ["categoria_id"])
    op.create_index(op.f("ix_gastos_usuario_id"), "gastos", ["usuario_id"])

    # --- cierres_caja ---
    op.create_index(op.f("ix_cierres_caja_usuario_id"), "cierres_caja", ["usuario_id"])

    # --- auditorias ---
    op.create_index(op.f("ix_auditorias_usuario_id"), "auditorias", ["usuario_id"])

    # --- clientes_fiado_tienda ---
    op.create_index(op.f("ix_clientes_fiado_tienda_cliente_id"), "clientes_fiado_tienda", ["cliente_id"])

    # --- movimientos_inventario ---
    op.create_index(
        op.f("ix_movimientos_inventario_producto_id"),
        "movimientos_inventario",
        ["producto_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_movimientos_inventario_producto_id"), table_name="movimientos_inventario")
    op.drop_index(op.f("ix_clientes_fiado_tienda_cliente_id"), table_name="clientes_fiado_tienda")
    op.drop_index(op.f("ix_auditorias_usuario_id"), table_name="auditorias")
    op.drop_index(op.f("ix_cierres_caja_usuario_id"), table_name="cierres_caja")
    op.drop_index(op.f("ix_gastos_usuario_id"), table_name="gastos")
    op.drop_index(op.f("ix_gastos_categoria_id"), table_name="gastos")
    op.drop_index(op.f("ix_pedidos_proveedor_proveedor_id"), table_name="pedidos_proveedor")
    op.drop_index(op.f("ix_factura_compra_detalles_producto_id"), table_name="factura_compra_detalles")
    op.drop_index(op.f("ix_factura_compra_detalles_factura_id"), table_name="factura_compra_detalles")
    op.drop_index(op.f("ix_facturas_compra_proveedor_id"), table_name="facturas_compra")
    op.drop_index(op.f("ix_abonos_cartera_usuario_id"), table_name="abonos_cartera")
    op.drop_index(op.f("ix_abonos_cartera_cliente_id"), table_name="abonos_cartera")
    op.drop_index(op.f("ix_clientes_cartera_cliente_id"), table_name="clientes_cartera")
    op.drop_index(op.f("ix_detalle_ventas_producto_id"), table_name="detalle_ventas")
    op.drop_index(op.f("ix_detalle_ventas_venta_id"), table_name="detalle_ventas")
    op.drop_index(op.f("ix_ventas_usuario_id"), table_name="ventas")
    op.drop_index(op.f("ix_ventas_cliente_id"), table_name="ventas")
