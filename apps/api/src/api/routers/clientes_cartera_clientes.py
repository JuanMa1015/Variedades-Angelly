"""Router de clientes de cartera."""

from __future__ import annotations

import unicodedata
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.pagination import PageInfo, search_filter
from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.routers.cartera_shared import to_cliente_model_response, to_cliente_response
from src.api.schemas.cartera import ClienteCreateRequest, ClienteResponse, ClienteUpdateRequest
from src.api.services.antiguedad_deuda import dias_de_deuda_cartera, estado_deuda
from src.api.services.auditoria import registrar_auditoria
from src.api.services.telefono import TelefonoInvalido, normalizar_telefono
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import ClienteModel, VentaModel
from src.infrastructure.repositories.sqlalchemy_repository import SqlAlchemyClienteRepository

router = APIRouter(tags=["clientes-cartera-clientes"])

LARGO_MINIMO_DOCUMENTO = 5


def _clave_nombre(nombre: str) -> str:
    """Nombre comparable: sin tildes, sin mayusculas y con un solo espacio entre palabras."""
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", nombre) if unicodedata.category(c) != "Mn")
    return " ".join(sin_tildes.casefold().split())


def _nombre_limpio(valor: str | None) -> str:
    nombre = " ".join((valor or "").split())
    if len(nombre) < 3:
        raise HTTPException(status_code=400, detail="El nombre debe tener al menos 3 letras")
    return nombre


def _telefono_o_error(valor: str | None) -> str | None:
    try:
        return normalizar_telefono(valor)
    except TelefonoInvalido as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _documento_limpio(valor: str | None) -> str | None:
    """Sin espacios; vacio es "sin documento" (None), nunca un texto vacio que chocaria con otro vacio."""
    documento = (valor or "").strip()
    if not documento:
        return None
    if len(documento) < LARGO_MINIMO_DOCUMENTO:
        raise HTTPException(status_code=422, detail=f"El documento debe tener al menos {LARGO_MINIMO_DOCUMENTO} caracteres")
    return documento


def _exigir_unicos(
    db: Session,
    *,
    nombre: str,
    telefono: str | None,
    documento: str | None,
    excluir_id: int | None = None,
) -> None:
    """Nombre, WhatsApp y documento no se repiten entre clientes de cartera (activos o desactivados)."""
    clave = _clave_nombre(nombre)
    for otro in db.execute(select(ClienteModel)).scalars():
        if otro.id == excluir_id:
            continue
        sufijo = " (desactivado: reactivalo en lugar de crearlo de nuevo)" if not otro.activo else ""
        if _clave_nombre(otro.nombre) == clave:
            raise HTTPException(status_code=409, detail=f"Ya existe un cliente con ese nombre: {otro.nombre}{sufijo}")
        if documento is not None and otro.documento == documento:
            raise HTTPException(status_code=409, detail=f"El documento ya pertenece a otro cliente: {otro.nombre}{sufijo}")
        if telefono is not None and otro.telefono_whatsapp:
            try:
                igual = normalizar_telefono(otro.telefono_whatsapp) == telefono
            except TelefonoInvalido:
                igual = otro.telefono_whatsapp == telefono  # un numero viejo con formato raro solo choca si es identico
            if igual:
                raise HTTPException(status_code=409, detail=f"Ya existe un cliente con ese WhatsApp: {otro.nombre}{sufijo}")


def _auditar(db: Session, usuario: str, accion: str, cliente: ClienteModel, detalle: str) -> None:
    registrar_auditoria(
        db,
        usuario=usuario,
        modulo="clientes_cartera",
        entidad="cliente_cartera",
        accion=accion,
        entidad_id=cliente.id,
        detalle=f"{cliente.nombre}: {detalle}",
    )


FiltroClientes = Literal["activos", "con_deuda", "alerta", "moroso", "desactivados", "todos"]


class ClientesCarteraPageResponse(BaseModel):
    data: list[ClienteResponse]
    page: PageInfo


class ResumenDeudaCarteraResponse(BaseModel):
    """Cifras de TODA la cartera (no solo de la pagina que se ve)."""

    clientes_activos: int
    con_deuda: int
    deuda_total: float
    en_alerta: int
    deuda_en_alerta: float
    morosos: int
    deuda_morosa: float
    desactivados: int


def _compras(db: Session, ids: list[int]) -> dict[int, tuple[int, float]]:
    if not ids:
        return {}
    filas = db.execute(
        select(
            VentaModel.cliente_id,
            func.count(VentaModel.id),
            func.coalesce(func.sum(VentaModel.total), 0),
        )
        .where(VentaModel.cliente_id.in_(ids), VentaModel.anulada.is_(False))
        .group_by(VentaModel.cliente_id),
    ).all()
    return {int(f[0]): (int(f[1] or 0), float(f[2] or 0)) for f in filas if f[0] is not None}


