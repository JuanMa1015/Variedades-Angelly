"""Calculos de caja compartidos por los routers de caja y de superadmin."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import GastoModel
from src.infrastructure.repositories.ingresos import cobros_por_metodo


@dataclass(frozen=True)
class MetricasCaja:
    """Dinero cobrado y gastado durante un turno, separado por medio de pago."""

    efectivo: float = 0.0
    transferencia: float = 0.0
    tarjeta: float = 0.0
    gastos: float = 0.0


def efectivo_esperado(monto_inicial: float, ventas_efectivo: float, gastos: float) -> float:
    """Efectivo que debe haber en el cajon: transferencias y tarjeta no estan en la caja fisica."""
    return float(monto_inicial) + float(ventas_efectivo) - float(gastos)


def calcular_metricas(db: Session, caja_id: int) -> MetricasCaja:
    """Totales de un turno: solo lo que quedo asociado a esa caja (ventas, abonos y gastos)."""
    por_metodo = cobros_por_metodo(db, caja_id=caja_id)
    gastos = db.execute(
        select(func.coalesce(func.sum(GastoModel.monto), 0.0)).where(GastoModel.caja_id == caja_id),
    ).scalar_one()
    return MetricasCaja(
        efectivo=por_metodo.get("efectivo", 0.0),
        transferencia=por_metodo.get("transferencia", 0.0),
        tarjeta=por_metodo.get("tarjeta", 0.0),
        gastos=float(gastos or 0.0),
    )
