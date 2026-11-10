"""Reglas de negocio compartidas por los flujos que registran ventas."""

from __future__ import annotations

from fastapi import HTTPException

from src.infrastructure.database.models import ClienteFiadoTiendaModel, ClienteModel, ProductoModel


def exigir_producto_vendible(producto: ProductoModel) -> None:
    if not producto.activo:
        raise HTTPException(status_code=400, detail=f"El producto '{producto.nombre}' esta desactivado")


def exigir_cliente_activo(cliente: ClienteModel | ClienteFiadoTiendaModel) -> None:
    if not cliente.activo:
        raise HTTPException(status_code=400, detail=f"El cliente '{cliente.nombre}' esta desactivado")


def exigir_credito_disponible(cliente: ClienteModel, nueva_deuda: float) -> None:
    """Rechaza fiados que dejarian la deuda del cliente por encima de su cupo."""
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
