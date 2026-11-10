"""Esquemas para el modulo de fiado de tienda."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from src.api.schemas.cartera import MetodoPago

EstadoDeudaTienda = Literal["sin_deuda", "al_dia", "alerta", "moroso"]


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


class ClienteTiendaListaItem(BaseModel):
    """Fila de la lista de clientes: deuda, cuanto lleva sin pagarse y si se puede eliminar."""

    id: int
    nombre: str
    telefono_whatsapp: str | None = None
    deuda_total: float = 0.0
    dias_deuda: int | None = None
    estado_deuda: EstadoDeudaTienda = "sin_deuda"
    tiene_ventas: bool = False
    activo: bool = True


class ClienteTiendaListaPage(BaseModel):
    data: list[ClienteTiendaListaItem]
    total: int
    total_pages: int
    current_page: int


class TiendaResumenResponse(BaseModel):
    clientes_totales: int
    clientes_con_deuda: int
    deuda_total: float
    # Por antiguedad de la deuda: "alto riesgo" = morosos (mas de 60 dias), "riesgo medio" = en alerta (31 a 60).
    clientes_alto_riesgo: int
    clientes_riesgo_medio: int
    saldo_promedio: float
    deuda_morosa: float = 0.0


class ItemMovimientoTienda(BaseModel):
    articulo: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class MovimientoTiendaResponse(BaseModel):
    """Una venta fiada (con sus productos) o un abono del cliente."""

    id: int
    tipo: str  # Venta | Abono
    fecha: datetime
    monto: float  # venta: total de la venta; abono: lo abonado
    por_pagar: float | None = None  # venta: lo que quedo fiado
    metodo_pago: MetodoPago | None = None
    referencia: str | None = None
    saldo: float | None = None  # abono: deuda del cliente despues de abonar
    items: list[ItemMovimientoTienda] | None = None
    anulado: bool = False
    motivo_anulacion: str | None = None
    anulado_por: str | None = None


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
    cliente_nombre: str | None = None
    deuda_anterior: float | None = None
    anulado: bool = False
