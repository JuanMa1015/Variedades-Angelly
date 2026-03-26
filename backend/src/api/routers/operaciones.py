"""Router para proveedores, pedidos de proveedor y gastos."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import GastoModel, PedidoProveedorModel, ProveedorModel

router = APIRouter(tags=["operaciones"])

PEDIDO_ESTADO_ENVIADO = "enviado"


class ProveedorResponse(BaseModel):
    """DTO de salida para proveedores."""

    id: int
    nombre: str
    contacto: str | None
    telefono: str | None
    activo: bool


class ProveedorCreateRequest(BaseModel):
    """DTO de entrada para alta de proveedores."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    contacto: Annotated[str | None, Field(max_length=120)] = None
    telefono: Annotated[str | None, Field(max_length=25)] = None


class ProveedorUpdateRequest(BaseModel):
    """Entrada para editar proveedor."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    contacto: Annotated[str | None, Field(max_length=120)] = None
    telefono: Annotated[str | None, Field(max_length=25)] = None
    activo: bool | None = None


class PedidoProveedorResponse(BaseModel):
    """DTO de salida para pedidos a proveedor."""

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


class PedidoProveedorCreateRequest(BaseModel):
    """DTO de entrada para crear un pedido a proveedor."""

    proveedor_id: Annotated[int, Field(gt=0)]
    descripcion: Annotated[str, Field(min_length=4, max_length=255)]
    monto_estimado: Annotated[float, Field(gt=0)]


class PedidoProveedorUpdateRequest(BaseModel):
    """Entrada para editar pedido a proveedor."""

    descripcion: Annotated[str | None, Field(min_length=4, max_length=255)] = None
    monto_estimado: Annotated[float | None, Field(gt=0)] = None


class GastoResponse(BaseModel):
    """DTO de salida para gastos operativos."""

    id: int
    categoria: str
    descripcion: str
    monto: float
    fecha: datetime
    registrado_por: str


class GastoCreateRequest(BaseModel):
    """DTO de entrada para registrar un gasto."""

    categoria: Annotated[str, Field(min_length=3, max_length=50)]
    descripcion: Annotated[str, Field(min_length=4, max_length=255)]
    monto: Annotated[float, Field(gt=0)]


class GastoUpdateRequest(BaseModel):
    """Entrada para editar gasto operativo."""

    categoria: Annotated[str | None, Field(min_length=3, max_length=50)] = None
    descripcion: Annotated[str | None, Field(min_length=4, max_length=255)] = None
    monto: Annotated[float | None, Field(gt=0)] = None


def _to_proveedor_response(proveedor: ProveedorModel) -> ProveedorResponse:
    return ProveedorResponse(
        id=proveedor.id,
        nombre=proveedor.nombre,
        contacto=proveedor.contacto,
        telefono=proveedor.telefono,
        activo=proveedor.activo,
    )


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
    )


@router.get("/api/proveedores", response_model=list[ProveedorResponse])
def list_proveedores(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[ProveedorResponse]:
    proveedores = db.execute(
        select(ProveedorModel).order_by(ProveedorModel.nombre.asc()),
    ).scalars().all()
    return [_to_proveedor_response(item) for item in proveedores]


@router.post("/api/proveedores", response_model=ProveedorResponse, status_code=201)
def create_proveedor(
    payload: ProveedorCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
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
    _: AuthenticatedUser = Depends(require_roles("admin")),
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


@router.delete(
    "/api/proveedores/{proveedor_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_proveedor(
    proveedor_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    pedidos_asociados = db.execute(
        select(func.count())
        .select_from(PedidoProveedorModel)
        .where(PedidoProveedorModel.proveedor_id == proveedor_id),
    ).scalar_one()
    if pedidos_asociados > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un proveedor con pedidos registrados",
        )

    db.delete(proveedor)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/proveedores/pedidos", response_model=list[PedidoProveedorResponse])
def list_pedidos_proveedor(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
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


@router.post(
    "/api/proveedores/pedidos",
    response_model=PedidoProveedorResponse,
    status_code=201,
)
def create_pedido_proveedor(
    payload: PedidoProveedorCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> PedidoProveedorResponse:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == payload.proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    pedido = PedidoProveedorModel(
        proveedor_id=payload.proveedor_id,
        descripcion=payload.descripcion,
        monto_estimado=payload.monto_estimado,
        estado=PEDIDO_ESTADO_ENVIADO,
        creado_por=current_user.username,
        aprobado_por=None,
        fecha_resolucion=datetime.now(UTC),
    )
    db.add(pedido)
    db.commit()
    db.refresh(pedido)

    return _to_pedido_proveedor_response(pedido, proveedor_nombre=proveedor.nombre)


@router.patch(
    "/api/proveedores/pedidos/{pedido_id}",
    response_model=PedidoProveedorResponse,
)
def update_pedido_proveedor(
    pedido_id: int,
    payload: PedidoProveedorUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
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
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    pedido = db.execute(
        select(PedidoProveedorModel).where(PedidoProveedorModel.id == pedido_id),
    ).scalar_one_or_none()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    db.delete(pedido)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/gastos", response_model=list[GastoResponse])
def list_gastos(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[GastoResponse]:
    gastos = db.execute(
        select(GastoModel).order_by(GastoModel.fecha.desc()),
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


@router.post("/api/gastos", response_model=GastoResponse, status_code=201)
def create_gasto(
    payload: GastoCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
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
    _: AuthenticatedUser = Depends(require_roles("admin")),
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
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    gasto = db.execute(
        select(GastoModel).where(GastoModel.id == gasto_id),
    ).scalar_one_or_none()
    if gasto is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    db.delete(gasto)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
