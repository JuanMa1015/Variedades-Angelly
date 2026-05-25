"""Router CRUD para gastos operativos."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo, build_page
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import GastoModel

router = APIRouter(tags=["gastos"])


class GastoResponse(BaseModel):
    id: int
    categoria: str
    descripcion: str
    monto: float
    fecha: datetime
    registrado_por: str


class GastoPageResponse(BaseModel):
    data: list[GastoResponse]
    page: PageInfo


class GastoCreateRequest(BaseModel):
    categoria: Annotated[str, Field(min_length=3, max_length=50)]
    descripcion: Annotated[str, Field(min_length=4, max_length=255)]
    monto: Annotated[float, Field(gt=0)]


class GastoUpdateRequest(BaseModel):
    categoria: Annotated[str | None, Field(min_length=3, max_length=50)] = None
    descripcion: Annotated[str | None, Field(min_length=4, max_length=255)] = None
    monto: Annotated[float | None, Field(gt=0)] = None


@router.get("/api/gastos", response_model=list[GastoResponse])
def list_gastos(
    db: Session = Depends(get_db),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[GastoResponse]:
    query = select(GastoModel)
    if fecha_desde:
        query = query.where(GastoModel.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.where(GastoModel.fecha <= fecha_hasta)
    gastos = db.execute(
        query.order_by(GastoModel.fecha.desc()),
    ).scalars().all()
    return [
        GastoResponse(
            id=gasto.id,
            categoria=gasto.categoria,
            descripcion=gasto.descripcion,
            monto=gasto.monto,
            fecha=gasto.fecha,
            registrado_por=gasto.registrado_por,
        )
        for gasto in gastos
    ]


@router.get("/api/gastos/paginados", response_model=GastoPageResponse)
def list_gastos_paginados(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> GastoPageResponse:
    query = select(GastoModel)
    if fecha_desde:
        query = query.where(GastoModel.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.where(GastoModel.fecha <= fecha_hasta)
    items, page_info = build_page(db, query, page, limit, GastoModel.fecha.desc())
    return GastoPageResponse(
        data=[
            GastoResponse(
                id=gasto.id,
                categoria=gasto.categoria,
                descripcion=gasto.descripcion,
                monto=gasto.monto,
                fecha=gasto.fecha,
                registrado_por=gasto.registrado_por,
            )
            for gasto in items
        ],
        page=page_info,
    )


@router.post("/api/gastos", response_model=GastoResponse, status_code=201)
def create_gasto(
    payload: GastoCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> GastoResponse:
    gasto = GastoModel(
        categoria=payload.categoria,
        descripcion=payload.descripcion,
        monto=payload.monto,
        registrado_por=current_user.username,
    )
    db.add(gasto)
    db.commit()
    db.refresh(gasto)

    return GastoResponse(
        id=gasto.id,
        categoria=gasto.categoria,
        descripcion=gasto.descripcion,
        monto=gasto.monto,
        fecha=gasto.fecha,
        registrado_por=gasto.registrado_por,
    )


@router.patch("/api/gastos/{gasto_id}", response_model=GastoResponse)
def update_gasto(
    gasto_id: int,
    payload: GastoUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> GastoResponse:
    gasto = db.execute(
        select(GastoModel).where(GastoModel.id == gasto_id),
    ).scalar_one_or_none()
    if gasto is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    if payload.categoria is not None:
        gasto.categoria = payload.categoria.strip()

    if payload.descripcion is not None:
        gasto.descripcion = payload.descripcion.strip()

    if payload.monto is not None:
        gasto.monto = payload.monto

    db.commit()
    db.refresh(gasto)

    return GastoResponse(
        id=gasto.id,
        categoria=gasto.categoria,
        descripcion=gasto.descripcion,
        monto=gasto.monto,
        fecha=gasto.fecha,
        registrado_por=gasto.registrado_por,
    )


@router.delete(
    "/api/gastos/{gasto_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_gasto(
    gasto_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> Response:
    gasto = db.execute(
        select(GastoModel).where(GastoModel.id == gasto_id),
    ).scalar_one_or_none()
    if gasto is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    db.delete(gasto)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
