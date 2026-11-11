"""Router CRUD para proveedores."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from src.api.services.auditoria import registrar_auditoria
from src.api.services.telefono import TelefonoInvalido, normalizar_telefono
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


def _telefono_o_400(valor: str | None) -> str | None:
    """Telefono en el formato unico (57 + digitos) o None si viene vacio."""
    try:
        return normalizar_telefono(valor)
    except TelefonoInvalido as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _validar_unicos(db: Session, *, nombre: str | None, telefono: str | None, excluir_id: int | None = None) -> None:
    """Nombre (sin distinguir mayusculas) y telefono no pueden repetirse entre proveedores."""
    if nombre is not None:
        query = select(ProveedorModel).where(func.lower(ProveedorModel.nombre) == nombre.lower())
        if excluir_id is not None:
            query = query.where(ProveedorModel.id != excluir_id)
        if db.execute(query).first() is not None:
            raise HTTPException(status_code=409, detail="Ya existe un proveedor con ese nombre")
    if telefono is not None:
        query = select(ProveedorModel).where(ProveedorModel.telefono.is_not(None))
        if excluir_id is not None:
            query = query.where(ProveedorModel.id != excluir_id)
        for otro in db.execute(query).scalars():
            try:
                igual = normalizar_telefono(otro.telefono) == telefono
            except TelefonoInvalido:
                igual = False  # un numero viejo con formato raro no bloquea
            if igual:
                raise HTTPException(status_code=409, detail=f"Ese telefono ya lo tiene el proveedor '{otro.nombre}'")


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
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProveedorResponse:
    nombre = payload.nombre.strip()
    if len(nombre) < 3:
        raise HTTPException(status_code=400, detail="El nombre debe tener al menos 3 caracteres")
    telefono = _telefono_o_400(payload.telefono)
    _validar_unicos(db, nombre=nombre, telefono=telefono)

    proveedor = ProveedorModel(
        nombre=nombre,
        contacto=(payload.contacto or "").strip() or None,
        telefono=telefono,
        activo=True,
    )
    db.add(proveedor)
    db.flush()
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="proveedores",
        entidad="proveedor",
        accion="crear",
        entidad_id=proveedor.id,
        detalle=f"Creado: {proveedor.nombre}",
    )
    db.commit()
    db.refresh(proveedor)
    return _to_proveedor_response(proveedor)


@router.patch("/api/proveedores/{proveedor_id}", response_model=ProveedorResponse)
def update_proveedor(
    proveedor_id: int,
    payload: ProveedorUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProveedorResponse:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    cambios: list[str] = []
    nombre = None
    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if len(nombre) < 3:
            raise HTTPException(status_code=400, detail="El nombre debe tener al menos 3 caracteres")
    telefono = _telefono_o_400(payload.telefono) if payload.telefono is not None else None
    _validar_unicos(
        db,
        nombre=nombre if nombre is not None and nombre.lower() != proveedor.nombre.lower() else None,
        telefono=telefono,
        excluir_id=proveedor_id,
    )

    if nombre is not None and nombre != proveedor.nombre:
        cambios.append(f"nombre: {proveedor.nombre} -> {nombre}")
        proveedor.nombre = nombre

    if payload.contacto is not None:
        contacto = payload.contacto.strip() or None
        if contacto != proveedor.contacto:
            cambios.append(f"contacto: {proveedor.contacto or '-'} -> {contacto or '-'}")
            proveedor.contacto = contacto

    if payload.telefono is not None and telefono != proveedor.telefono:
        cambios.append(f"telefono: {proveedor.telefono or '-'} -> {telefono or '-'}")
        proveedor.telefono = telefono

    if payload.activo is not None and payload.activo != proveedor.activo:
        cambios.append("activado" if payload.activo else "desactivado")
        proveedor.activo = payload.activo

    if cambios:
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="proveedores",
            entidad="proveedor",
            accion="actualizar",
            entidad_id=proveedor.id,
            detalle="; ".join(cambios),
        )
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
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProveedorResponse:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    proveedor.activo = not proveedor.activo
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="proveedores",
        entidad="proveedor",
        accion="actualizar",
        entidad_id=proveedor.id,
        detalle="activado" if proveedor.activo else "desactivado",
    )
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
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
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
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="proveedores",
        entidad="proveedor",
        accion="eliminar",
        entidad_id=proveedor.id,
        detalle=f"Eliminado: {proveedor.nombre}",
    )
    db.delete(proveedor)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
