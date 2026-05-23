"""Esquemas y validaciones estables para el modulo de cartera."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

MetodoPago = Literal["efectivo", "transferencia"]


class ClienteResponse(BaseModel):
    """DTO de salida para el endpoint de clientes."""

    id: int
    nombre: str
    documento: str | None
    telefono_whatsapp: str | None = None
    limite_credito: float
    deuda_total: float
    compras_total: float = 0
    compras_cantidad: int = 0


class ClienteCobroResponse(BaseModel):
    """DTO de salida para listado de cobros sin limite de credito."""

    id: int
    nombre: str
    documento: str | None
    telefono_whatsapp: str | None = None
    deuda_total: float


class ClienteCarteraPageResponse(BaseModel):
    """Respuesta paginada para listado de cartera en cobros UI."""

    data: list[ClienteCobroResponse]
    total_pages: int
    current_page: int


class CarteraResumenResponse(BaseModel):
    """Resumen agregado para dashboard de cartera."""

    clientes_totales: int
    clientes_con_deuda: int
    deuda_total: float
    limite_total: float
    disponible_total: float
    clientes_alto_riesgo: int
    saldo_promedio: float


class MovimientoClienteResponse(BaseModel):
    """DTO de salida para historial paginado del cliente."""

    id: int
    tipo: str
    descripcion: str | None = None
    articulo: str | None = None
    cantidad: int | None = None
    referencia: str | None = None
    monto: float
    fecha: datetime
    saldo: float


class MovimientoClientePageResponse(BaseModel):
    """Respuesta paginada para movimientos del modal de detalle."""

    data: list[MovimientoClienteResponse]
    total_pages: int
    current_page: int


class ClienteCreateRequest(BaseModel):
    """DTO de entrada para crear clientes desde UI."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    documento: Annotated[str | None, Field(min_length=5, max_length=30)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None
    limite_credito: Annotated[float, Field(ge=0)]


class ClienteUpdateRequest(BaseModel):
    """DTO de entrada para editar cliente de cartera."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    documento: Annotated[str | None, Field(min_length=5, max_length=30)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None
    limite_credito: Annotated[float | None, Field(ge=0)] = None


class VentaItemCreateRequest(BaseModel):
    """DTO de cada item a vender."""

    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0)]


class CarteraVentaCreateRequest(BaseModel):
    """Entrada para registrar una venta en el libro de cartera admin."""

    cliente_id: Annotated[int, Field(gt=0)]
    items: Annotated[list[VentaItemCreateRequest], Field(min_length=1)]
    abono_inicial: Annotated[float, Field(ge=0)] = 0
    metodo_pago: MetodoPago | None = None
    fecha_venta: datetime | None = None
    referencia: Annotated[str | None, Field(max_length=255)] = None


class VentaDetalleResponse(BaseModel):
    """DTO de salida para lineas de una venta."""

    producto_id: int
    nombre_producto: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class VentaResponse(BaseModel):
    """DTO de salida para venta creada."""

    venta_id: int
    cliente_id: int | None
    cliente_tienda_id: int | None
    cliente_nombre: str | None
    es_fiado: bool
    fiado_origen: str | None
    metodo_pago: MetodoPago | None = None
    total: float
    saldo_pendiente: float
    fecha: datetime
    detalles: list[VentaDetalleResponse]
    resumen_recibo: str


class CarteraVentaHistorialItemResponse(BaseModel):
    """Fila de historial de ventas registradas en cartera."""

    venta_id: int
    cliente_id: int
    cliente_nombre: str
    total: float
    saldo_cliente: float
    metodo_pago: MetodoPago | None = None
    articulos: int
    articulos_detalle: str
    fecha: datetime


class AbonoCarteraCreateRequest(BaseModel):
    """Entrada para registrar abonos a deuda de cartera."""

    monto: Annotated[float, Field(gt=0)]
    metodo_pago: MetodoPago = "efectivo"
    fecha: datetime | None = None
    referencia: Annotated[str | None, Field(max_length=255)] = None


class AbonoCarteraCreateAdminRequest(BaseModel):
    """Entrada para registrar abonos desde admin (incluye cliente_id)."""

    cliente_id: Annotated[int, Field(gt=0)]
    monto: Annotated[float, Field(gt=0)]
    metodo_pago: MetodoPago = "efectivo"
    fecha: datetime | None = None
    referencia: Annotated[str | None, Field(max_length=255)] = None


class AbonoCarteraUpdateRequest(BaseModel):
    """Entrada para editar un abono de cartera."""

    monto: Annotated[float | None, Field(gt=0)] = None
    metodo_pago: MetodoPago | None = None
    referencia: Annotated[str | None, Field(max_length=255)] = None


class AbonoCarteraResponse(BaseModel):
    """Salida de abonos registrados en cartera."""

    id: int
    cliente_id: int
    monto: float
    metodo_pago: MetodoPago | None = None
    saldo_cliente: float
    referencia: str | None
    fecha: datetime
