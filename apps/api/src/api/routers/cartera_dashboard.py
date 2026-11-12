"""Dashboard de cartera: ventas y cobros del modulo, lo que falta por cobrar por antiguedad y los rankings."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.routers.clientes_cartera_cobros import calcular_cobrado
from src.api.schemas.cartera import CobradoCarteraResponse
from src.api.services.antiguedad_deuda import dias_de_deuda_cartera, estado_deuda
from src.domain.zona_horaria import a_utc_naive, inicio_del_dia_local
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import ClienteModel, VentaModel

router = APIRouter(tags=["cartera-dashboard"])

CUANTOS = 5


class VentasPeriodo(BaseModel):
    total: float = 0
    transacciones: int = 0
    a_credito: float = 0
    de_contado: float = 0


class VentasCarteraPeriodos(BaseModel):
    hoy: VentasPeriodo
    semana: VentasPeriodo
    mes: VentasPeriodo


class Tramo(BaseModel):
    clientes: int = 0
    monto: float = 0


class PorCobrar(BaseModel):
    deuda_total: float
    clientes_con_deuda: int
    saldo_promedio: float
    al_dia: Tramo  # hasta 30 dias
    alerta: Tramo  # 31 a 60 dias
    moroso: Tramo  # mas de 60 dias


class DeudorItem(BaseModel):
    id: int
    nombre: str
    deuda_total: float
    dias_deuda: int | None = None
    estado_deuda: str


class MejorClienteItem(BaseModel):
    id: int
    nombre: str
    compras_cantidad: int
    compras_total: float


class CarteraDashboardResponse(BaseModel):
    clientes_activos: int
    ventas: VentasCarteraPeriodos
    cobrado: CobradoCarteraResponse
    por_cobrar: PorCobrar
    mayores_deudores: list[DeudorItem]
    mejores_clientes: list[MejorClienteItem]


def _ventas_desde(db: Session, inicio: datetime) -> VentasPeriodo:
    """Ventas del modulo de cartera (no las del punto de venta) vigentes desde ``inicio``."""
    total, cantidad, credito = db.execute(
        select(
            func.coalesce(func.sum(VentaModel.total), 0.0),
            func.count(VentaModel.id),
            func.coalesce(func.sum(case((VentaModel.es_fiado.is_(True), VentaModel.total), else_=0.0)), 0.0),
        ).where(
            VentaModel.cliente_id.is_not(None),
            VentaModel.fuera_de_caja.is_(True),
            VentaModel.anulada.is_(False),
            VentaModel.fecha >= inicio,
        ),
    ).one()
    total, credito = round(float(total or 0), 2), round(float(credito or 0), 2)
    return VentasPeriodo(total=total, transacciones=int(cantidad or 0), a_credito=credito, de_contado=round(total - credito, 2))


@router.get("/api/cartera/dashboard", response_model=CarteraDashboardResponse)
def get_cartera_dashboard(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> CarteraDashboardResponse:
    """Todo lo que muestra el dashboard de cartera en una sola consulta, calculado en el servidor."""
    ahora = datetime.now(UTC)
    inicio_dia = inicio_del_dia_local(ahora)
    inicio_semana = inicio_dia - timedelta(days=inicio_dia.weekday())
    inicio_mes = inicio_dia.replace(day=1)
    ventas = VentasCarteraPeriodos(
        hoy=_ventas_desde(db, a_utc_naive(inicio_dia)),
        semana=_ventas_desde(db, a_utc_naive(inicio_semana)),
        mes=_ventas_desde(db, a_utc_naive(inicio_mes)),
    )

    activos = db.execute(select(ClienteModel).where(ClienteModel.activo.is_(True))).scalars().all()
    con_deuda = [c for c in activos if float(c.deuda_total or 0) > 0]
    dias = dias_de_deuda_cartera(db, con_deuda)
    estados = {c.id: estado_deuda(float(c.deuda_total), dias.get(c.id)) for c in con_deuda}

    tramos = {"al_dia": Tramo(), "alerta": Tramo(), "moroso": Tramo()}
    for cliente in con_deuda:
        tramo = tramos[estados[cliente.id]]
        tramo.clientes += 1
        tramo.monto = round(tramo.monto + float(cliente.deuda_total), 2)
    deuda_total = round(sum(float(c.deuda_total) for c in con_deuda), 2)
    por_cobrar = PorCobrar(
        deuda_total=deuda_total,
        clientes_con_deuda=len(con_deuda),
        saldo_promedio=round(deuda_total / len(con_deuda), 2) if con_deuda else 0.0,
        **tramos,
    )

    mayores = sorted(con_deuda, key=lambda c: (-float(c.deuda_total), c.nombre.casefold()))[:CUANTOS]
    mejores_filas = db.execute(
        select(
            ClienteModel.id,
            ClienteModel.nombre,
            func.count(VentaModel.id),
            func.coalesce(func.sum(VentaModel.total), 0.0),
        )
        .join(VentaModel, VentaModel.cliente_id == ClienteModel.id)
        .where(ClienteModel.activo.is_(True), VentaModel.anulada.is_(False))
        .group_by(ClienteModel.id, ClienteModel.nombre)
        .order_by(func.sum(VentaModel.total).desc(), func.count(VentaModel.id).desc(), ClienteModel.nombre.asc())
        .limit(CUANTOS),
    ).all()

    return CarteraDashboardResponse(
        clientes_activos=len(activos),
        ventas=ventas,
        cobrado=calcular_cobrado(db),
        por_cobrar=por_cobrar,
        mayores_deudores=[
            DeudorItem(id=c.id, nombre=c.nombre, deuda_total=float(c.deuda_total), dias_deuda=dias.get(c.id), estado_deuda=estados[c.id])
            for c in mayores
        ],
        mejores_clientes=[
            MejorClienteItem(id=f[0], nombre=f[1], compras_cantidad=int(f[2]), compras_total=round(float(f[3]), 2)) for f in mejores_filas
        ],
    )
