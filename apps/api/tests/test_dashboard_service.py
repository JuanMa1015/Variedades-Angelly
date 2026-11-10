"""Pruebas unitarias para el servicio de dashboard."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from src.application.services.dashboard_service import (
    DashboardResumenDTO,
    DashboardService,
    PagosTotalesDTO,
    VentasMetricDTO,
)


class MetricsReaderStub:
    """Stub del protocolo DashboardMetricsReader para pruebas."""

    def __init__(self) -> None:
        self.ventas_calls: list[datetime] = []
        self.pagos_calls: int = 0

    def ventas_metric_since(self, start_date: datetime) -> VentasMetricDTO:
        self.ventas_calls.append(start_date)
        return VentasMetricDTO(total=100000.0, transacciones=15)

    def pagos_totales_por_metodo(self) -> PagosTotalesDTO:
        self.pagos_calls += 1
        return PagosTotalesDTO(efectivo=60000.0, transferencia=40000.0)


class MetricsReaderEmptyStub:
    """Stub que simula base de datos vacia."""

    def ventas_metric_since(self, start_date: datetime) -> VentasMetricDTO:
        return VentasMetricDTO(total=0.0, transacciones=0)

    def pagos_totales_por_metodo(self) -> PagosTotalesDTO:
        return PagosTotalesDTO(efectivo=0.0, transferencia=0.0)


def test_build_resumen_con_datos() -> None:
    """Valida el resumen completo con datos simulados."""
    reader = MetricsReaderStub()
    service = DashboardService(reader)

    now = datetime(2026, 5, 24, 15, 30, 0, tzinfo=UTC)
    resumen = service.build_resumen(now=now)

    assert isinstance(resumen, DashboardResumenDTO)
    assert resumen.ventas_diarias == 100000.0
    assert resumen.ventas_semanales == 100000.0
    assert resumen.ventas_mensuales == 100000.0
    assert resumen.transacciones_diarias == 15
    assert resumen.transacciones_semanales == 15
    assert resumen.transacciones_mensuales == 15
    assert resumen.pagos_efectivo == 60000.0
    assert resumen.pagos_transferencia == 40000.0
    assert len(reader.ventas_calls) == 3
    assert reader.pagos_calls == 1


def test_build_resumen_sin_datos() -> None:
    """Valida resumen con base de datos vacia (ceros)."""
    reader = MetricsReaderEmptyStub()
    service = DashboardService(reader)

    resumen = service.build_resumen()

    assert resumen.ventas_diarias == 0.0
    assert resumen.ventas_semanales == 0.0
    assert resumen.ventas_mensuales == 0.0
    assert resumen.transacciones_diarias == 0
    assert resumen.pagos_efectivo == 0.0
    assert resumen.pagos_transferencia == 0.0


def test_build_resumen_fechas_correctas() -> None:
    """Los cortes son a medianoche hora de Colombia (UTC-5), entregados en UTC sin zona."""
    reader = MetricsReaderStub()
    service = DashboardService(reader)

    now = datetime(2026, 5, 24, 15, 30, 0, tzinfo=UTC)  # domingo 10:30 en Colombia
    service.build_resumen(now=now)

    # Dia: 2026-05-24 00:00 Colombia = 05:00 UTC
    assert reader.ventas_calls[0] == datetime(2026, 5, 24, 5, 0)
    # Semana: lunes 2026-05-18 00:00 Colombia
    assert reader.ventas_calls[1] == datetime(2026, 5, 18, 5, 0)
    # Mes: 2026-05-01 00:00 Colombia
    assert reader.ventas_calls[2] == datetime(2026, 5, 1, 5, 0)


def test_una_venta_de_las_8_pm_en_colombia_cuenta_como_del_mismo_dia() -> None:
    """01:30 UTC del 25 es 8:30 p. m. del 24 en Colombia: el dia sigue siendo el 24."""
    reader = MetricsReaderStub()
    DashboardService(reader).build_resumen(now=datetime(2026, 5, 25, 1, 30, tzinfo=UTC))

    assert reader.ventas_calls[0] == datetime(2026, 5, 24, 5, 0)


def test_el_corte_cambia_a_medianoche_local_no_a_medianoche_utc() -> None:
    """04:59 UTC aun es el dia anterior en Colombia; 05:00 UTC ya es el dia nuevo."""
    antes, despues = MetricsReaderStub(), MetricsReaderStub()

    DashboardService(antes).build_resumen(now=datetime(2026, 5, 25, 4, 59, tzinfo=UTC))
    DashboardService(despues).build_resumen(now=datetime(2026, 5, 25, 5, 0, tzinfo=UTC))

    assert antes.ventas_calls[0] == datetime(2026, 5, 24, 5, 0)
    assert despues.ventas_calls[0] == datetime(2026, 5, 25, 5, 0)


def test_el_desfase_horario_se_puede_configurar(monkeypatch) -> None:
    monkeypatch.setenv("APP_UTC_OFFSET_HOURS", "-6")
    reader = MetricsReaderStub()

    DashboardService(reader).build_resumen(now=datetime(2026, 5, 24, 15, 30, tzinfo=UTC))

    assert reader.ventas_calls[0] == datetime(2026, 5, 24, 6, 0)


def test_desfase_invalido_vuelve_al_de_colombia(monkeypatch) -> None:
    monkeypatch.setenv("APP_UTC_OFFSET_HOURS", "abc")
    reader = MetricsReaderStub()

    DashboardService(reader).build_resumen(now=datetime(2026, 5, 24, 15, 30, tzinfo=UTC))

    assert reader.ventas_calls[0] == datetime(2026, 5, 24, 5, 0)
