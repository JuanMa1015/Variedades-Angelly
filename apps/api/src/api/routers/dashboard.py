"""Router de resumen para dashboard."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.application.services.ventas_service import pagos_totales_por_metodo, ventas_metric_since
from src.infrastructure.database.connection import get_db

router = APIRouter(tags=["dashboard"])


class DashboardResumenResponse(BaseModel):
    """Resumen ejecutivo de ventas para dashboard inicial."""

    ventas_diarias: float
    ventas_semanales: float
    ventas_mensuales: float
    transacciones_diarias: int
    transacciones_semanales: int
    transacciones_mensuales: int
    pagos_efectivo: float
    pagos_transferencia: float


@router.get("/api/dashboard/resumen", response_model=DashboardResumenResponse)
def dashboard_resumen(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> DashboardResumenResponse:
    now = datetime.now(UTC)
    inicio_dia = now.replace(hour=0, minute=0, second=0, microsecond=0)
    inicio_semana = inicio_dia - timedelta(days=inicio_dia.weekday())
    inicio_mes = inicio_dia.replace(day=1)

    ventas_diarias, transacciones_diarias = ventas_metric_since(db, inicio_dia)
    ventas_semanales, transacciones_semanales = ventas_metric_since(db, inicio_semana)
    ventas_mensuales, transacciones_mensuales = ventas_metric_since(db, inicio_mes)
    pagos_efectivo, pagos_transferencia = pagos_totales_por_metodo(db)

    return DashboardResumenResponse(
        ventas_diarias=ventas_diarias,
        ventas_semanales=ventas_semanales,
        ventas_mensuales=ventas_mensuales,
        transacciones_diarias=transacciones_diarias,
        transacciones_semanales=transacciones_semanales,
        transacciones_mensuales=transacciones_mensuales,
        pagos_efectivo=pagos_efectivo,
        pagos_transferencia=pagos_transferencia,
    )