"""Router de resumen para dashboard."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.api.dependencies import AuthenticatedUser, get_dashboard_service, require_roles
from src.application.services.dashboard_service import DashboardService

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
    service: DashboardService = Depends(get_dashboard_service),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> DashboardResumenResponse:
    resumen = service.build_resumen()

    return DashboardResumenResponse(
        ventas_diarias=resumen.ventas_diarias,
        ventas_semanales=resumen.ventas_semanales,
        ventas_mensuales=resumen.ventas_mensuales,
        transacciones_diarias=resumen.transacciones_diarias,
        transacciones_semanales=resumen.transacciones_semanales,
        transacciones_mensuales=resumen.transacciones_mensuales,
        pagos_efectivo=resumen.pagos_efectivo,
        pagos_transferencia=resumen.pagos_transferencia,
    )