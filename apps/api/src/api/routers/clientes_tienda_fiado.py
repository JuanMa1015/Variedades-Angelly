"""Router de clientes fiado operativos de tienda."""

from __future__ import annotations

import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.services.auditoria import registrar_auditoria
from src.api.services.telefono import TelefonoInvalido, normalizar_telefono
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import ClienteFiadoTiendaModel, VentaModel

router = APIRouter(tags=["clientes-tienda-fiado"])


class ClienteFiadoTiendaResponse(BaseModel):
    """DTO para clientes fiados operativos de tienda."""

    id: int
    nombre: str
    telefono_whatsapp: str | None
    deuda_total: float = 0.0


class ClienteFiadoTiendaCreateRequest(BaseModel):
    """Entrada para crear clientes fiados de tienda."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None
    # Otra persona con el mismo nombre (homonimo): se registra solo si quien atiende lo confirma.
    confirmar_homonimo: bool = False


class ClienteFiadoTiendaUpdateRequest(BaseModel):
    """Entrada para editar cliente fiado operativo de tienda."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None
    deuda_total: Annotated[float | None, Field(ge=0)] = None
    # Ajustar la deuda a mano es un movimiento de dinero: exige un motivo y queda en la auditoria.
    motivo_ajuste: Annotated[str | None, Field(min_length=3, max_length=200)] = None
    confirmar_homonimo: bool = False


def _clave_nombre(nombre: str) -> str:
    """Nombre comparable: sin tildes, sin mayusculas y con un solo espacio entre palabras."""
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", nombre) if unicodedata.category(c) != "Mn")
    return " ".join(sin_tildes.casefold().split())


def _telefono_o_error(valor: str | None) -> str | None:
    try:
        return normalizar_telefono(valor)
    except TelefonoInvalido as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _homonimos(db: Session, nombre: str, excluir_id: int | None = None) -> list[ClienteFiadoTiendaModel]:
    clave = _clave_nombre(nombre)
    activos = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.activo.is_(True)),
    ).scalars().all()
    return [c for c in activos if c.id != excluir_id and _clave_nombre(c.nombre) == clave]


def _exigir_no_duplicado(
    db: Session,
    nombre: str,
    telefono: str | None,
    confirmar: bool,
    excluir_id: int | None = None,
) -> JSONResponse | None:
    """Mismo nombre y mismo WhatsApp es el mismo cliente (error). Mismo nombre y otro numero puede ser un homonimo."""
    coincidencias = _homonimos(db, nombre, excluir_id)
    if telefono is not None and any(c.telefono_whatsapp == telefono for c in coincidencias):
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre y ese WhatsApp")
    if coincidencias and not confirmar:
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Ya hay un cliente con ese nombre. Si es otra persona, confirma para registrarla.",
                "homonimo": True,
                "coincidencias": [
                    {"id": c.id, "nombre": c.nombre, "telefono_whatsapp": c.telefono_whatsapp} for c in coincidencias
                ],
            },
        )
    return None


def _auditar(db: Session, usuario: str, accion: str, cliente: ClienteFiadoTiendaModel, detalle: str) -> None:
    registrar_auditoria(
        db,
        usuario=usuario,
        modulo="clientes_tienda",
        entidad="cliente_tienda",
        accion=accion,
        entidad_id=cliente.id,
        detalle=f"{cliente.nombre}: {detalle}",
    )


