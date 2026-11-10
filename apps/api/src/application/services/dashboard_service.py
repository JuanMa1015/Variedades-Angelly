"""Casos de uso para construir el resumen del dashboard."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from src.domain.zona_horaria import a_utc_naive, inicio_del_dia_local


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
    tarjeta: float = 0.0


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
    pagos_tarjeta: float = 0.0


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
        # Los cortes son a medianoche hora de Colombia; la base guarda UTC, asi que se convierten.
        inicio_dia_local = inicio_del_dia_local(current)
        inicio_semana_local = inicio_dia_local - timedelta(days=inicio_dia_local.weekday())
        inicio_mes_local = inicio_dia_local.replace(day=1)
        inicio_dia = a_utc_naive(inicio_dia_local)
        inicio_semana = a_utc_naive(inicio_semana_local)
        inicio_mes = a_utc_naive(inicio_mes_local)

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
            pagos_tarjeta=pagos.tarjeta,
        )