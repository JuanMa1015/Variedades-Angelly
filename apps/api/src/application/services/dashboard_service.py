"""Casos de uso para construir el resumen del dashboard."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol


@dataclass(frozen=True)
class VentasMetricDTO:
    """Metrica agregada de ventas para un rango temporal."""

    total: float
    transacciones: int


@dataclass(frozen=True)
class PagosTotalesDTO:
    """Totales historicos de pagos por metodo."""

    efectivo: float
    transferencia: float


@dataclass(frozen=True)
class DashboardResumenDTO:
    """Salida de aplicacion para el resumen ejecutivo."""

    ventas_diarias: float
    ventas_semanales: float
    ventas_mensuales: float
    transacciones_diarias: int
    transacciones_semanales: int
    transacciones_mensuales: int
    pagos_efectivo: float
    pagos_transferencia: float


class DashboardMetricsReader(Protocol):
    """Puerto de lectura para metricas usadas por dashboard."""

    def ventas_metric_since(self, start_date: datetime) -> VentasMetricDTO:
        """Retorna ventas agregadas desde una fecha dada."""

    def pagos_totales_por_metodo(self) -> PagosTotalesDTO:
        """Retorna pagos historicos por metodo."""


class DashboardService:
    """Orquesta reglas de aplicacion para construir resumen de dashboard."""

    def __init__(self, metrics_reader: DashboardMetricsReader) -> None:
        self._metrics_reader = metrics_reader

    def build_resumen(self, now: datetime | None = None) -> DashboardResumenDTO:
        """Construye el resumen con cortes diario, semanal y mensual."""
        current = now or datetime.now(UTC)
        inicio_dia = current.replace(hour=0, minute=0, second=0, microsecond=0)
        inicio_semana = inicio_dia - timedelta(days=inicio_dia.weekday())
        inicio_mes = inicio_dia.replace(day=1)

        diarias = self._metrics_reader.ventas_metric_since(inicio_dia)
        semanales = self._metrics_reader.ventas_metric_since(inicio_semana)
        mensuales = self._metrics_reader.ventas_metric_since(inicio_mes)
        pagos = self._metrics_reader.pagos_totales_por_metodo()

        return DashboardResumenDTO(
            ventas_diarias=diarias.total,
            ventas_semanales=semanales.total,
            ventas_mensuales=mensuales.total,
            transacciones_diarias=diarias.transacciones,
            transacciones_semanales=semanales.transacciones,
            transacciones_mensuales=mensuales.transacciones,
            pagos_efectivo=pagos.efectivo,
            pagos_transferencia=pagos.transferencia,
        )