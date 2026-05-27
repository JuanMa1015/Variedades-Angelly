"""Esquemas Pydantic para el modulo de caja."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field


class AperturaCajaRequest(BaseModel):
    """Entrada para abrir caja."""

    monto_inicial: Annotated[float, Field(gt=0)]


class CierreCajaRequest(BaseModel):
    """Entrada para cerrar caja."""

    monto_cierre: Annotated[float, Field(ge=0)]


class ActualizarCajaRequest(BaseModel):
    """Entrada para actualizar un registro de caja."""

    monto_inicial: Annotated[float | None, Field(gt=0)] = None
    monto_cierre: Annotated[float | None, Field(ge=0)] = None
    monto_efectivo_real: Annotated[float | None, Field(ge=0)] = None
    observaciones: str | None = None
    estado: str | None = None


class CierreCajaResponse(BaseModel):
    """Salida de un registro de apertura/cierre de caja."""

    id: int
    monto_inicial: float
    monto_ventas_efectivo: float
    monto_ventas_transferencia: float
    monto_gastos: float
    monto_cierre: float | None
    fecha_apertura: datetime
    fecha_cierre: datetime | None
    abierto_por: str
    cerrado_por: str | None
    saldo_esperado: float
    total_ingresos: float
    esta_abierta: bool
    descuadre: float | None = None


class CajaEstadoResponse(BaseModel):
    """Estado actual de la caja."""

    abierta: bool
    caja_actual: CierreCajaResponse | None
    ultimo_cierre: CierreCajaResponse | None


class CajaHistorialItemResponse(BaseModel):
    """Item del historial de cierres de caja."""

    id: int
    fecha_apertura: datetime
    fecha_cierre: datetime | None
    abierto_por: str
    cerrado_por: str | None
    monto_inicial: float
    monto_ventas_efectivo: float
    monto_ventas_transferencia: float
    monto_gastos: float
    monto_cierre: float | None
    saldo_esperado: float
    esta_abierta: bool
    descuadre: float | None = None
