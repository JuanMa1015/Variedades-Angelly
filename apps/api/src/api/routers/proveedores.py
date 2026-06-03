"""Router CRUD para proveedores."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo, build_page
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    FacturaCompraModel,
    PedidoProveedorModel,
    ProductoModel,
    ProveedorModel,
)

router = APIRouter(tags=["proveedores"])


class ProveedorResponse(BaseModel):
    id: int
    nombre: str
    contacto: str | None
    telefono: str | None
    activo: bool


class ProveedorPageResponse(BaseModel):
    data: list[ProveedorResponse]
    page: PageInfo


class ProveedorCreateRequest(BaseModel):
    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    contacto: Annotated[str | None, Field(max_length=120)] = None
    telefono: Annotated[str | None, Field(max_length=25)] = None


class ProveedorUpdateRequest(BaseModel):
    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    contacto: Annotated[str | None, Field(max_length=120)] = None
    telefono: Annotated[str | None, Field(max_length=25)] = None
    activo: bool | None = None


def _to_proveedor_response(proveedor: ProveedorModel) -> ProveedorResponse:
    return ProveedorResponse(
        id=proveedor.id,
        nombre=proveedor.nombre,
        contacto=proveedor.contacto,
        telefono=proveedor.telefono,
        activo=proveedor.activo,
    )


@router.get("/api/proveedores", response_model=list[ProveedorResponse])
def list_proveedores(
    db: Session = Depends(get_db),
    include_inactivos: bool = Query(default=False),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[ProveedorResponse]:
    query = select(ProveedorModel)
    if not include_inactivos:
        query = query.where(ProveedorModel.activo == True)
    proveedores = db.execute(
        query.order_by(ProveedorModel.nombre.asc()),
    ).scalars().all()
    return [_to_proveedor_response(item) for item in proveedores]


@router.get("/api/proveedores/paginados", response_model=ProveedorPageResponse)
def list_proveedores_paginados(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    include_inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProveedorPageResponse:
    query = select(ProveedorModel)
    if not include_inactivos:
        query = query.where(ProveedorModel.activo == True)
    items, page_info = build_page(db, query, page, limit, ProveedorModel.nombre.asc())
    return ProveedorPageResponse(
        data=[_to_proveedor_response(item) for item in items],
        page=page_info,
    )


@router.post("/api/proveedores", response_model=ProveedorResponse, status_code=201)
def create_proveedor(
    payload: ProveedorCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProveedorResponse:
    existente = db.execute(
        select(ProveedorModel).where(ProveedorModel.nombre == payload.nombre),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un proveedor con ese nombre")

    proveedor = ProveedorModel(
        nombre=payload.nombre,
        contacto=payload.contacto,
        telefono=payload.telefono,
        activo=True,
    )
    db.add(proveedor)
    db.commit()
    db.refresh(proveedor)
    return _to_proveedor_response(proveedor)


@router.patch("/api/proveedores/{proveedor_id}", response_model=ProveedorResponse)
def update_proveedor(
    proveedor_id: int,
    payload: ProveedorUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProveedorResponse:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ProveedorModel).where(
                ProveedorModel.nombre == nombre,
                ProveedorModel.id != proveedor_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un proveedor con ese nombre")
        proveedor.nombre = nombre

    if payload.contacto is not None:
        proveedor.contacto = payload.contacto.strip() or None

    if payload.telefono is not None:
        proveedor.telefono = payload.telefono.strip() or None

    if payload.activo is not None:
        proveedor.activo = payload.activo

    db.commit()
    db.refresh(proveedor)
    return _to_proveedor_response(proveedor)


@router.put(
    "/api/proveedores/{proveedor_id}/toggle-activo",
    response_model=ProveedorResponse,
)
def toggle_proveedor_activo(
    proveedor_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProveedorResponse:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    proveedor.activo = not proveedor.activo
    db.commit()
    db.refresh(proveedor)
    return _to_proveedor_response(proveedor)


@router.delete(
    "/api/proveedores/{proveedor_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_proveedor(
    proveedor_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> Response:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    pedidos = db.execute(
        select(func.count()).select_from(PedidoProveedorModel).where(PedidoProveedorModel.proveedor_id == proveedor_id),
    ).scalar_one()
    facturas = db.execute(
        select(func.count()).select_from(FacturaCompraModel).where(FacturaCompraModel.proveedor_id == proveedor_id),
    ).scalar_one()

    bloqueos = []
    if pedidos > 0:
        bloqueos.append(f"{pedidos} pedido(s) de proveedor")
    if facturas > 0:
        bloqueos.append(f"{facturas} factura(s) de compra")

    if bloqueos:
        raise HTTPException(
            status_code=409,
            detail=f"No se puede eliminar: el proveedor tiene {' y '.join(bloqueos)}. Borra {'/'.join(b.split()[-1] for b in bloqueos)} primero.",
        )

    # Desvincular productos (activos o inactivos) para evitar FK constraint
    db.execute(
        update(ProductoModel)
        .where(ProductoModel.proveedor_id == proveedor_id)
        .values(proveedor_id=None),
    )
    db.flush()
    db.delete(proveedor)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
