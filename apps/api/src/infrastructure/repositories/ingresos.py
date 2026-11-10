"""Expresiones SQL compartidas para saber cuanto dinero entro realmente."""

from __future__ import annotations

from sqlalchemy import case

from src.infrastructure.database.models import VentaModel


def cobrado_en_venta():
    """Dinero cobrado al registrar la venta.

    - Ventas de cartera (con cliente): 0, su dinero entra por ``abonos_cartera``.
    - Ventas al contado: el total.
    - Fiado de tienda: solo el abono inicial (total - saldo de la venta, nunca negativo).
    """
    return case(
        (VentaModel.cliente_id.is_not(None), 0.0),
        (VentaModel.es_fiado.is_(False), VentaModel.total),
        (VentaModel.saldo_pendiente >= VentaModel.total, 0.0),
        else_=VentaModel.total - VentaModel.saldo_pendiente,
    )
