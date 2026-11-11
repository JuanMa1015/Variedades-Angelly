"""Unico lugar donde cambia el stock de un producto: cada cambio deja su movimiento (quien, cuanto y por que)."""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException

from src.infrastructure.database.models import MovimientoStockModel, ProductoModel

TipoMovimiento = Literal[
    "stock_inicial",
    "venta",
    "venta_cartera",
    "anulacion_venta",
    "eliminacion_venta",
    "factura_compra",
    "eliminacion_factura",
    "ajuste",
]

ModoAjuste = Literal["sumar", "restar", "contar"]
MotivoAjuste = Literal["ingreso_sin_factura", "conteo", "merma", "dano", "devolucion_proveedor", "correccion", "otro"]

# Que motivos tienen sentido para cada modo de ajuste: no se "cuenta" por merma ni se "suma" por daño.
MOTIVOS_POR_MODO: dict[str, tuple[str, ...]] = {
    "sumar": ("ingreso_sin_factura", "correccion", "otro"),
    "restar": ("merma", "dano", "devolucion_proveedor", "correccion", "otro"),
    "contar": ("conteo",),
}

ETIQUETA_MOTIVO = {
    "ingreso_sin_factura": "Ingreso sin factura",
    "conteo": "Conteo fisico",
    "merma": "Merma",
    "dano": "Producto danado",
    "devolucion_proveedor": "Devolucion al proveedor",
    "correccion": "Correccion",
    "otro": "Otro",
}


def mover_stock(
    db,
    producto: ProductoModel,
    delta: int,
    *,
    tipo: TipoMovimiento,
    usuario: str,
    motivo: str | None = None,
    referencia_tipo: str | None = None,
    referencia_id: int | None = None,
) -> MovimientoStockModel:
    """Suma ``delta`` al stock del producto (bloqueado por quien llama) y registra el movimiento."""
    nuevo = int(producto.stock_actual) + int(delta)
    if nuevo < 0:
        raise HTTPException(status_code=400, detail=f"El stock no puede quedar negativo: '{producto.nombre}' tiene {int(producto.stock_actual)} unidades")
    producto.stock_actual = nuevo
    movimiento = MovimientoStockModel(
        producto_id=producto.id,
        tipo=tipo,
        delta=int(delta),
        stock_resultante=nuevo,
        motivo=motivo,
        usuario=usuario,
        referencia_tipo=referencia_tipo,
        referencia_id=referencia_id,
    )
    db.add(movimiento)
    return movimiento
