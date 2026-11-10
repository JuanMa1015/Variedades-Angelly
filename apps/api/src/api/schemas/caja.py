"""Esquemas Pydantic para el modulo de caja."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field


class AperturaCajaRequest(BaseModel):
    """Entrada para abrir caja."""

    monto_inicial: Annotated[float, Field(ge=0)]


class CierreCajaRequest(BaseModel):
    """Entrada para cerrar caja."""

    monto_cierre: Annotated[float, Field(ge=0)]
    # Nota opcional para explicar un descuadre (p. ej. "faltaron $500 por un vuelto").
    observaciones: Annotated[str | None, Field(max_length=500)] = None


class ActualizarCajaRequest(BaseModel):
    """Entrada para actualizar un registro de caja."""

    monto_inicial: Annotated[float | None, Field(ge=0)] = None
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
    monto_ventas_tarjeta: float = 0.0
    monto_gastos: float
    monto_cierre: float | None
    fecha_apertura: datetime
    fecha_cierre: datetime | None
    abierto_por: str
    cerrado_por: str | None
    saldo_esperado: float | None  # None: el cajero cuenta a ciegas mientras la caja esta abierta
    total_ingresos: float
    esta_abierta: bool
    descuadre: float | None = None
    observaciones: str | None = None


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
    monto_ventas_tarjeta: float = 0.0
    monto_gastos: float
    monto_cierre: float | None
    saldo_esperado: float | None
    esta_abierta: bool
    descuadre: float | None = None
    observaciones: str | None = None


class MovimientoCajaResponse(BaseModel):
    """Una linea de lo que paso en un turno: venta, abono o gasto."""

    tipo: str  # venta | abono_tienda | abono_cartera | gasto
    id: int
    fecha: datetime
    descripcion: str
    metodo_pago: str | None = None
    monto: float  # dinero de este movimiento (en una venta, lo realmente cobrado)
    total: float | None = None  # solo ventas: valor de la venta (un fiado cobra menos)
    es_fiado: bool = False
    anulada: bool = False
