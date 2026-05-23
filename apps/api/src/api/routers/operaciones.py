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
from src.infrastructure.database.models import (
    FacturaCompraDetalleModel,
    FacturaCompraModel,
    GastoModel,
    PedidoProveedorModel,
    ProductoModel,
    ProveedorModel,
)

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


class FacturaDetalleCreateRequest(BaseModel):
    """Linea de producto para registrar una factura de compra."""

    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0)]
    aplica_iva: bool = False
    precio_unitario: Annotated[float, Field(gt=0)]


class FacturaCompraCreateRequest(BaseModel):
    """Entrada para crear factura con detalle de productos."""

    proveedor_id: Annotated[int, Field(gt=0)]
    items: Annotated[list[FacturaDetalleCreateRequest], Field(min_length=1)]


class FacturaDetalleResponse(BaseModel):
    """Salida por linea de factura de compra."""

    producto_id: int
    nombre_producto: str
    cantidad: int
    aplica_iva: bool
    precio_unitario: float
    precio_total: float


class FacturaCompraResponse(BaseModel):
    """Salida de factura de compra registrada."""

    id: int
    proveedor_id: int
    proveedor_nombre: str
    creado_por: str
    subtotal: float
    total_iva: float
    total_factura: float
    fecha_creacion: datetime
    items: list[FacturaDetalleResponse]


class FacturaCompraUpdateRequest(BaseModel):
    """Entrada para editar una factura de compra."""

    total_factura: Annotated[float | None, Field(gt=0)] = None


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


def _to_factura_response(
    factura: FacturaCompraModel,
    proveedor_nombre: str,
    items: list[FacturaCompraDetalleModel],
) -> FacturaCompraResponse:
    return FacturaCompraResponse(
        id=factura.id,
        proveedor_id=factura.proveedor_id,
        proveedor_nombre=proveedor_nombre,
        creado_por=factura.creado_por,
        subtotal=factura.subtotal,
        total_iva=factura.total_iva,
        total_factura=factura.total_factura,
        fecha_creacion=factura.fecha_creacion,
        items=[
            FacturaDetalleResponse(
                producto_id=item.producto_id,
                nombre_producto=item.nombre_producto,
                cantidad=item.cantidad,
                aplica_iva=item.aplica_iva,
                precio_unitario=item.precio_unitario,
                precio_total=item.precio_total,
            )
            for item in items
        ],
    )


@router.get("/api/proveedores", response_model=list[ProveedorResponse])
def list_proveedores(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[ProveedorResponse]:
    proveedores = db.execute(
        select(ProveedorModel).order_by(ProveedorModel.nombre.asc()),
    ).scalars().all()
    return [_to_proveedor_response(item) for item in proveedores]


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
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
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
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
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


@router.get("/api/gastos", response_model=list[GastoResponse])
def list_gastos(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
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


@router.get("/api/facturas-compra", response_model=list[FacturaCompraResponse])
def list_facturas_compra(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> list[FacturaCompraResponse]:
    facturas = db.execute(
        select(FacturaCompraModel).order_by(FacturaCompraModel.fecha_creacion.desc()),
    ).scalars().all()

    if not facturas:
        return []

    proveedor_ids = {factura.proveedor_id for factura in facturas}
    proveedores = db.execute(
        select(ProveedorModel).where(ProveedorModel.id.in_(proveedor_ids)),
    ).scalars().all()
    proveedor_map = {proveedor.id: proveedor.nombre for proveedor in proveedores}

    factura_ids = [factura.id for factura in facturas]
    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(FacturaCompraDetalleModel.factura_id.in_(factura_ids)),
    ).scalars().all()

    detalles_map: dict[int, list[FacturaCompraDetalleModel]] = {}
    for detalle in detalles:
        detalles_map.setdefault(detalle.factura_id, []).append(detalle)

    return [
        _to_factura_response(
            factura,
            proveedor_nombre=proveedor_map.get(factura.proveedor_id, "Proveedor"),
            items=detalles_map.get(factura.id, []),
        )
        for factura in facturas
    ]


@router.post("/api/facturas-compra", response_model=FacturaCompraResponse, status_code=201)
def create_factura_compra(
    payload: FacturaCompraCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> FacturaCompraResponse:
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == payload.proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    producto_ids = {item.producto_id for item in payload.items}
    productos = db.execute(
        select(ProductoModel).where(ProductoModel.id.in_(producto_ids)),
    ).scalars().all()
    productos_map = {producto.id: producto for producto in productos}

    if len(productos_map) != len(producto_ids):
        raise HTTPException(status_code=404, detail="Uno o mas productos no existen")

    subtotal = 0.0
    total_iva = 0.0
    detalles_payload: list[dict] = []

    for item in payload.items:
        producto = productos_map[item.producto_id]
        base = item.cantidad * item.precio_unitario
        iva = base * 0.19 if item.aplica_iva else 0.0
        total_linea = base + iva

        subtotal += base
        total_iva += iva
        detalles_payload.append(
            {
                "producto_id": producto.id,
                "nombre_producto": producto.nombre,
                "cantidad": item.cantidad,
                "aplica_iva": item.aplica_iva,
                "precio_unitario": item.precio_unitario,
                "precio_total": total_linea,
            },
        )

    factura = FacturaCompraModel(
        proveedor_id=payload.proveedor_id,
        creado_por=current_user.username,
        subtotal=subtotal,
        total_iva=total_iva,
        total_factura=subtotal + total_iva,
    )
    db.add(factura)
    db.flush()

    detalles_creados: list[FacturaCompraDetalleModel] = []
    for item in detalles_payload:
        detalle = FacturaCompraDetalleModel(
            factura_id=factura.id,
            producto_id=item["producto_id"],
            nombre_producto=item["nombre_producto"],
            cantidad=item["cantidad"],
            aplica_iva=item["aplica_iva"],
            precio_unitario=item["precio_unitario"],
            precio_total=item["precio_total"],
        )
        db.add(detalle)
        detalles_creados.append(detalle)

    db.commit()
    db.refresh(factura)

    return _to_factura_response(
        factura,
        proveedor_nombre=proveedor.nombre,
        items=detalles_creados,
    )


@router.patch("/api/facturas-compra/{factura_id}", response_model=FacturaCompraResponse)
def update_factura_compra(
    factura_id: int,
    payload: FacturaCompraUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> FacturaCompraResponse:
    factura = db.execute(
        select(FacturaCompraModel).where(FacturaCompraModel.id == factura_id),
    ).scalar_one_or_none()
    if factura is None:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if payload.total_factura is not None:
        factura.total_factura = payload.total_factura

    db.commit()
    db.refresh(factura)

    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == factura.proveedor_id),
    ).scalar_one_or_none()
    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(
            FacturaCompraDetalleModel.factura_id == factura.id,
        ),
    ).scalars().all()

    return _to_factura_response(
        factura,
        proveedor_nombre=proveedor.nombre if proveedor else "Proveedor",
        items=detalles,
    )


@router.delete("/api/facturas-compra/{factura_id}", status_code=204)
def delete_factura_compra(
    factura_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> None:
    factura = db.execute(
        select(FacturaCompraModel).where(FacturaCompraModel.id == factura_id),
    ).scalar_one_or_none()
    if factura is None:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(
            FacturaCompraDetalleModel.factura_id == factura.id,
        ),
    ).scalars().all()
    for detalle in detalles:
        db.delete(detalle)
    db.delete(factura)
    db.commit()


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
