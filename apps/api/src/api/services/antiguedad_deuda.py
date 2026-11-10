"""Antiguedad de la deuda de los clientes de tienda y su semaforo (al dia / alerta / moroso).

Un cliente que debe mucho desde ayer no es lo mismo que uno que debe poco desde hace meses: el
semaforo mira cuanto lleva la deuda sin pagarse, no solo el monto.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.services.deuda import FIADO_TIENDA
from src.infrastructure.database.models import ClienteFiadoTiendaModel, VentaModel

DIAS_ALERTA = 30
DIAS_MOROSO = 60

EstadoDeuda = Literal["sin_deuda", "al_dia", "alerta", "moroso"]


def estado_deuda(deuda: float, dias: int | None) -> EstadoDeuda:
    if float(deuda or 0) <= 0:
        return "sin_deuda"
    if dias is None:
        return "al_dia"  # deuda sin ventas que la expliquen (p. ej. ajustada a mano): no hay fecha que juzgar
    if dias > DIAS_MOROSO:
        return "moroso"
    if dias > DIAS_ALERTA:
        return "alerta"
    return "al_dia"


def _fecha_mas_antigua(deuda: float, ventas: list[VentaModel]) -> datetime | None:
    """Los pagos se aplican a lo mas viejo: la deuda actual son las ventas fiadas mas recientes.

    Se recorre de la mas nueva hacia atras sumando lo que cada venta dejo sin pagar hasta cubrir
    la deuda; la ultima venta necesaria marca desde cuando se debe.
    """
    restante = float(deuda)
    fecha = None
    for venta in sorted(ventas, key=lambda v: v.fecha, reverse=True):
        sin_pagar = min(float(venta.saldo_pendiente), float(venta.total))
        if sin_pagar <= 0:
            continue
        fecha = venta.fecha
        restante -= sin_pagar
        if restante <= 0.005:
            break
    return fecha


def dias_de_deuda(
    db: Session,
    clientes: list[ClienteFiadoTiendaModel],
    ahora: datetime | None = None,
) -> dict[int, int | None]:
    """Dias que lleva la deuda de cada cliente que debe (clave: id del cliente)."""
    con_deuda = [c for c in clientes if float(c.deuda_total or 0) > 0]
    if not con_deuda:
        return {}
    ahora = ahora or datetime.now(UTC).replace(tzinfo=None)
    ventas = db.execute(
        select(VentaModel).where(
            VentaModel.cliente_tienda_id.in_([c.id for c in con_deuda]),
            VentaModel.tipo_fiado == FIADO_TIENDA,
            VentaModel.anulada.is_(False),
        ),
    ).scalars().all()
    por_cliente: dict[int, list[VentaModel]] = {}
    for venta in ventas:
        por_cliente.setdefault(venta.cliente_tienda_id, []).append(venta)

    resultado: dict[int, int | None] = {}
    for cliente in con_deuda:
        fecha = _fecha_mas_antigua(float(cliente.deuda_total), por_cliente.get(cliente.id, []))
        resultado[cliente.id] = None if fecha is None else max(0, (ahora - fecha).days)
    return resultado
