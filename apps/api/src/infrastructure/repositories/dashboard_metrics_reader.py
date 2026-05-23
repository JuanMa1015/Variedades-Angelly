"""Lecturas agregadas de dashboard implementadas con SQLAlchemy."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.application.services.dashboard_service import (
    DashboardMetricsReader,
    PagosTotalesDTO,
    VentasMetricDTO,
)
from src.infrastructure.database.models import AbonoCarteraModel, VentaModel


class SqlAlchemyDashboardMetricsReader(DashboardMetricsReader):
    """Adaptador de infraestructura para metricas del dashboard."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def ventas_metric_since(self, start_date: datetime) -> VentasMetricDTO:
        total, count = self._db.execute(
            select(
                func.coalesce(func.sum(VentaModel.total), 0.0),
                func.count(VentaModel.id),
            ).where(VentaModel.fecha >= start_date),
        ).one()

        return VentasMetricDTO(
            total=float(total or 0.0),
            transacciones=int(count or 0),
        )

    def pagos_totales_por_metodo(self) -> PagosTotalesDTO:
        efectivo_ventas, transferencia_ventas = self._db.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (VentaModel.metodo_pago == "efectivo", VentaModel.total - VentaModel.saldo_pendiente),
                            else_=0.0,
                        ),
                    ),
                    0.0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                VentaModel.metodo_pago == "transferencia",
                                VentaModel.total - VentaModel.saldo_pendiente,
                            ),
                            else_=0.0,
                        ),
                    ),
                    0.0,
                ),
            ).where(VentaModel.metodo_pago.is_not(None)),
        ).one()

        efectivo_abonos, transferencia_abonos = self._db.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (AbonoCarteraModel.metodo_pago == "efectivo", AbonoCarteraModel.monto),
                            else_=0.0,
                        ),
                    ),
                    0.0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (AbonoCarteraModel.metodo_pago == "transferencia", AbonoCarteraModel.monto),
                            else_=0.0,
                        ),
                    ),
                    0.0,
                ),
            ).where(AbonoCarteraModel.metodo_pago.is_not(None)),
        ).one()

        return PagosTotalesDTO(
            efectivo=float((efectivo_ventas or 0.0) + (efectivo_abonos or 0.0)),
            transferencia=float((transferencia_ventas or 0.0) + (transferencia_abonos or 0.0)),
        )