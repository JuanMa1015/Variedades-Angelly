"""Helpers compartidos para routers de cartera."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.schemas.cartera import AbonoCarteraResponse, ClienteCarteraPageResponse, ClienteCobroResponse, ClienteResponse
from src.domain.cliente import Cliente
from src.infrastructure.database.models import AbonoCarteraModel, ClienteModel


def to_cliente_response(
    cliente: Cliente,
    compras_total: float = 0,
    compras_cantidad: int = 0,
) -> ClienteResponse:
    return ClienteResponse(
        id=cliente.id or 0,
        nombre=cliente.nombre,
        documento=cliente.documento,
        telefono_whatsapp=getattr(cliente, "telefono_whatsapp", None),
        limite_credito=cliente.limite_credito,
        deuda_total=cliente.deuda_total,
        compras_total=compras_total,
        compras_cantidad=compras_cantidad,
    )


def to_cliente_model_response(
    cliente: ClienteModel,
    compras_total: float = 0,
    compras_cantidad: int = 0,
) -> ClienteResponse:
    return ClienteResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        documento=cliente.documento,
        telefono_whatsapp=cliente.telefono_whatsapp,
        limite_credito=cliente.limite_credito,
        deuda_total=cliente.deuda_total,
        compras_total=compras_total,
        compras_cantidad=compras_cantidad,
    )


def to_cliente_model_cobro_response(cliente: ClienteModel) -> ClienteCobroResponse:
    return ClienteCobroResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        documento=cliente.documento,
        telefono_whatsapp=cliente.telefono_whatsapp,
        deuda_total=cliente.deuda_total,
    )


def to_abono_response(abono: AbonoCarteraModel) -> AbonoCarteraResponse:
    return AbonoCarteraResponse(
        id=abono.id,
        cliente_id=abono.cliente_id,
        monto=abono.monto,
        metodo_pago=abono.metodo_pago,
        saldo_cliente=abono.saldo_cliente,
        referencia=abono.referencia,
        fecha=abono.fecha,
    )


def normalize_naive_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.replace(tzinfo=None)


def build_cliente_page_response(
    query,
    page: int,
    limit: int,
    db: Session,
) -> ClienteCarteraPageResponse:
    total_items = db.execute(
        select(func.count()).select_from(query.subquery()),
    ).scalar_one()
    total_pages = max(1, (total_items + limit - 1) // limit)
    offset = (page - 1) * limit

    clientes = db.execute(
        query.order_by(ClienteModel.nombre.asc()).offset(offset).limit(limit),
    ).scalars().all()

    return ClienteCarteraPageResponse(
        data=[to_cliente_model_cobro_response(cliente) for cliente in clientes],
        total_pages=total_pages,
        current_page=page,
    )