@router.get("/api/cartera/clientes/paginados", response_model=ClientesCarteraPageResponse)
def list_clientes_paginados(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    q: str | None = Query(default=None, max_length=100, description="Nombre, documento o parte del WhatsApp"),
    estado: FiltroClientes = Query(default="activos"),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClientesCarteraPageResponse:
    """Busqueda, filtro y pagina resueltos en el servidor; alerta/moroso se juzgan por antiguedad de la deuda."""
    query = select(ClienteModel)
    if estado == "desactivados":
        query = query.where(ClienteModel.activo.is_(False))
    elif estado != "todos":
        query = query.where(ClienteModel.activo.is_(True))
    if estado in ("con_deuda", "alerta", "moroso"):
        query = query.where(ClienteModel.deuda_total > 0)

    termino = " ".join((q or "").split())
    if termino:
        condiciones = list(search_filter(termino, ClienteModel.nombre, ClienteModel.documento))
        digitos = "".join(c for c in termino if c.isdigit())
        if len(digitos) >= 3:  # "300 111" encuentra 573001112233 y tambien 3001112233
            condiciones.append(ClienteModel.telefono_whatsapp.contains(digitos))
        query = query.where(or_(*condiciones))

    if estado in ("alerta", "moroso"):
        candidatos = db.execute(query).scalars().all()
        dias = dias_de_deuda_cartera(db, list(candidatos))
        ids = [c.id for c in candidatos if estado_deuda(float(c.deuda_total), dias.get(c.id)) == estado]
        query = select(ClienteModel).where(ClienteModel.id.in_(ids)) if ids else select(ClienteModel).where(False)

    orden = (
        (ClienteModel.deuda_total.desc(), ClienteModel.nombre.asc())
        if estado in ("con_deuda", "alerta", "moroso")
        else (ClienteModel.nombre.asc(),)
    )
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    clientes = db.execute(query.order_by(*orden).offset((page - 1) * limit).limit(limit)).scalars().all()
    compras = _compras(db, [c.id for c in clientes])
    dias_pagina = dias_de_deuda_cartera(db, list(clientes))
    return ClientesCarteraPageResponse(
        data=[
            to_cliente_model_response(
                c,
                compras_total=compras.get(c.id, (0, 0.0))[1],
                compras_cantidad=compras.get(c.id, (0, 0.0))[0],
                dias_deuda=dias_pagina.get(c.id),
            )
            for c in clientes
        ],
        page=PageInfo(total=total, total_pages=max(1, (total + limit - 1) // limit), current_page=page, limit=limit),
    )


@router.get("/api/cartera/clientes/resumen-deuda", response_model=ResumenDeudaCarteraResponse)
def get_resumen_deuda(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ResumenDeudaCarteraResponse:
    activos = db.execute(select(ClienteModel).where(ClienteModel.activo.is_(True))).scalars().all()
    desactivados = db.execute(
        select(func.count()).select_from(ClienteModel).where(ClienteModel.activo.is_(False)),
    ).scalar_one()
    con_deuda = [c for c in activos if float(c.deuda_total or 0) > 0]
    dias = dias_de_deuda_cartera(db, con_deuda)
    estados = {c.id: estado_deuda(float(c.deuda_total), dias.get(c.id)) for c in con_deuda}
    alerta = [c for c in con_deuda if estados[c.id] == "alerta"]
    morosos = [c for c in con_deuda if estados[c.id] == "moroso"]
    return ResumenDeudaCarteraResponse(
        clientes_activos=len(activos),
        con_deuda=len(con_deuda),
        deuda_total=round(sum(float(c.deuda_total) for c in con_deuda), 2),
        en_alerta=len(alerta),
        deuda_en_alerta=round(sum(float(c.deuda_total) for c in alerta), 2),
        morosos=len(morosos),
        deuda_morosa=round(sum(float(c.deuda_total) for c in morosos), 2),
        desactivados=int(desactivados),
    )


@router.get("/api/clientes", response_model=list[ClienteResponse])
def list_clientes(
    db: Session = Depends(get_db),
    include_inactivos: bool = Query(default=False),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> list[ClienteResponse]:
    query = select(ClienteModel)
    if not include_inactivos:
        query = query.where(ClienteModel.activo == True)  # noqa: E712
    clientes = db.execute(
        query.order_by(ClienteModel.nombre.asc()),
    ).scalars().all()

    cliente_ids = [c.id for c in clientes]

    compras_por_cliente_rows = []
    if cliente_ids:
        compras_por_cliente_rows = db.execute(
            select(
                VentaModel.cliente_id,
                func.count(VentaModel.id).label("compras_cantidad"),
                func.coalesce(func.sum(VentaModel.total), 0).label("compras_total"),
            )
            .where(VentaModel.cliente_id.in_(cliente_ids), VentaModel.anulada.is_(False))
            .group_by(VentaModel.cliente_id),
        ).all()

    compras_por_cliente: dict[int, tuple[int, float]] = {
        int(row.cliente_id): (int(row.compras_cantidad or 0), float(row.compras_total or 0))
        for row in compras_por_cliente_rows
        if row.cliente_id is not None
    }
    dias = dias_de_deuda_cartera(db, clientes)

    return [
        to_cliente_model_response(
            cliente,
            compras_total=compras_por_cliente.get(cliente.id, (0, 0.0))[1],
            compras_cantidad=compras_por_cliente.get(cliente.id, (0, 0.0))[0],
            dias_deuda=dias.get(cliente.id),
        )
        for cliente in clientes
    ]


@router.post("/api/clientes", response_model=ClienteResponse, status_code=201)
@router.post("/api/cartera/clientes", response_model=ClienteResponse, status_code=201)
def create_cliente(
    payload: ClienteCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClienteResponse:
    nombre = _nombre_limpio(payload.nombre)
    documento = _documento_limpio(payload.documento)
    telefono = _telefono_o_error(payload.telefono_whatsapp)
    _exigir_unicos(db, nombre=nombre, telefono=telefono, documento=documento)

    cliente = ClienteModel(
        nombre=nombre,
        documento=documento,
        telefono_whatsapp=telefono,
        limite_credito=0,
        deuda_total=0.0,
    )

    try:
        db.add(cliente)
        db.flush()
        _auditar(db, current_user.username, "crear", cliente, f"documento {documento or 'sin documento'}; WhatsApp {telefono or 'sin numero'}")
        db.commit()
        db.refresh(cliente)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El documento ya existe para otro cliente",
        ) from exc

    return to_cliente_model_response(cliente)


@router.patch("/api/cartera/clientes/{cliente_id}", response_model=ClienteResponse)
def update_cliente_cartera(
    cliente_id: int,
    payload: ClienteUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClienteResponse:
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id).with_for_update(),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    enviados = payload.model_fields_set & {"nombre", "documento", "telefono_whatsapp"}
    if not enviados:
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    # Un campo enviado como null o vacio se borra (documento y WhatsApp son opcionales); el nombre no.
    nombre = _nombre_limpio(payload.nombre) if "nombre" in enviados else cliente.nombre
    documento = _documento_limpio(payload.documento) if "documento" in enviados else cliente.documento
    telefono = _telefono_o_error(payload.telefono_whatsapp) if "telefono_whatsapp" in enviados else cliente.telefono_whatsapp

    cambios: list[str] = []
    if nombre != cliente.nombre:
        cambios.append(f"nombre '{cliente.nombre}' -> '{nombre}'")
    if documento != cliente.documento:
        cambios.append(f"documento {cliente.documento or 'vacio'} -> {documento or 'vacio'}")
    if telefono != cliente.telefono_whatsapp:
        cambios.append(f"WhatsApp {cliente.telefono_whatsapp or 'vacio'} -> {telefono or 'vacio'}")

    if cambios:
        _exigir_unicos(db, nombre=nombre, telefono=telefono, documento=documento, excluir_id=cliente_id)
        cliente.nombre = nombre
        cliente.documento = documento
        cliente.telefono_whatsapp = telefono
        _auditar(db, current_user.username, "editar", cliente, "; ".join(cambios))

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflicto de datos al actualizar cliente") from exc

    db.refresh(cliente)
    return to_cliente_model_response(cliente)


@router.delete(
    "/api/cartera/clientes/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_cartera(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> Response:
    """Desactiva al cliente: su historial de ventas y abonos se conserva y se puede reactivar."""
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id).with_for_update(),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Desactivarlo sacaria su deuda de los totales y de la lista de cobro: primero se cobra.
    if float(cliente.deuda_total or 0) > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar (desactivar) un cliente que tiene deuda pendiente. Cobra la deuda primero.",
        )

    if cliente.activo:
        cliente.activo = False
        _auditar(db, current_user.username, "desactivar", cliente, "desactivado")
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/api/clientes/{cliente_id}/reactivar", status_code=200)
def reactivar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> dict:
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if not cliente.activo:
        cliente.activo = True
        _auditar(db, current_user.username, "reactivar", cliente, "reactivado")
        db.commit()
    return {"message": "Cliente reactivado"}


@router.get("/api/clientes/{nombre}", response_model=ClienteResponse)
def get_cliente_por_nombre(
    nombre: str,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClienteResponse:
    repository = SqlAlchemyClienteRepository(db)
    cliente = repository.get_by_nombre(nombre)

    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return to_cliente_response(cliente)
