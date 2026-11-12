"""Lecturas agregadas de dashboard implementadas con SQLAlchemy."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.application.services.dashboard_service import (
    DashboardMetricsReader,
    PagosTotalesDTO,
    VentasMetricDTO,
)
from src.infrastructure.database.models import VentaModel
from src.infrastructure.repositories.ingresos import cobros_por_metodo


class SqlAlchemyDashboardMetricsReader(DashboardMetricsReader):
    """Adaptador de infraestructura para metricas del dashboard."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def ventas_metric_since(self, start_date: datetime) -> VentasMetricDTO:
        total, count = self._db.execute(
            select(
                func.coalesce(func.sum(VentaModel.total), 0.0),
                func.count(VentaModel.id),
            ).where(
                VentaModel.fecha >= start_date,
                VentaModel.anulada.is_(False),
                VentaModel.fuera_de_caja.is_(False),  # las ventas del modulo de cartera tienen su propio dashboard
            ),
        ).one()

        return VentasMetricDTO(
            total=float(total or 0.0),
            transacciones=int(count or 0),
        )

    def pagos_totales_por_metodo(self) -> PagosTotalesDTO:
        totales = cobros_por_metodo(self._db)
        return PagosTotalesDTO(
            efectivo=totales.get("efectivo", 0.0),
            transferencia=totales.get("transferencia", 0.0),
            tarjeta=totales.get("tarjeta", 0.0),
        )
