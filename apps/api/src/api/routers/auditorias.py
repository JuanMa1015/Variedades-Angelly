"""Router de auditoria: solo se consulta. Los registros los crea el sistema y nadie los edita ni los borra."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import AuditoriaModel

router = APIRouter(tags=["auditorias"])

# El admin (cartera) solo ve lo que pasa en cartera; el superadmin lo ve todo.
MODULOS_DEL_ADMIN = ("cartera", "clientes_cartera")


class AuditoriaResponse(BaseModel):
    """Salida para registros de auditoria administrativa."""

    id: int
    modulo: str
    entidad: str
    entidad_id: int | None
    accion: str
    detalle: str | None
    usuario: str
    fecha: datetime


class AuditoriaPageResponse(BaseModel):
    data: list[AuditoriaResponse]
    page: PageInfo


def _to_auditoria_response(auditoria: AuditoriaModel) -> AuditoriaResponse:
    return AuditoriaResponse(
        id=auditoria.id,
        modulo=auditoria.modulo,
        entidad=auditoria.entidad,
        entidad_id=auditoria.entidad_id,
        accion=auditoria.accion,
        detalle=auditoria.detalle,
        usuario=auditoria.usuario,
        fecha=auditoria.fecha,
    )


def _consulta(
    usuario_actual: AuthenticatedUser,
    modulo: str | None,
    accion: str | None,
    usuario: str | None,
    q: str | None,
    desde: date | None,
    hasta: date | None,
):
    query = select(AuditoriaModel)
    if usuario_actual.role != "superadmin":
        query = query.where(AuditoriaModel.modulo.in_(MODULOS_DEL_ADMIN))
    if modulo:
        query = query.where(AuditoriaModel.modulo == modulo.strip())
    if accion:
        query = query.where(AuditoriaModel.accion == accion.strip())
    if usuario:
        query = query.where(AuditoriaModel.usuario == usuario.strip())
    if desde is not None:
        query = query.where(AuditoriaModel.fecha >= datetime.combine(desde, time.min))
    if hasta is not None:
        query = query.where(AuditoriaModel.fecha < datetime.combine(hasta + timedelta(days=1), time.min))
    texto = " ".join((q or "").split())
    if texto:
        patron = f"%{texto}%"
        query = query.where(or_(AuditoriaModel.detalle.ilike(patron), AuditoriaModel.entidad.ilike(patron), AuditoriaModel.usuario.ilike(patron)))
    return query


@router.get("/api/auditorias", response_model=list[AuditoriaResponse])
def list_auditorias(
    modulo: str | None = Query(default=None),
    accion: str | None = Query(default=None),
    usuario: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> list[AuditoriaResponse]:
    query = _consulta(current_user, modulo, accion, usuario, q, desde, hasta)
    auditorias = db.execute(
        query.order_by(AuditoriaModel.fecha.desc(), AuditoriaModel.id.desc()).offset((page - 1) * limit).limit(limit),
    ).scalars().all()
    return [_to_auditoria_response(auditoria) for auditoria in auditorias]


@router.get("/api/auditorias/paginadas", response_model=AuditoriaPageResponse)
def list_auditorias_paginadas(
    modulo: str | None = Query(default=None),
    accion: str | None = Query(default=None),
    usuario: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AuditoriaPageResponse:
    """Historial con busqueda, filtros por modulo, accion, usuario y fechas, y paginas."""
    query = _consulta(current_user, modulo, accion, usuario, q, desde, hasta)
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    filas = db.execute(
        query.order_by(AuditoriaModel.fecha.desc(), AuditoriaModel.id.desc()).offset((page - 1) * limit).limit(limit),
    ).scalars().all()
    return AuditoriaPageResponse(
        data=[_to_auditoria_response(a) for a in filas],
        page=PageInfo(total=total, total_pages=max(1, (total + limit - 1) // limit), current_page=page, limit=limit),
    )
