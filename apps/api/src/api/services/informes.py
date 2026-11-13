"""Informe de gerencia por periodo: la tienda y la cartera por separado, con lo cobrado y los gastos.

Todo se calcula en el servidor sobre [desde, hasta): fechas del negocio (hora local) convertidas a UTC.
Las ventas anuladas no cuentan en ninguna cifra.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.domain.zona_horaria import a_utc_naive, inicio_del_dia_local, zona_negocio
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    ClienteFiadoTiendaModel,
    ClienteModel,
    DetalleVentaModel,
    GastoModel,
    ProductoModel,
    VentaModel,
)
from src.infrastructure.repositories.ingresos import cobros_por_metodo

LIMITE_RANKING = 5
MAX_DIAS = 366


def periodo_por_defecto() -> tuple[date, date]:
    """El mes en curso, desde el dia 1 hasta hoy (hora del negocio)."""
    hoy = inicio_del_dia_local(datetime.now(UTC)).date()
    return hoy.replace(day=1), hoy


def limites_utc(desde: date, hasta: date) -> tuple[datetime, datetime]:
    """Dias inclusivos del negocio -> [inicio, fin) en UTC sin zona, como se guarda en la base."""
    zona = zona_negocio()
    inicio = datetime.combine(desde, time.min, tzinfo=zona)
    fin = datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=zona)
    return a_utc_naive(inicio), a_utc_naive(fin)


def _redondear(valor: Any) -> float:
    return round(float(valor or 0), 2)


def _ventas(db: Session, fuera_de_caja: bool, inicio: datetime, fin: datetime) -> dict[str, Any]:
    total, cantidad, credito = db.execute(
        select(
            func.coalesce(func.sum(VentaModel.total), 0.0),
            func.count(VentaModel.id),
            func.coalesce(func.sum(case((VentaModel.es_fiado.is_(True), VentaModel.total), else_=0.0)), 0.0),
        ).where(
            VentaModel.fecha >= inicio,
            VentaModel.fecha < fin,
            VentaModel.anulada.is_(False),
            VentaModel.fuera_de_caja.is_(fuera_de_caja),
        ),
    ).one()
    total, credito = _redondear(total), _redondear(credito)
    return {"total": total, "transacciones": int(cantidad or 0), "a_credito": credito, "de_contado": _redondear(total - credito)}


def _por_metodo(por_metodo: dict[str, float]) -> dict[str, float]:
    efectivo, transferencia, tarjeta = (_redondear(por_metodo.get(m)) for m in ("efectivo", "transferencia", "tarjeta"))
    return {"total": _redondear(efectivo + transferencia + tarjeta), "efectivo": efectivo, "transferencia": transferencia, "tarjeta": tarjeta}


def _cobrado_cartera(db: Session, inicio: datetime, fin: datetime) -> dict[str, float]:
    filas = db.execute(
        select(AbonoCarteraModel.metodo_pago, func.coalesce(func.sum(AbonoCarteraModel.monto), 0.0)).where(
            AbonoCarteraModel.fuera_de_caja.is_(True),
            AbonoCarteraModel.anulado.is_(False),
            AbonoCarteraModel.fecha >= inicio,
            AbonoCarteraModel.fecha < fin,
        ).group_by(AbonoCarteraModel.metodo_pago),
    ).all()
    return _por_metodo({metodo: float(suma or 0) for metodo, suma in filas})


def _gastos(db: Session, inicio: datetime, fin: datetime) -> float:
    total = db.execute(
        select(func.coalesce(func.sum(GastoModel.monto), 0.0)).where(
            GastoModel.fecha >= inicio, GastoModel.fecha < fin, GastoModel.anulado.is_(False),
        ),
    ).scalar_one()
    return _redondear(total)


def _vendedores(db: Session, inicio: datetime, fin: datetime) -> list[dict[str, Any]]:
    filas = db.execute(
        select(
            VentaModel.creado_por,
            func.count(VentaModel.id),
            func.coalesce(func.sum(VentaModel.total), 0.0),
        ).where(
            VentaModel.creado_por.is_not(None),
            VentaModel.fecha >= inicio,
            VentaModel.fecha < fin,
            VentaModel.anulada.is_(False),
            VentaModel.fuera_de_caja.is_(False),
        ).group_by(VentaModel.creado_por).order_by(
            func.sum(VentaModel.total).desc(), func.count(VentaModel.id).desc(), VentaModel.creado_por.asc(),
        ).limit(LIMITE_RANKING),
    ).all()
    return [{"vendedor": nombre, "ventas": int(ventas or 0), "total_vendido": _redondear(total)} for nombre, ventas, total in filas]


def _unidades_vendidas(inicio: datetime, fin: datetime, fuera_de_caja: bool):
    """Subconsulta: unidades y total vendidos por producto en el periodo, sin ventas anuladas."""
    return (
        select(
            DetalleVentaModel.producto_id.label("producto_id"),
            func.sum(DetalleVentaModel.cantidad).label("unidades"),
            func.sum(DetalleVentaModel.subtotal).label("total"),
        )
        .join(VentaModel, VentaModel.id == DetalleVentaModel.venta_id)
        .where(
            VentaModel.fecha >= inicio,
            VentaModel.fecha < fin,
            VentaModel.anulada.is_(False),
            VentaModel.fuera_de_caja.is_(fuera_de_caja),
        )
        .group_by(DetalleVentaModel.producto_id)
        .subquery()
    )


def _rankings(db: Session, catalogo: str, fuera_de_caja: bool, inicio: datetime, fin: datetime) -> tuple[list[dict], list[dict]]:
    """Mas vendidos (solo los que vendieron) y menos vendidos (productos activos del catalogo, incluidos los que no se vendieron)."""
    vendido = _unidades_vendidas(inicio, fin, fuera_de_caja)
    unidades = func.coalesce(vendido.c.unidades, 0)
    total = func.coalesce(vendido.c.total, 0.0)
    base = (
        select(ProductoModel.id, ProductoModel.nombre, unidades.label("unidades"), total.label("total"))
        .outerjoin(vendido, vendido.c.producto_id == ProductoModel.id)
        .where(ProductoModel.catalogo == catalogo, ProductoModel.activo.is_(True))
    )

    def filas(consulta) -> list[dict]:
        return [
            {"producto_id": int(i), "producto": nombre, "unidades_vendidas": int(u or 0), "total_vendido": _redondear(t)}
            for i, nombre, u, t in db.execute(consulta.limit(LIMITE_RANKING)).all()
        ]

    mas = filas(base.where(unidades > 0).order_by(unidades.desc(), total.desc(), ProductoModel.nombre.asc()))
    menos = filas(base.order_by(unidades.asc(), total.asc(), ProductoModel.nombre.asc()))
    return mas, menos


def construir_informe(db: Session, desde: date, hasta: date) -> dict[str, Any]:
    inicio, fin = limites_utc(desde, hasta)

    cobrado_tienda = _por_metodo(cobros_por_metodo(db, desde=inicio, hasta=fin))
    gastos = _gastos(db, inicio, fin)
    mas_tienda, menos_tienda = _rankings(db, "tienda", False, inicio, fin)
    mas_cartera, menos_cartera = _rankings(db, "cartera", True, inicio, fin)

    por_cobrar_tienda = db.execute(
        select(func.coalesce(func.sum(ClienteFiadoTiendaModel.deuda_total), 0.0)).where(ClienteFiadoTiendaModel.activo.is_(True)),
    ).scalar_one()
    por_cobrar_cartera = db.execute(
        select(func.coalesce(func.sum(ClienteModel.deuda_total), 0.0)).where(ClienteModel.activo.is_(True)),
    ).scalar_one()

    return {
        "periodo": {"desde": desde, "hasta": hasta},
        "tienda": {
            "ventas": _ventas(db, False, inicio, fin),
            "cobrado": cobrado_tienda,
            "gastos": gastos,
            "cobrado_menos_gastos": _redondear(cobrado_tienda["total"] - gastos),
            "por_cobrar": _redondear(por_cobrar_tienda),
            "vendedores": _vendedores(db, inicio, fin),
            "mas_vendidos": mas_tienda,
            "menos_vendidos": menos_tienda,
        },
        "cartera": {
            "ventas": _ventas(db, True, inicio, fin),
            "cobrado": _cobrado_cartera(db, inicio, fin),
            "por_cobrar": _redondear(por_cobrar_cartera),
            "mas_vendidos": mas_cartera,
            "menos_vendidos": menos_cartera,
        },
    }
