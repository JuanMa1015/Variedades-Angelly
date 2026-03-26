"""Servicios de aplicacion para el modulo de ventas."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import VentaModel


def ventas_metric_since(db: Session, start_date: datetime) -> tuple[float, int]:
    """Retorna total y cantidad de ventas desde una fecha dada."""
    total, count = db.execute(
        select(
            func.coalesce(func.sum(VentaModel.total), 0.0),
            func.count(VentaModel.id),
        ).where(VentaModel.fecha >= start_date),
    ).one()
    return float(total or 0.0), int(count or 0)


def build_recibo_text(
    venta_id: int,
    detalles: list,
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
        f"Variedades Angelly - Recibo #{venta_id}: Cliente: {cliente_label}. {detalle_label}. "
        f"Total: ${int(total)}. Saldo pendiente: ${int(saldo_pendiente)}"
    )
