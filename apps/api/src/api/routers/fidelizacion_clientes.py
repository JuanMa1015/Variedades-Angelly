"""Router del modulo de fidelizacion de clientes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import ClienteFidelizacionModel

router = APIRouter(tags=["fidelizacion-clientes"])

FIDELIZACION_UMBRAL_BONO = 100


class ClienteFidelizacionResponse(BaseModel):
    """DTO de salida para clientes del modulo de fidelizacion."""

    id: int
    nombre: str
    telefono_whatsapp: str
    puntos_acumulados: int


class ClienteFidelizacionCreateRequest(BaseModel):
    """Entrada para crear cliente de fidelizacion."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    telefono_whatsapp: Annotated[str, Field(min_length=7, max_length=25)]
    puntos_acumulados: Annotated[int, Field(ge=0)] = 0


class ClienteFidelizacionUpdateRequest(BaseModel):
    """Entrada para editar cliente de fidelizacion."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(min_length=7, max_length=25)] = None
    puntos_acumulados: Annotated[int | None, Field(ge=0)] = None


@router.get("/api/fidelizacion/clientes", response_model=list[ClienteFidelizacionResponse])
def list_clientes_fidelizacion(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[ClienteFidelizacionResponse]:
    clientes = db.execute(
        select(ClienteFidelizacionModel).order_by(
            ClienteFidelizacionModel.puntos_acumulados.desc(),
            ClienteFidelizacionModel.nombre.asc(),
        ),
    ).scalars().all()

    return [
        ClienteFidelizacionResponse(
            id=cliente.id,
            nombre=cliente.nombre,
            telefono_whatsapp=cliente.telefono_whatsapp,
            puntos_acumulados=cliente.puntos_acumulados,
        )
        for cliente in clientes
    ]


@router.post("/api/fidelizacion/clientes", response_model=ClienteFidelizacionResponse, status_code=201)
def create_cliente_fidelizacion(
    payload: ClienteFidelizacionCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteFidelizacionResponse:
    existente = db.execute(
        select(ClienteFidelizacionModel).where(
            ClienteFidelizacionModel.telefono_whatsapp == payload.telefono_whatsapp,
        ),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese WhatsApp")

    cliente = ClienteFidelizacionModel(
        nombre=payload.nombre,
        telefono_whatsapp=payload.telefono_whatsapp,
        puntos_acumulados=payload.puntos_acumulados,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


@router.patch("/api/fidelizacion/clientes/{cliente_id}", response_model=ClienteFidelizacionResponse)
def update_cliente_fidelizacion(
    cliente_id: int,
    payload: ClienteFidelizacionUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteFidelizacionResponse:
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if payload.nombre is not None:
        cliente.nombre = payload.nombre.strip()

    if payload.telefono_whatsapp is not None:
        telefono = payload.telefono_whatsapp.strip()
        existente = db.execute(
            select(ClienteFidelizacionModel).where(
                ClienteFidelizacionModel.telefono_whatsapp == telefono,
                ClienteFidelizacionModel.id != cliente_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese WhatsApp")
        cliente.telefono_whatsapp = telefono

    if payload.puntos_acumulados is not None:
        cliente.puntos_acumulados = payload.puntos_acumulados

    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


@router.delete(
    "/api/fidelizacion/clientes/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    db.delete(cliente)
    db.commit()
    return Response(status_code=204)


@router.post("/api/fidelizacion/clientes/{cliente_id}/canjear-bono", response_model=ClienteFidelizacionResponse)
def canjear_bono_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ClienteFidelizacionResponse:
    cliente = db.execute(
        select(ClienteFidelizacionModel)
        .where(ClienteFidelizacionModel.id == cliente_id)
        .with_for_update(),
    ).scalar_one_or_none()

    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if cliente.puntos_acumulados < FIDELIZACION_UMBRAL_BONO:
        raise HTTPException(
            status_code=400,
            detail="El cliente aun no alcanza el umbral para canjear bono",
        )

    cliente.puntos_acumulados -= FIDELIZACION_UMBRAL_BONO
    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )