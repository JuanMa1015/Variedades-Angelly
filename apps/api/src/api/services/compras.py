"""Efectos de una factura de compra sobre el inventario (stock, costo y precio de venta)."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable

from fastapi import HTTPException

from src.infrastructure.database.models import FacturaCompraDetalleModel, ProductoModel

PASO_REDONDEO_PRECIO = 50


def redondear_precio_venta(valor: float) -> float:
    """Sube el precio al siguiente multiplo de $50 (evita precios como $3.847)."""
    return float(math.ceil(round(valor, 6) / PASO_REDONDEO_PRECIO) * PASO_REDONDEO_PRECIO)


def costo_unitario(precio_unitario: float, aplica_iva: bool, iva_rate: float) -> float:
    """Lo que realmente cuesta cada unidad: el precio de la factura mas IVA cuando aplica."""
    return round(precio_unitario * (1 + iva_rate), 2) if aplica_iva else round(precio_unitario, 2)


def aplicar_compra_a_producto(
    producto: ProductoModel,
    *,
    cantidad: int,
    costo: float,
    nuevo_precio_venta: float | None,
) -> dict[str, float]:
    """Suma el stock comprado, deja el ultimo costo y, si se pidio, el nuevo precio de venta.

    Retorna los valores anteriores para poder auditar el cambio.
    """
    anteriores = {"costo": float(producto.precio_costo), "venta": float(producto.precio_venta)}
    producto.stock_actual = int(producto.stock_actual) + cantidad
    producto.precio_costo = costo
    if nuevo_precio_venta is not None:
        producto.precio_venta = nuevo_precio_venta
    return anteriores


def revertir_stock_de_factura(
    detalles: Iterable[FacturaCompraDetalleModel],
    productos: dict[int, ProductoModel],
) -> None:
    """Resta el stock que sumo la factura. Si ya se vendio parte, no deja stock negativo."""
    por_producto: dict[int, int] = defaultdict(int)
    for detalle in detalles:
        por_producto[detalle.producto_id] += int(detalle.cantidad)

    faltantes = [
        f"{productos[pid].nombre} (stock {productos[pid].stock_actual}, la factura sumo {cantidad})"
        for pid, cantidad in por_producto.items()
        if pid in productos and productos[pid].stock_actual < cantidad
    ]
    if faltantes:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: ya se vendio parte de esta compra. " + "; ".join(faltantes),
        )

    for pid, cantidad in por_producto.items():
        if pid in productos:
            productos[pid].stock_actual = int(productos[pid].stock_actual) - cantidad
