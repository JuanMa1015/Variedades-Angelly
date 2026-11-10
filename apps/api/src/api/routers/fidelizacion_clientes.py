"""Router del modulo de fidelizacion de clientes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.services.fidelizacion import pesos_por_punto, umbral_bono, valor_punto
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import ClienteFidelizacionModel

router = APIRouter(tags=["fidelizacion-clientes"])


class FidelizacionConfigResponse(BaseModel):
    """Reglas del programa (fuente unica para el frontend)."""

    umbral_bono: int
    pesos_por_punto: int
    valor_punto: int


@router.get("/api/fidelizacion/config", response_model=FidelizacionConfigResponse)
def get_fidelizacion_config(
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> FidelizacionConfigResponse:
    return FidelizacionConfigResponse(
        umbral_bono=umbral_bono(),
        pesos_por_punto=pesos_por_punto(),
        valor_punto=valor_punto(),
    )


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
    # El cliente debe autorizar el uso de sus datos para inscribirlo.
    acepta_datos: bool = False


class ClienteFidelizacionUpdateRequest(BaseModel):
    """Entrada para editar cliente de fidelizacion."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(min_length=7, max_length=25)] = None
    puntos_acumulados: Annotated[int | None, Field(ge=0)] = None


@router.get("/api/fidelizacion/clientes", response_model=list[ClienteFidelizacionResponse])
def list_clientes_fidelizacion(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    include_inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[ClienteFidelizacionResponse]:
    query = select(ClienteFidelizacionModel)
    if not include_inactivos:
        query = query.where(ClienteFidelizacionModel.activo == True)
    offset = (page - 1) * limit
    clientes = db.execute(
        query.order_by(
            ClienteFidelizacionModel.puntos_acumulados.desc(),
            ClienteFidelizacionModel.nombre.asc(),
        ).offset(offset).limit(limit),
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
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ClienteFidelizacionResponse:
    if not payload.acepta_datos:
        raise HTTPException(status_code=400, detail="El cliente debe autorizar el tratamiento de sus datos")
    # Solo quien administra puede fijar puntos iniciales; el vendedor inscribe en cero.
    puntos_iniciales = payload.puntos_acumulados if current_user.role in {"admin", "superadmin"} else 0
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
        puntos_acumulados=puntos_iniciales,
        acepta_datos=True,
        acepta_datos_en=datetime.now(UTC).replace(tzinfo=None),
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
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
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
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> Response:
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    cliente.activo = False
    db.commit()
    return Response(status_code=204)


@router.put("/api/fidelizacion/clientes/{cliente_id}/reactivar", status_code=200)
def reactivar_cliente_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> dict:
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    cliente.activo = True
    db.commit()
    return {"message": "Cliente reactivado"}
