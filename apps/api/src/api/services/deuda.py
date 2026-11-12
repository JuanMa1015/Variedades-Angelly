"""Ajustes de deuda de clientes cuando se corrige o elimina un documento financiero."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import ClienteFiadoTiendaModel, ClienteModel, VentaModel

FIADO_TIENDA = "tienda"
FIADO_CARTERA = "cartera"

DeudaTienda = tuple[int | None, float]
SIN_DEUDA: DeudaTienda = (None, 0.0)


def deuda_pendiente_tienda(venta: VentaModel) -> DeudaTienda:
    """(cliente, monto) que esta venta aporta hoy a la deuda de un cliente fiado de tienda."""
    if not venta.es_fiado or venta.tipo_fiado != FIADO_TIENDA or venta.cliente_tienda_id is None:
        return SIN_DEUDA
    # Ventas anteriores guardaban la deuda total del cliente: se acota al total de la venta.
    return venta.cliente_tienda_id, min(float(venta.saldo_pendiente), float(venta.total))


def _sumar_deuda_tienda(db: Session, cliente_id: int, delta: float) -> None:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id).with_for_update(),
    ).scalar_one_or_none()
    if cliente is not None:
        cliente.deuda_total = round(max(0.0, float(cliente.deuda_total) + delta), 2)


def mover_deuda_tienda(db: Session, antes: DeudaTienda, despues: DeudaTienda) -> None:
    """Deja la deuda de los clientes consistente con el cambio de una venta fiada."""
    cliente_antes, monto_antes = antes
    cliente_despues, monto_despues = despues
    if cliente_antes == cliente_despues:
        if cliente_antes is not None and monto_antes != monto_despues:
            _sumar_deuda_tienda(db, cliente_antes, monto_despues - monto_antes)
        return
    if cliente_antes is not None and monto_antes:
        _sumar_deuda_tienda(db, cliente_antes, -monto_antes)
    if cliente_despues is not None and monto_despues:
        _sumar_deuda_tienda(db, cliente_despues, monto_despues)


def reajustar_deuda_cartera(db: Session, cliente_id: int, delta: float) -> float:
    """Suma ``delta`` a la deuda de un cliente de cartera (bloqueado). Rechaza saldos negativos."""
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id).with_for_update(),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    nueva = round(float(cliente.deuda_total) + delta, 2)
    if nueva < 0:
        raise HTTPException(status_code=400, detail="El abono supera la deuda actual del cliente")
    cliente.deuda_total = nueva
    return nueva
