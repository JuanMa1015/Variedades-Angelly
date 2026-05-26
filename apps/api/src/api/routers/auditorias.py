"""Router de auditoria administrativa."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import AuditoriaModel

router = APIRouter(tags=["auditorias"])


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


class AuditoriaCreateRequest(BaseModel):
    """Entrada para registrar evento en tabla de auditorias."""

    modulo: Annotated[str, Field(min_length=2, max_length=50)]
    entidad: Annotated[str, Field(min_length=2, max_length=80)]
    entidad_id: Annotated[int | None, Field(gt=0)] = None
    accion: Annotated[str, Field(min_length=2, max_length=30)]
    detalle: Annotated[str | None, Field(max_length=500)] = None


class AuditoriaUpdateRequest(BaseModel):
    """Entrada para editar auditoria existente."""

    modulo: Annotated[str | None, Field(min_length=2, max_length=50)] = None
    entidad: Annotated[str | None, Field(min_length=2, max_length=80)] = None
    entidad_id: Annotated[int | None, Field(gt=0)] = None
    accion: Annotated[str | None, Field(min_length=2, max_length=30)] = None
    detalle: Annotated[str | None, Field(max_length=500)] = None


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


@router.get("/api/auditorias", response_model=list[AuditoriaResponse])
def list_auditorias(
    modulo: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> list[AuditoriaResponse]:
    query = select(AuditoriaModel)
    if modulo:
        query = query.where(AuditoriaModel.modulo == modulo.strip())

    offset = (page - 1) * limit
    auditorias = db.execute(
        query.order_by(AuditoriaModel.fecha.desc(), AuditoriaModel.id.desc()).offset(offset).limit(limit),
    ).scalars().all()
    return [_to_auditoria_response(auditoria) for auditoria in auditorias]


@router.post("/api/auditorias", response_model=AuditoriaResponse, status_code=201)
def create_auditoria(
    payload: AuditoriaCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AuditoriaResponse:
    auditoria = AuditoriaModel(
        modulo=payload.modulo.strip(),
        entidad=payload.entidad.strip(),
        entidad_id=payload.entidad_id,
        accion=payload.accion.strip(),
        detalle=payload.detalle.strip() if payload.detalle else None,
        usuario=current_user.username,
    )
    db.add(auditoria)
    db.commit()
    db.refresh(auditoria)
    return _to_auditoria_response(auditoria)


@router.patch("/api/auditorias/{auditoria_id}", response_model=AuditoriaResponse)
def update_auditoria(
    auditoria_id: int,
    payload: AuditoriaUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AuditoriaResponse:
    auditoria = db.execute(
        select(AuditoriaModel).where(AuditoriaModel.id == auditoria_id),
    ).scalar_one_or_none()
    if auditoria is None:
        raise HTTPException(status_code=404, detail="Auditoria no encontrada")

    campos = payload.model_fields_set
    if not campos:
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    if payload.modulo is not None:
        auditoria.modulo = payload.modulo.strip()
    if payload.entidad is not None:
        auditoria.entidad = payload.entidad.strip()
    if payload.entidad_id is not None:
        auditoria.entidad_id = payload.entidad_id
    if payload.accion is not None:
        auditoria.accion = payload.accion.strip()
    if payload.detalle is not None:
        auditoria.detalle = payload.detalle.strip() or None

    auditoria.usuario = current_user.username
    db.commit()
    db.refresh(auditoria)
    return _to_auditoria_response(auditoria)


@router.delete(
    "/api/auditorias/{auditoria_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_auditoria(
    auditoria_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> Response:
    auditoria = db.execute(
        select(AuditoriaModel).where(AuditoriaModel.id == auditoria_id),
    ).scalar_one_or_none()
    if auditoria is None:
        raise HTTPException(status_code=404, detail="Auditoria no encontrada")

    db.delete(auditoria)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
