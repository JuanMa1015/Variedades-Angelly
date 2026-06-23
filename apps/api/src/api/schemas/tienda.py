"""Esquemas para el modulo de fiado de tienda."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from src.api.schemas.cartera import MetodoPago


class ClienteTiendaResponse(BaseModel):
    id: int
    nombre: str
    telefono_whatsapp: str | None = None
    deuda_total: float = 0.0


class ClienteTiendaCobroResponse(BaseModel):
    id: int
    nombre: str
    telefono_whatsapp: str | None = None
    deuda_total: float = 0.0


class ClienteTiendaPageResponse(BaseModel):
    data: list[ClienteTiendaCobroResponse]
    total_pages: int
    current_page: int


class TiendaResumenResponse(BaseModel):
    clientes_totales: int
    clientes_con_deuda: int
    deuda_total: float
    clientes_alto_riesgo: int
    clientes_riesgo_medio: int
    saldo_promedio: float


class MovimientoTiendaResponse(BaseModel):
    id: int
    tipo: str
    descripcion: str | None = None
    articulo: str | None = None
    cantidad: int | None = None
    precio_unitario: float | None = None
    referencia: str | None = None
    monto: float
    fecha: datetime
    saldo: float | None = None


class MovimientoTiendaPageResponse(BaseModel):
    data: list[MovimientoTiendaResponse]
    total_pages: int
    current_page: int


class AbonoTiendaCreateRequest(BaseModel):
    monto: Annotated[float, Field(gt=0)]
    metodo_pago: MetodoPago = "efectivo"
    referencia: Annotated[str | None, Field(max_length=255)] = None


class AbonoTiendaResponse(BaseModel):
    id: int
    cliente_id: int
    monto: float
    metodo_pago: MetodoPago | None = None
    saldo_cliente: float
    referencia: str | None = None
    fecha: datetime
