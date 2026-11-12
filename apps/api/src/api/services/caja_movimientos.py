"""Movimientos de un turno de caja: lo que explica el efectivo esperado (ventas, abonos, gastos y compras)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from src.api.schemas.caja import MovimientoCajaResponse
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    AbonoTiendaModel,
    CierreCajaModel,
    ClienteFiadoTiendaModel,
    ClienteModel,
    FacturaCompraModel,
    GastoModel,
    ProveedorModel,
    VentaModel,
)
from src.infrastructure.repositories.ingresos import cobrado_en_venta


def _del_turno(modelo, caja: CierreCajaModel, hasta: datetime):
    """Lo asociado al turno; para turnos viejos (sin ``caja_id``) se usa el rango de fechas."""
    return or_(
        modelo.caja_id == caja.id,
        and_(modelo.caja_id.is_(None), modelo.fecha >= caja.fecha_apertura, modelo.fecha <= hasta),
    )


def _nombres(db: Session, modelo, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    filas = db.execute(select(modelo.id, modelo.nombre).where(modelo.id.in_(ids))).all()
    return {fila.id: fila.nombre for fila in filas}


def _ventas(db: Session, caja: CierreCajaModel, hasta: datetime) -> list[MovimientoCajaResponse]:
    filas = db.execute(
        select(VentaModel, cobrado_en_venta().label("cobrado")).where(_del_turno(VentaModel, caja, hasta), VentaModel.fuera_de_caja.is_(False)),
    ).all()
    clientes = _nombres(db, ClienteModel, {v.cliente_id for v, _ in filas if v.cliente_id})
    tienda = _nombres(db, ClienteFiadoTiendaModel, {v.cliente_tienda_id for v, _ in filas if v.cliente_tienda_id})
    movimientos = []
    for venta, cobrado in filas:
        nombre = clientes.get(venta.cliente_id) or tienda.get(venta.cliente_tienda_id)
        movimientos.append(
            MovimientoCajaResponse(
                tipo="venta",
                id=venta.id,
                fecha=venta.fecha,
                descripcion=f"Venta #{venta.id}" + (f" · {nombre}" if nombre else ""),
                metodo_pago=venta.metodo_pago,
                monto=float(cobrado or 0.0),
                total=float(venta.total),
                es_fiado=bool(venta.es_fiado),
                anulada=bool(venta.anulada),
            ),
        )
    return movimientos


def _abonos(db: Session, caja: CierreCajaModel, hasta: datetime) -> list[MovimientoCajaResponse]:
    movimientos = []
    for modelo, tipo, modelo_cliente in (
        (AbonoTiendaModel, "abono_tienda", ClienteFiadoTiendaModel),
        (AbonoCarteraModel, "abono_cartera", ClienteModel),
    ):
        consulta = select(modelo).where(_del_turno(modelo, caja, hasta))
        if modelo is AbonoCarteraModel:
            consulta = consulta.where(AbonoCarteraModel.fuera_de_caja.is_(False))  # los cobros del modulo de cartera no pasan por la caja
        abonos = db.execute(consulta).scalars().all()
        nombres = _nombres(db, modelo_cliente, {a.cliente_id for a in abonos})
        movimientos.extend(
            MovimientoCajaResponse(
                tipo=tipo,
                id=a.id,
                fecha=a.fecha,
                descripcion=f"Abono · {nombres.get(a.cliente_id, 'cliente')}",
                metodo_pago=a.metodo_pago,
                monto=0.0 if getattr(a, "anulado", False) else float(a.monto),
                total=float(a.monto) if getattr(a, "anulado", False) else None,
                anulada=bool(getattr(a, "anulado", False)),
            )
            for a in abonos
        )
    return movimientos


def _gastos(db: Session, caja: CierreCajaModel, hasta: datetime) -> list[MovimientoCajaResponse]:
    gastos = db.execute(select(GastoModel).where(_del_turno(GastoModel, caja, hasta))).scalars().all()
    return [
        MovimientoCajaResponse(
            tipo="gasto",
            id=g.id,
            fecha=g.fecha,
            descripcion=f"{g.categoria} · {g.descripcion}",
            metodo_pago=g.medio_pago,
            monto=float(g.monto),
            total=float(g.monto),
            anulada=bool(g.anulado),
        )
        for g in gastos
    ]


def _compras(db: Session, caja: CierreCajaModel) -> list[MovimientoCajaResponse]:
    """Facturas de compra del turno (solo las que quedaron en esta caja; no hay turnos viejos que reconstruir)."""
    facturas = db.execute(select(FacturaCompraModel).where(FacturaCompraModel.caja_id == caja.id)).scalars().all()
    proveedores = _nombres(db, ProveedorModel, {f.proveedor_id for f in facturas})
    return [
        MovimientoCajaResponse(
            tipo="compra",
            id=f.id,
            fecha=f.fecha_creacion,
            descripcion=f"Factura #{f.id} · {proveedores.get(f.proveedor_id, 'proveedor')}",
            metodo_pago=f.medio_pago if f.medio_pago in ("efectivo", "transferencia", "tarjeta") else None,
            monto=float(f.total_factura),
            total=float(f.total_factura),
            anulada=bool(f.anulada),
        )
        for f in facturas
    ]


def movimientos_de_turno(db: Session, caja: CierreCajaModel) -> list[MovimientoCajaResponse]:
    """Ventas (lo cobrado), abonos y gastos del turno, del mas reciente al mas antiguo."""
    hasta = caja.fecha_cierre or datetime.now(UTC).replace(tzinfo=None)
    todos = [*_ventas(db, caja, hasta), *_abonos(db, caja, hasta), *_gastos(db, caja, hasta), *_compras(db, caja)]
    return sorted(todos, key=lambda m: m.fecha, reverse=True)
