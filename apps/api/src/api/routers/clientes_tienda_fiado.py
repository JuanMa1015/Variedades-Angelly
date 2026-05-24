"""Router de clientes fiado operativos de tienda."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import ClienteFiadoTiendaModel, VentaModel

router = APIRouter(tags=["clientes-tienda-fiado"])


class ClienteFiadoTiendaResponse(BaseModel):
    """DTO para clientes fiados operativos de tienda."""

    id: int
    nombre: str
    telefono_whatsapp: str | None


class ClienteFiadoTiendaCreateRequest(BaseModel):
    """Entrada para crear clientes fiados de tienda."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None


class ClienteFiadoTiendaUpdateRequest(BaseModel):
    """Entrada para editar cliente fiado operativo de tienda."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None


@router.get("/api/clientes/tienda-fiado", response_model=list[ClienteFiadoTiendaResponse])
def list_clientes_fiado_tienda(
    db: Session = Depends(get_db),
    include_inactivos: bool = Query(default=False),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> list[ClienteFiadoTiendaResponse]:
    query = select(ClienteFiadoTiendaModel)
    if not include_inactivos:
        query = query.where(ClienteFiadoTiendaModel.activo == True)
    clientes = db.execute(
        query.order_by(ClienteFiadoTiendaModel.nombre.asc()),
    ).scalars().all()

    return [
        ClienteFiadoTiendaResponse(
            id=cliente.id,
            nombre=cliente.nombre,
            telefono_whatsapp=cliente.telefono_whatsapp,
        )
        for cliente in clientes
    ]


@router.post("/api/clientes/tienda-fiado", response_model=ClienteFiadoTiendaResponse, status_code=201)
def create_cliente_fiado_tienda(
    payload: ClienteFiadoTiendaCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> ClienteFiadoTiendaResponse:
    existente = db.execute(
        select(ClienteFiadoTiendaModel).where(
            ClienteFiadoTiendaModel.nombre == payload.nombre,
        ),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")

    cliente = ClienteFiadoTiendaModel(
        nombre=payload.nombre,
        telefono_whatsapp=payload.telefono_whatsapp,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    return ClienteFiadoTiendaResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
    )


@router.patch("/api/clientes/tienda-fiado/{cliente_id}", response_model=ClienteFiadoTiendaResponse)
def update_cliente_fiado_tienda(
    cliente_id: int,
    payload: ClienteFiadoTiendaUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> ClienteFiadoTiendaResponse:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ClienteFiadoTiendaModel).where(
                ClienteFiadoTiendaModel.nombre == nombre,
                ClienteFiadoTiendaModel.id != cliente_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")
        cliente.nombre = nombre

    if payload.telefono_whatsapp is not None:
        cliente.telefono_whatsapp = payload.telefono_whatsapp.strip() or None

    db.commit()
    db.refresh(cliente)

    return ClienteFiadoTiendaResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
    )


@router.delete(
    "/api/clientes/tienda-fiado/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_fiado_tienda(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> Response:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")

    ventas_asociadas = db.execute(
        select(func.count())
        .select_from(VentaModel)
        .where(VentaModel.cliente_tienda_id == cliente_id),
    ).scalar_one()
    if ventas_asociadas > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un cliente con historial de ventas",
        )

    db.delete(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)