"""Expresiones y consultas SQL compartidas para saber cuanto dinero entro realmente."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import AbonoCarteraModel, AbonoTiendaModel, VentaModel


def cobrado_en_venta():
    """Dinero cobrado al registrar la venta.

    - Ventas anuladas: 0.
    - Ventas de cartera (con cliente): 0, su dinero entra por ``abonos_cartera``.
    - Ventas al contado: el total.
    - Fiado de tienda: solo el abono inicial (total - saldo de la venta, nunca negativo).
    """
    return case(
        (VentaModel.anulada.is_(True), 0.0),
        (VentaModel.cliente_id.is_not(None), 0.0),
        (VentaModel.es_fiado.is_(False), VentaModel.total),
        (VentaModel.saldo_pendiente >= VentaModel.total, 0.0),
        else_=VentaModel.total - VentaModel.saldo_pendiente,
    )


def cobros_por_metodo(db: Session, caja_id: int | None = None) -> dict[str, float]:
    """Suma lo cobrado por medio de pago (ventas + abonos de cartera + abonos de tienda).

    Con ``caja_id`` solo cuenta lo asociado a ese turno; sin el, es el historico completo.
    """
    totales: dict[str, float] = defaultdict(float)
    fuentes = (
        (VentaModel, cobrado_en_venta()),
        (AbonoCarteraModel, AbonoCarteraModel.monto),
        (AbonoTiendaModel, AbonoTiendaModel.monto),
    )
    for modelo, monto in fuentes:
        consulta = select(modelo.metodo_pago, func.coalesce(func.sum(monto), 0.0)).where(
            modelo.metodo_pago.is_not(None),
        )
        if caja_id is not None:
            consulta = consulta.where(modelo.caja_id == caja_id)
        for metodo, total in db.execute(consulta.group_by(modelo.metodo_pago)).all():
            totales[metodo] += float(total or 0.0)
    return dict(totales)
