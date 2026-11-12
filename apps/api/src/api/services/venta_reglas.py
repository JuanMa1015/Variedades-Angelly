"""Reglas de negocio compartidas por los flujos que registran ventas."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import (
    CierreCajaModel,
    ClienteFiadoTiendaModel,
    ClienteModel,
    ProductoModel,
)


def exigir_producto_vendible(producto: ProductoModel) -> None:
    if not producto.activo:
        raise HTTPException(status_code=400, detail=f"El producto '{producto.nombre}' esta desactivado")


def exigir_cliente_activo(cliente: ClienteModel | ClienteFiadoTiendaModel) -> None:
    if not cliente.activo:
        raise HTTPException(status_code=400, detail=f"El cliente '{cliente.nombre}' esta desactivado")


def exigir_credito_disponible(cliente: ClienteModel, nueva_deuda: float) -> None:
    """Rechaza fiados que dejarian la deuda del cliente por encima de su cupo.

    Un cupo en 0 significa "sin cupo definido": ninguna pantalla lo fija, asi que no bloquea la venta.
    """
    if float(cliente.limite_credito) <= 0:
        return
    if nueva_deuda > float(cliente.limite_credito) + 1e-9:
        disponible = max(0.0, float(cliente.limite_credito) - float(cliente.deuda_total))
        raise HTTPException(
            status_code=400,
            detail=f"La venta supera el cupo de credito de '{cliente.nombre}'. Disponible: {int(disponible)}",
        )


def exigir_metodo_pago_si_hay_cobro(metodo_pago: str | None, hay_cobro: bool) -> None:
    """Toda venta con dinero recibido debe decir como se cobro (la caja separa efectivo/transferencia)."""
    if hay_cobro and not metodo_pago:
        raise HTTPException(status_code=400, detail="Debes indicar el metodo de pago")


def caja_abierta_id(db: Session) -> int | None:
    """Id del turno de caja abierto, o None si la caja esta cerrada."""
    return db.execute(
        select(CierreCajaModel.id).where(CierreCajaModel.fecha_cierre.is_(None)).limit(1),
    ).scalar_one_or_none()


def exigir_caja_abierta(db: Session, operacion: str = "registrar ventas") -> None:
    """Sin turno abierto el dinero cobrado no entra a ningun cuadre: no se puede cobrar."""
    if caja_abierta_id(db) is None:
        raise HTTPException(status_code=409, detail=f"La caja esta cerrada. Abre la caja para {operacion}")