@router.get("/api/clientes/tienda-fiado", response_model=list[ClienteFiadoTiendaResponse])
def list_clientes_fiado_tienda(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    include_inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> list[ClienteFiadoTiendaResponse]:
    query = select(ClienteFiadoTiendaModel)
    if not include_inactivos:
        query = query.where(ClienteFiadoTiendaModel.activo == True)
    offset = (page - 1) * limit
    clientes = db.execute(
        query.order_by(ClienteFiadoTiendaModel.nombre.asc()).offset(offset).limit(limit),
    ).scalars().all()

    return [
        ClienteFiadoTiendaResponse(
            id=cliente.id,
            nombre=cliente.nombre,
            telefono_whatsapp=cliente.telefono_whatsapp,
            deuda_total=cliente.deuda_total,
        )
        for cliente in clientes
    ]


@router.post("/api/clientes/tienda-fiado", response_model=ClienteFiadoTiendaResponse, status_code=201, responses={409: {"description": "Duplicado o homonimo por confirmar"}})
def create_cliente_fiado_tienda(
    payload: ClienteFiadoTiendaCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> ClienteFiadoTiendaResponse | JSONResponse:
    nombre = " ".join(payload.nombre.split())
    telefono = _telefono_o_error(payload.telefono_whatsapp)
    conflicto = _exigir_no_duplicado(db, nombre, telefono, payload.confirmar_homonimo)
    if conflicto is not None:
        return conflicto

    cliente = ClienteFiadoTiendaModel(nombre=nombre, telefono_whatsapp=telefono)
    db.add(cliente)
    db.flush()
    _auditar(db, current_user.username, "crear", cliente, f"WhatsApp {cliente.telefono_whatsapp or 'sin numero'}")
    db.commit()
    db.refresh(cliente)

    return ClienteFiadoTiendaResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        deuda_total=cliente.deuda_total,
    )


@router.patch("/api/clientes/tienda-fiado/{cliente_id}", response_model=ClienteFiadoTiendaResponse)
def update_cliente_fiado_tienda(
    cliente_id: int,
    payload: ClienteFiadoTiendaUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> ClienteFiadoTiendaResponse | JSONResponse:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id).with_for_update(),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")

    cambios: list[str] = []
    if payload.nombre is not None:
        nombre = " ".join(payload.nombre.split())
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        telefono_final = (
            _telefono_o_error(payload.telefono_whatsapp) if payload.telefono_whatsapp is not None else cliente.telefono_whatsapp
        )
        if _clave_nombre(nombre) != _clave_nombre(cliente.nombre) or telefono_final != cliente.telefono_whatsapp:
            conflicto = _exigir_no_duplicado(db, nombre, telefono_final, payload.confirmar_homonimo, excluir_id=cliente_id)
            if conflicto is not None:
                db.rollback()
                return conflicto
        if nombre != cliente.nombre:
            cambios.append(f"nombre '{cliente.nombre}' -> '{nombre}'")
        cliente.nombre = nombre

    if payload.telefono_whatsapp is not None:
        telefono = _telefono_o_error(payload.telefono_whatsapp)
        if telefono != cliente.telefono_whatsapp:
            cambios.append(f"WhatsApp {cliente.telefono_whatsapp or 'vacio'} -> {telefono or 'vacio'}")
        cliente.telefono_whatsapp = telefono

    if payload.deuda_total is not None and round(float(payload.deuda_total), 2) != round(float(cliente.deuda_total), 2):
        motivo = (payload.motivo_ajuste or "").strip()
        if not motivo:
            raise HTTPException(status_code=400, detail="Indica el motivo del ajuste de la deuda")
        cambios.append(f"deuda {float(cliente.deuda_total)} -> {float(payload.deuda_total)}. Motivo: {motivo}")
        cliente.deuda_total = float(payload.deuda_total)

    if cambios:
        _auditar(db, current_user.username, "ajustar_deuda" if any(c.startswith("deuda") for c in cambios) else "editar", cliente, "; ".join(cambios))
    db.commit()
    db.refresh(cliente)

    return ClienteFiadoTiendaResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        deuda_total=cliente.deuda_total,
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
    current_user: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> Response:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id).with_for_update(),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")

    # Eliminarlo sacaria su deuda de los totales: primero se cobra o se ajusta con motivo.
    if float(cliente.deuda_total or 0) > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un cliente que tiene deuda pendiente. Cobra o ajusta la deuda primero.",
        )

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

    cliente.activo = False
    _auditar(db, current_user.username, "eliminar", cliente, "desactivado")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/api/clientes/tienda-fiado/{cliente_id}/reactivar", status_code=200)
def reactivar_cliente_fiado_tienda(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> dict:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")
    cliente.activo = True
    _auditar(db, current_user.username, "reactivar", cliente, "reactivado")
    db.commit()
    return {"message": "Cliente reactivado"}