"""add_check_constraints_for_non_negative

Revision ID: 683d65d3108c
Revises: 2b3c4d5e6f7a
Create Date: 2026-05-23 00:29:49.891115

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '683d65d3108c'
down_revision: Union[str, None] = '2b3c4d5e6f7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Cliente
    op.create_check_constraint("ck_cliente_limite_credito", "clientes", sa.text("limite_credito >= 0"))
    op.create_check_constraint("ck_cliente_deuda_total", "clientes", sa.text("deuda_total >= 0"))

    # Producto
    op.create_check_constraint("ck_producto_precio_costo", "productos", sa.text("precio_costo >= 0"))
    op.create_check_constraint("ck_producto_precio_venta", "productos", sa.text("precio_venta >= 0"))
    op.create_check_constraint("ck_producto_stock_actual", "productos", sa.text("stock_actual >= 0"))
    op.create_check_constraint("ck_producto_stock_minimo", "productos", sa.text("stock_minimo >= 0"))

    # Venta
    op.create_check_constraint("ck_venta_total", "ventas", sa.text("total >= 0"))
    op.create_check_constraint("ck_venta_saldo_pendiente", "ventas", sa.text("saldo_pendiente >= 0"))

    # DetalleVenta
    op.create_check_constraint("ck_detalle_venta_cantidad", "detalle_ventas", sa.text("cantidad > 0"))
    op.create_check_constraint("ck_detalle_venta_precio_unitario", "detalle_ventas", sa.text("precio_unitario >= 0"))
    op.create_check_constraint("ck_detalle_venta_subtotal", "detalle_ventas", sa.text("subtotal >= 0"))

    # PedidoProveedor
    op.create_check_constraint("ck_pedido_monto_estimado", "pedidos_proveedor", sa.text("monto_estimado >= 0"))

    # FacturaCompra
    op.create_check_constraint("ck_factura_subtotal", "facturas_compra", sa.text("subtotal >= 0"))
    op.create_check_constraint("ck_factura_total_iva", "facturas_compra", sa.text("total_iva >= 0"))
    op.create_check_constraint("ck_factura_total", "facturas_compra", sa.text("total_factura >= 0"))

    # FacturaCompraDetalle
    op.create_check_constraint("ck_factura_detalle_cantidad", "factura_compra_detalles", sa.text("cantidad > 0"))
    op.create_check_constraint("ck_factura_detalle_precio_unitario", "factura_compra_detalles", sa.text("precio_unitario >= 0"))
    op.create_check_constraint("ck_factura_detalle_precio_total", "factura_compra_detalles", sa.text("precio_total >= 0"))

    # Gasto
    op.create_check_constraint("ck_gasto_monto", "gastos", sa.text("monto > 0"))

    # AbonoCartera
    op.create_check_constraint("ck_abono_monto", "abonos_cartera", sa.text("monto > 0"))
    op.create_check_constraint("ck_abono_saldo_cliente", "abonos_cartera", sa.text("saldo_cliente >= 0"))

    # CierreCaja
    op.create_check_constraint("ck_caja_monto_inicial", "cierres_caja", sa.text("monto_inicial >= 0"))
    op.create_check_constraint("ck_caja_monto_ventas_efectivo", "cierres_caja", sa.text("monto_ventas_efectivo >= 0"))
    op.create_check_constraint("ck_caja_monto_ventas_transferencia", "cierres_caja", sa.text("monto_ventas_transferencia >= 0"))
    op.create_check_constraint("ck_caja_monto_gastos", "cierres_caja", sa.text("monto_gastos >= 0"))

    # MovimientoInventario
    op.create_check_constraint("ck_movimiento_cantidad", "movimientos_inventario", sa.text("cantidad > 0"))

    # Devolucion
    op.create_check_constraint("ck_devolucion_cantidad", "devoluciones", sa.text("cantidad > 0"))
    op.create_check_constraint("ck_devolucion_monto_devuelto", "devoluciones", sa.text("monto_devuelto >= 0"))


def downgrade() -> None:
    op.drop_constraint("ck_cliente_limite_credito", "clientes", type_="check")
    op.drop_constraint("ck_cliente_deuda_total", "clientes", type_="check")
    op.drop_constraint("ck_producto_precio_costo", "productos", type_="check")
    op.drop_constraint("ck_producto_precio_venta", "productos", type_="check")
    op.drop_constraint("ck_producto_stock_actual", "productos", type_="check")
    op.drop_constraint("ck_producto_stock_minimo", "productos", type_="check")
    op.drop_constraint("ck_venta_total", "ventas", type_="check")
    op.drop_constraint("ck_venta_saldo_pendiente", "ventas", type_="check")
    op.drop_constraint("ck_detalle_venta_cantidad", "detalle_ventas", type_="check")
    op.drop_constraint("ck_detalle_venta_precio_unitario", "detalle_ventas", type_="check")
    op.drop_constraint("ck_detalle_venta_subtotal", "detalle_ventas", type_="check")
    op.drop_constraint("ck_pedido_monto_estimado", "pedidos_proveedor", type_="check")
    op.drop_constraint("ck_factura_subtotal", "facturas_compra", type_="check")
    op.drop_constraint("ck_factura_total_iva", "facturas_compra", type_="check")
    op.drop_constraint("ck_factura_total", "facturas_compra", type_="check")
    op.drop_constraint("ck_factura_detalle_cantidad", "factura_compra_detalles", type_="check")
    op.drop_constraint("ck_factura_detalle_precio_unitario", "factura_compra_detalles", type_="check")
    op.drop_constraint("ck_factura_detalle_precio_total", "factura_compra_detalles", type_="check")
    op.drop_constraint("ck_gasto_monto", "gastos", type_="check")
    op.drop_constraint("ck_abono_monto", "abonos_cartera", type_="check")
    op.drop_constraint("ck_abono_saldo_cliente", "abonos_cartera", type_="check")
    op.drop_constraint("ck_caja_monto_inicial", "cierres_caja", type_="check")
    op.drop_constraint("ck_caja_monto_ventas_efectivo", "cierres_caja", type_="check")
    op.drop_constraint("ck_caja_monto_ventas_transferencia", "cierres_caja", type_="check")
    op.drop_constraint("ck_caja_monto_gastos", "cierres_caja", type_="check")
    op.drop_constraint("ck_movimiento_cantidad", "movimientos_inventario", type_="check")
    op.drop_constraint("ck_devolucion_cantidad", "devoluciones", type_="check")
    op.drop_constraint("ck_devolucion_monto_devuelto", "devoluciones", type_="check")
