"""Servicios de aplicacion para el modulo de ventas."""

from __future__ import annotations

from typing import Protocol


class ReciboDetalle(Protocol):
    """Contrato minimo para construir lineas de recibo."""

    cantidad: int
    nombre_producto: str
    subtotal: float


def build_recibo_text(
    venta_id: int,
    detalles: list[ReciboDetalle],
    total: float,
    saldo_pendiente: float,
    cliente_nombre: str | None,
) -> str:
    """Construye resumen textual para mostrar o enviar por WhatsApp."""
    lineas = ", ".join(
        f"{detalle.cantidad} {detalle.nombre_producto} (${int(detalle.subtotal)})"
        for detalle in detalles
    )
    cliente_label = cliente_nombre or "Mostrador"
    detalle_label = lineas or "Sin productos"
    return (
        f"Tienda Angelly - Recibo #{venta_id}: Cliente: {cliente_label}. {detalle_label}. "
        f"Total: ${int(total)}. Saldo pendiente: ${int(saldo_pendiente)}"
    )
