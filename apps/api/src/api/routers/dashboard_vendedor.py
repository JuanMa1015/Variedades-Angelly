"""Dashboard del vendedor: ventas de la tienda, lo cobrado, gastos, caja, fiado de tienda, mas vendidos y stock."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.services.antiguedad_deuda import dias_de_deuda, estado_deuda
from src.api.services.caja_calculos import calcular_metricas, efectivo_esperado
from src.domain.zona_horaria import a_utc_naive, inicio_del_dia_local
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    CierreCajaModel,
    ClienteFiadoTiendaModel,
    DetalleVentaModel,
    GastoModel,
    ProductoModel,
    VentaModel,
)
from src.infrastructure.repositories.ingresos import cobros_por_metodo

router = APIRouter(tags=["dashboard-vendedor"])

CUANTOS = 5


class VentasPeriodo(BaseModel):
    total: float = 0
    transacciones: int = 0
    de_contado: float = 0
    a_credito: float = 0


class VentasPeriodos(BaseModel):
    hoy: VentasPeriodo
    semana: VentasPeriodo
    mes: VentasPeriodo


class CobradoPeriodo(BaseModel):
    total: float = 0
    efectivo: float = 0
    transferencia: float = 0
    tarjeta: float = 0


class CobradoPeriodos(BaseModel):
    hoy: CobradoPeriodo
    semana: CobradoPeriodo
    mes: CobradoPeriodo


class GastosPeriodos(BaseModel):
    hoy: float = 0
    mes: float = 0


class FiadoTienda(BaseModel):
    deuda_total: float
    clientes_con_deuda: int
    en_alerta: int
    morosos: int


class CajaActual(BaseModel):
    abierta: bool
    abierta_por: str | None = None
    desde: datetime | None = None
    monto_inicial: float = 0
    efectivo: float = 0
    transferencia: float = 0
    tarjeta: float = 0
    gastos: float = 0
    efectivo_esperado: float = 0


class ProductoVendido(BaseModel):
    nombre: str
    unidades: int
    total: float


class ProductoPorAgotarse(BaseModel):
    id: int
    nombre: str
    stock_actual: int
    stock_minimo: int


class StockTienda(BaseModel):
    agotados: int
    bajo_stock: int
    urgentes: list[ProductoPorAgotarse]


class DashboardVendedorResponse(BaseModel):
    ventas: VentasPeriodos
    cobrado: CobradoPeriodos
    gastos: GastosPeriodos
    fiado_tienda: FiadoTienda
    caja: CajaActual
    productos_mas_vendidos: list[ProductoVendido]
    stock: StockTienda


def _ventas_desde(db: Session, inicio: datetime) -> VentasPeriodo:
    """Ventas de la tienda (no las del modulo de cartera) vigentes desde ``inicio``."""
    total, cantidad, credito = db.execute(
        select(
            func.coalesce(func.sum(VentaModel.total), 0.0),
            func.count(VentaModel.id),
            func.coalesce(func.sum(case((VentaModel.es_fiado.is_(True), VentaModel.total), else_=0.0)), 0.0),
        ).where(
            VentaModel.fecha >= inicio,
            VentaModel.anulada.is_(False),
            VentaModel.fuera_de_caja.is_(False),
        ),
    ).one()
    total, credito = round(float(total or 0), 2), round(float(credito or 0), 2)
    return VentasPeriodo(total=total, transacciones=int(cantidad or 0), a_credito=credito, de_contado=round(total - credito, 2))


def _cobrado_desde(db: Session, inicio: datetime) -> CobradoPeriodo:
    por_metodo = cobros_por_metodo(db, desde=inicio)
    efectivo, transferencia, tarjeta = (round(por_metodo.get(m, 0.0), 2) for m in ("efectivo", "transferencia", "tarjeta"))
    return CobradoPeriodo(total=round(efectivo + transferencia + tarjeta, 2), efectivo=efectivo, transferencia=transferencia, tarjeta=tarjeta)


def _gastos_desde(db: Session, inicio: datetime) -> float:
    total = db.execute(
        select(func.coalesce(func.sum(GastoModel.monto), 0.0)).where(GastoModel.fecha >= inicio, GastoModel.anulado.is_(False)),
    ).scalar_one()
    return round(float(total or 0), 2)


def _fiado_tienda(db: Session) -> FiadoTienda:
    clientes = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.activo.is_(True), ClienteFiadoTiendaModel.deuda_total > 0),
    ).scalars().all()
    dias = dias_de_deuda(db, list(clientes))
    estados = [estado_deuda(float(c.deuda_total), dias.get(c.id)) for c in clientes]
    return FiadoTienda(
        deuda_total=round(sum(float(c.deuda_total) for c in clientes), 2),
        clientes_con_deuda=len(clientes),
        en_alerta=estados.count("alerta"),
        morosos=estados.count("moroso"),
    )


def _caja_actual(db: Session) -> CajaActual:
    caja = db.execute(select(CierreCajaModel).where(CierreCajaModel.fecha_cierre.is_(None)).order_by(CierreCajaModel.id.desc()).limit(1)).scalar_one_or_none()
    if caja is None:
        return CajaActual(abierta=False)
    metricas = calcular_metricas(db, caja.id)
    return CajaActual(
        abierta=True,
        abierta_por=caja.abierto_por,
        desde=caja.fecha_apertura,
        monto_inicial=float(caja.monto_inicial),
        efectivo=round(metricas.efectivo, 2),
        transferencia=round(metricas.transferencia, 2),
        tarjeta=round(metricas.tarjeta, 2),
        gastos=round(metricas.gastos, 2),
        efectivo_esperado=round(efectivo_esperado(float(caja.monto_inicial), metricas.efectivo, metricas.gastos), 2),
    )


def _mas_vendidos(db: Session, inicio: datetime) -> list[ProductoVendido]:
    filas = db.execute(
        select(DetalleVentaModel.nombre_producto, func.sum(DetalleVentaModel.cantidad), func.sum(DetalleVentaModel.subtotal))
        .join(VentaModel, VentaModel.id == DetalleVentaModel.venta_id)
        .where(VentaModel.fecha >= inicio, VentaModel.anulada.is_(False), VentaModel.fuera_de_caja.is_(False))
        .group_by(DetalleVentaModel.producto_id, DetalleVentaModel.nombre_producto)
        .order_by(func.sum(DetalleVentaModel.cantidad).desc(), func.sum(DetalleVentaModel.subtotal).desc(), DetalleVentaModel.nombre_producto.asc())
        .limit(CUANTOS),
    ).all()
    return [ProductoVendido(nombre=f[0], unidades=int(f[1] or 0), total=round(float(f[2] or 0), 2)) for f in filas]


def _stock_tienda(db: Session) -> StockTienda:
    base = (ProductoModel.activo.is_(True), ProductoModel.catalogo == "tienda")
    agotados = db.execute(select(func.count(ProductoModel.id)).where(*base, ProductoModel.stock_actual == 0)).scalar_one()
    bajo = db.execute(
        select(func.count(ProductoModel.id)).where(*base, ProductoModel.stock_actual > 0, ProductoModel.stock_actual <= ProductoModel.stock_minimo),
    ).scalar_one()
    urgentes = db.execute(
        select(ProductoModel).where(*base, ProductoModel.stock_actual <= ProductoModel.stock_minimo)
        .order_by(ProductoModel.stock_actual.asc(), ProductoModel.nombre.asc()).limit(CUANTOS),
    ).scalars().all()
    return StockTienda(
        agotados=int(agotados),
        bajo_stock=int(bajo),
        urgentes=[ProductoPorAgotarse(id=p.id, nombre=p.nombre, stock_actual=p.stock_actual, stock_minimo=p.stock_minimo) for p in urgentes],
    )


@router.get("/api/dashboard/vendedor", response_model=DashboardVendedorResponse)
def get_dashboard_vendedor(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> DashboardVendedorResponse:
    """Todo lo que muestra el dashboard del vendedor en una sola consulta; no incluye nada del modulo de cartera."""
    inicio_dia = inicio_del_dia_local(datetime.now(UTC))
    inicios = {
        "hoy": a_utc_naive(inicio_dia),
        "semana": a_utc_naive(inicio_dia - timedelta(days=inicio_dia.weekday())),
        "mes": a_utc_naive(inicio_dia.replace(day=1)),
    }
    return DashboardVendedorResponse(
        ventas=VentasPeriodos(**{nombre: _ventas_desde(db, inicio) for nombre, inicio in inicios.items()}),
        cobrado=CobradoPeriodos(**{nombre: _cobrado_desde(db, inicio) for nombre, inicio in inicios.items()}),
        gastos=GastosPeriodos(hoy=_gastos_desde(db, inicios["hoy"]), mes=_gastos_desde(db, inicios["mes"])),
        fiado_tienda=_fiado_tienda(db),
        caja=_caja_actual(db),
        productos_mas_vendidos=_mas_vendidos(db, inicios["mes"]),
        stock=_stock_tienda(db),
    )
