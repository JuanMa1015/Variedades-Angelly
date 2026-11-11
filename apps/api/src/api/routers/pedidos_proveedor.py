"""Router CRUD para pedidos a proveedor."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from src.api.services.auditoria import registrar_auditoria
from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo, build_page, search_filter
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import PedidoProveedorModel, ProveedorModel

router = APIRouter(tags=["pedidos-proveedor"])

PEDIDO_ESTADO_ENVIADO = "enviado"
PEDIDO_ESTADO_RECIBIDO = "recibido"
PEDIDO_ESTADO_CANCELADO = "cancelado"
DESCRIPCION_MAX = 1000


class PedidoProveedorResponse(BaseModel):
    id: int
    proveedor_id: int
    proveedor_nombre: str
    descripcion: str
    monto_estimado: float
    estado: str
    creado_por: str
    aprobado_por: str | None
    fecha_creacion: datetime
    fecha_resolucion: datetime | None
    resuelto_por: str | None = None
    nota: str | None = None
    factura_id: int | None = None


class PedidoEstadoRequest(BaseModel):
    estado: Literal["enviado", "recibido", "cancelado"]
    nota: Annotated[str | None, Field(max_length=200)] = None


class PedidoProveedorCreateRequest(BaseModel):
    proveedor_id: Annotated[int, Field(gt=0)]
    descripcion: Annotated[str, Field(min_length=4, max_length=DESCRIPCION_MAX)]
    monto_estimado: Annotated[float, Field(gt=0)]


class PedidoProveedorPageResponse(BaseModel):
    data: list[PedidoProveedorResponse]
    page: PageInfo


class PedidoProveedorUpdateRequest(BaseModel):
    descripcion: Annotated[str | None, Field(min_length=4, max_length=DESCRIPCION_MAX)] = None
    monto_estimado: Annotated[float | None, Field(gt=0)] = None


def _to_pedido_proveedor_response(
    pedido: PedidoProveedorModel,
    proveedor_nombre: str,
) -> PedidoProveedorResponse:
    return PedidoProveedorResponse(
        id=pedido.id,
        proveedor_id=pedido.proveedor_id,
        proveedor_nombre=proveedor_nombre,
        descripcion=pedido.descripcion,
        monto_estimado=pedido.monto_estimado,
        estado=pedido.estado,
        creado_por=pedido.creado_por,
        aprobado_por=pedido.aprobado_por,
        fecha_creacion=pedido.fecha_creacion,
        fecha_resolucion=pedido.fecha_resolucion,
        resuelto_por=pedido.resuelto_por,
        nota=pedido.nota,
        factura_id=pedido.factura_id,
    )


@router.get("/api/proveedores/pedidos", response_model=list[PedidoProveedorResponse])
def list_pedidos_proveedor(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[PedidoProveedorResponse]:
    pedidos = db.execute(
        select(PedidoProveedorModel).order_by(PedidoProveedorModel.fecha_creacion.desc()),
    ).scalars().all()

    proveedor_ids = {pedido.proveedor_id for pedido in pedidos}
    proveedores_map: dict[int, str] = {}
    if proveedor_ids:
        proveedores = db.execute(
            select(ProveedorModel).where(ProveedorModel.id.in_(proveedor_ids)),
        ).scalars().all()
        proveedores_map = {item.id: item.nombre for item in proveedores}

    return [
        _to_pedido_proveedor_response(
            pedido,
            proveedor_nombre=proveedores_map.get(pedido.proveedor_id, "Proveedor"),
        )
        for pedido in pedidos
    ]


@router.get("/api/proveedores/pedidos/paginados", response_model=PedidoProveedorPageResponse)
def list_pedidos_proveedor_paginados(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    estado: Literal["todos", "enviado", "recibido", "cancelado"] = Query(default="todos"),
    proveedor_id: int | None = Query(default=None, gt=0),
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> PedidoProveedorPageResponse:
    query = select(PedidoProveedorModel).join(ProveedorModel, ProveedorModel.id == PedidoProveedorModel.proveedor_id)
    if estado != "todos":
        query = query.where(PedidoProveedorModel.estado == estado)
    if proveedor_id is not None:
        query = query.where(PedidoProveedorModel.proveedor_id == proveedor_id)
    termino = (q or "").strip()
    if termino:
        query = query.where(or_(*search_filter(termino, ProveedorModel.nombre, PedidoProveedorModel.descripcion)))
    items, page_info = build_page(db, query, page, limit, PedidoProveedorModel.fecha_creacion.desc())

    proveedor_ids = {pedido.proveedor_id for pedido in items}
    proveedores_map: dict[int, str] = {}
    if proveedor_ids:
        proveedores = db.execute(
            select(ProveedorModel).where(ProveedorModel.id.in_(proveedor_ids)),
        ).scalars().all()
        proveedores_map = {item.id: item.nombre for item in proveedores}

    return PedidoProveedorPageResponse(
        data=[
            _to_pedido_proveedor_response(
                pedido,
                proveedor_nombre=proveedores_map.get(pedido.proveedor_id, "Proveedor"),
            )
            for pedido in items
        ],
        page=page_info,
    )


@router.post(
    "/api/proveedores/pedidos",
    response_model=PedidoProveedorResponse,
    status_code=201,
)
def create_pedido_proveedor(
    payload: PedidoProveedorCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> PedidoProveedorResponse:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == payload.proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    if not proveedor.activo:
        raise HTTPException(status_code=409, detail="El proveedor esta desactivado: activalo para hacerle pedidos")

    pedido = PedidoProveedorModel(
        proveedor_id=payload.proveedor_id,
        descripcion=payload.descripcion,
        monto_estimado=payload.monto_estimado,
        estado=PEDIDO_ESTADO_ENVIADO,
        creado_por=current_user.username,
        aprobado_por=None,
        fecha_resolucion=None,
    )
    db.add(pedido)
    db.flush()
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="proveedores",
        entidad="pedido_proveedor",
        accion="crear",
        entidad_id=pedido.id,
        detalle=f"Pedido a {proveedor.nombre} por {payload.monto_estimado:.0f}",
    )
    db.commit()
    db.refresh(pedido)

    return _to_pedido_proveedor_response(pedido, proveedor_nombre=proveedor.nombre)


@router.put(
    "/api/proveedores/pedidos/{pedido_id}/estado",
    response_model=PedidoProveedorResponse,
)
def cambiar_estado_pedido(
    pedido_id: int,
    payload: PedidoEstadoRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> PedidoProveedorResponse:
    """enviado -> recibido | cancelado. Reabrir (volver a enviado) solo si no tiene factura."""
    pedido = db.execute(
        select(PedidoProveedorModel).where(PedidoProveedorModel.id == pedido_id).with_for_update(),
    ).scalar_one_or_none()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    anterior = pedido.estado
    nuevo = payload.estado
    if nuevo == anterior:
        raise HTTPException(status_code=409, detail=f"El pedido ya esta {anterior}")
    if nuevo == PEDIDO_ESTADO_ENVIADO and pedido.factura_id is not None:
        raise HTTPException(
            status_code=409,
            detail=f"El pedido quedo recibido con la factura #{pedido.factura_id}: elimina esa factura para reabrirlo",
        )
    if anterior != PEDIDO_ESTADO_ENVIADO and nuevo != PEDIDO_ESTADO_ENVIADO:
        raise HTTPException(status_code=409, detail=f"El pedido ya esta {anterior}: reabrelo antes de cambiarlo")

    pedido.estado = nuevo
    if nuevo == PEDIDO_ESTADO_ENVIADO:
        pedido.fecha_resolucion = None
        pedido.resuelto_por = None
        pedido.nota = None
    else:
        pedido.fecha_resolucion = datetime.now(UTC).replace(tzinfo=None)
        pedido.resuelto_por = current_user.username
        pedido.nota = (payload.nota or "").strip() or None
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="proveedores",
        entidad="pedido_proveedor",
        accion="cambiar_estado",
        entidad_id=pedido.id,
        detalle=f"{anterior} -> {nuevo}" + (f" ({pedido.nota})" if pedido.nota else ""),
    )
    db.commit()
    db.refresh(pedido)

    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == pedido.proveedor_id),
    ).scalar_one_or_none()
    return _to_pedido_proveedor_response(pedido, proveedor_nombre=proveedor.nombre if proveedor else "Proveedor")


@router.patch(
    "/api/proveedores/pedidos/{pedido_id}",
    response_model=PedidoProveedorResponse,
)
def update_pedido_proveedor(
    pedido_id: int,
    payload: PedidoProveedorUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> PedidoProveedorResponse:
    pedido = db.execute(
        select(PedidoProveedorModel).where(PedidoProveedorModel.id == pedido_id),
    ).scalar_one_or_none()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    if payload.descripcion is not None:
        pedido.descripcion = payload.descripcion.strip()

    if payload.monto_estimado is not None:
        pedido.monto_estimado = payload.monto_estimado

    db.commit()
    db.refresh(pedido)

    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == pedido.proveedor_id),
    ).scalar_one_or_none()
    proveedor_nombre = proveedor.nombre if proveedor is not None else "Proveedor"
    return _to_pedido_proveedor_response(pedido, proveedor_nombre=proveedor_nombre)


@router.delete(
    "/api/proveedores/pedidos/{pedido_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_pedido_proveedor(
    pedido_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> Response:
    pedido = db.execute(
        select(PedidoProveedorModel).where(PedidoProveedorModel.id == pedido_id),
    ).scalar_one_or_none()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    db.delete(pedido)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
