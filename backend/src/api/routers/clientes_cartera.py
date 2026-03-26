"""Router de clientes y cartera."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.application.services.ventas_service import build_recibo_text
from src.domain.cliente import Cliente
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    ClienteModel,
    DetalleVentaModel,
    ProductoModel,
    VentaModel,
)
from src.infrastructure.repositories.sqlalchemy_repository import SqlAlchemyClienteRepository

router = APIRouter(tags=["clientes-cartera"])

FIADO_ORIGEN_CARTERA = "cartera"


class ClienteResponse(BaseModel):
    """DTO de salida para el endpoint de clientes."""

    id: int
    nombre: str
    documento: str | None
    telefono_whatsapp: str | None = None
    limite_credito: float
    deuda_total: float


class ClienteCarteraPageResponse(BaseModel):
    """Respuesta paginada para listado de cartera en UI."""

    data: list[ClienteResponse]
    total_pages: int
    current_page: int


class MovimientoClienteResponse(BaseModel):
    """DTO de salida para historial paginado del cliente."""

    id: int
    tipo: str
    descripcion: str | None = None
    articulo: str | None = None
    cantidad: int | None = None
    referencia: str | None = None
    monto: float
    fecha: datetime
    saldo: float


class MovimientoClientePageResponse(BaseModel):
    """Respuesta paginada para movimientos del modal de detalle."""

    data: list[MovimientoClienteResponse]
    total_pages: int
    current_page: int


class ClienteCreateRequest(BaseModel):
    """DTO de entrada para crear clientes desde UI."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    documento: Annotated[str | None, Field(min_length=5, max_length=30)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None
    limite_credito: Annotated[float, Field(gt=0)]


class ClienteUpdateRequest(BaseModel):
    """DTO de entrada para editar cliente de cartera."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    documento: Annotated[str | None, Field(min_length=5, max_length=30)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None
    limite_credito: Annotated[float | None, Field(gt=0)] = None


class VentaItemCreateRequest(BaseModel):
    """DTO de cada item a vender."""

    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0)]


class CarteraVentaCreateRequest(BaseModel):
    """Entrada para registrar una venta en el libro de cartera admin."""

    cliente_id: Annotated[int, Field(gt=0)]
    items: Annotated[list[VentaItemCreateRequest], Field(min_length=1)]
    abono_inicial: Annotated[float, Field(ge=0)] = 0
    fecha_venta: datetime | None = None
    referencia: Annotated[str | None, Field(max_length=255)] = None


class VentaDetalleResponse(BaseModel):
    """DTO de salida para lineas de una venta."""

    producto_id: int
    nombre_producto: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class VentaResponse(BaseModel):
    """DTO de salida para venta creada."""

    venta_id: int
    cliente_id: int | None
    cliente_tienda_id: int | None
    cliente_nombre: str | None
    es_fiado: bool
    fiado_origen: str | None
    total: float
    saldo_pendiente: float
    fecha: datetime
    detalles: list[VentaDetalleResponse]
    resumen_recibo: str


class AbonoCarteraCreateRequest(BaseModel):
    """Entrada para registrar abonos a deuda de cartera."""

    monto: Annotated[float, Field(gt=0)]
    fecha: datetime | None = None
    referencia: Annotated[str | None, Field(max_length=255)] = None


class AbonoCarteraResponse(BaseModel):
    """Salida de abonos registrados en cartera."""

    id: int
    cliente_id: int
    monto: float
    saldo_cliente: float
    referencia: str | None
    fecha: datetime


def _to_cliente_response(cliente: Cliente) -> ClienteResponse:
    return ClienteResponse(
        id=cliente.id or 0,
        nombre=cliente.nombre,
        documento=cliente.documento,
        telefono_whatsapp=getattr(cliente, "telefono_whatsapp", None),
        limite_credito=cliente.limite_credito,
        deuda_total=cliente.deuda_total,
    )


def _to_cliente_model_response(cliente: ClienteModel) -> ClienteResponse:
    return ClienteResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        documento=cliente.documento,
        telefono_whatsapp=cliente.telefono_whatsapp,
        limite_credito=cliente.limite_credito,
        deuda_total=cliente.deuda_total,
    )


def _to_abono_response(abono: AbonoCarteraModel) -> AbonoCarteraResponse:
    return AbonoCarteraResponse(
        id=abono.id,
        cliente_id=abono.cliente_id,
        monto=abono.monto,
        saldo_cliente=abono.saldo_cliente,
        referencia=abono.referencia,
        fecha=abono.fecha,
    )


def _normalize_naive_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.replace(tzinfo=None)


def _build_cliente_page_response(
    query,
    page: int,
    limit: int,
    db: Session,
) -> ClienteCarteraPageResponse:
    total_items = db.execute(
        select(func.count()).select_from(query.subquery()),
    ).scalar_one()
    total_pages = max(1, (total_items + limit - 1) // limit)
    offset = (page - 1) * limit

    clientes = db.execute(
        query.order_by(ClienteModel.nombre.asc()).offset(offset).limit(limit),
    ).scalars().all()

    return ClienteCarteraPageResponse(
        data=[_to_cliente_model_response(cliente) for cliente in clientes],
        total_pages=total_pages,
        current_page=page,
    )


@router.get("/api/clientes", response_model=list[ClienteResponse])
def list_clientes(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> list[ClienteResponse]:
    clientes = db.execute(
        select(ClienteModel).order_by(ClienteModel.nombre.asc()),
    ).scalars().all()
    return [_to_cliente_model_response(cliente) for cliente in clientes]


@router.get("/api/cartera/clientes", response_model=ClienteCarteraPageResponse)
def list_clientes_cartera_admin(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteCarteraPageResponse:
    query = select(ClienteModel)
    normalized_search = search.strip() if search else None

    if normalized_search:
        like_term = f"%{normalized_search}%"
        query = query.where(
            or_(
                ClienteModel.nombre.ilike(like_term),
                ClienteModel.documento.ilike(like_term),
                ClienteModel.telefono_whatsapp.ilike(like_term),
            ),
        )

    return _build_cliente_page_response(query=query, page=page, limit=limit, db=db)


@router.get("/api/clientes/cartera", response_model=ClienteCarteraPageResponse)
def list_clientes_cartera(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteCarteraPageResponse:
    query = select(ClienteModel).where(ClienteModel.deuda_total > 0)
    normalized_search = search.strip() if search else None

    if normalized_search:
        like_term = f"%{normalized_search}%"
        query = query.where(
            or_(
                ClienteModel.nombre.ilike(like_term),
                ClienteModel.documento.ilike(like_term),
                ClienteModel.telefono_whatsapp.ilike(like_term),
            ),
        )

    return _build_cliente_page_response(query=query, page=page, limit=limit, db=db)


@router.get(
    "/api/clientes/{cliente_id}/movimientos",
    response_model=MovimientoClientePageResponse,
)
@router.get(
    "/api/cartera/clientes/{cliente_id}/movimientos",
    response_model=MovimientoClientePageResponse,
)
def list_cliente_movimientos(
    cliente_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=5, ge=1, le=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> MovimientoClientePageResponse:
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ventas = db.execute(
        select(VentaModel)
        .where(VentaModel.cliente_id == cliente_id)
        .order_by(VentaModel.fecha.desc()),
    ).scalars().all()

    abonos = db.execute(
        select(AbonoCarteraModel)
        .where(AbonoCarteraModel.cliente_id == cliente_id)
        .order_by(AbonoCarteraModel.fecha.desc()),
    ).scalars().all()

    detalles_por_venta_id: dict[int, list[DetalleVentaModel]] = {}
    venta_ids = [venta.id for venta in ventas]
    if venta_ids:
        detalles = db.execute(
            select(DetalleVentaModel).where(DetalleVentaModel.venta_id.in_(venta_ids)),
        ).scalars().all()
        for detalle in detalles:
            detalles_por_venta_id.setdefault(detalle.venta_id, []).append(detalle)

    movimientos: list[MovimientoClienteResponse] = []
    for venta in ventas:
        detalles_venta = detalles_por_venta_id.get(venta.id, [])
        cantidad_total = sum(detalle.cantidad for detalle in detalles_venta) or None
        articulo = None
        if detalles_venta:
            if len(detalles_venta) == 1:
                articulo = detalles_venta[0].nombre_producto
            else:
                articulo = f"{detalles_venta[0].nombre_producto} +{len(detalles_venta) - 1} más"

        movimientos.append(
            MovimientoClienteResponse(
                id=venta.id,
                tipo="Venta",
                descripcion="Venta fiada" if venta.es_fiado else "Venta cancelada",
                articulo=articulo,
                cantidad=cantidad_total,
                monto=venta.total,
                fecha=venta.fecha,
                saldo=venta.saldo_pendiente,
            ),
        )

    for abono in abonos:
        movimientos.append(
            MovimientoClienteResponse(
                id=abono.id,
                tipo="Abono",
                descripcion="Pago aplicado a deuda",
                referencia=abono.referencia,
                monto=abono.monto,
                fecha=abono.fecha,
                saldo=abono.saldo_cliente,
            ),
        )

    movimientos.sort(key=lambda movimiento: movimiento.fecha, reverse=True)

    total_items = len(movimientos)
    total_pages = max(1, (total_items + limit - 1) // limit)
    start = (page - 1) * limit
    end = start + limit
    movimientos_paginados = movimientos[start:end]

    return MovimientoClientePageResponse(
        data=movimientos_paginados,
        total_pages=total_pages,
        current_page=page,
    )


@router.post("/api/cartera/clientes/{cliente_id}/abonos", response_model=AbonoCarteraResponse, status_code=201)
def create_abono_cartera(
    cliente_id: int,
    payload: AbonoCarteraCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> AbonoCarteraResponse:
    with db.begin():
        cliente = db.execute(
            select(ClienteModel)
            .where(ClienteModel.id == cliente_id)
            .with_for_update(),
        ).scalar_one_or_none()

        if cliente is None:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        monto = float(payload.monto)
        if monto > float(cliente.deuda_total):
            raise HTTPException(
                status_code=400,
                detail="El abono supera la deuda actual del cliente",
            )

        cliente.deuda_total = float(cliente.deuda_total - monto)
        abono = AbonoCarteraModel(
            cliente_id=cliente.id,
            monto=monto,
            saldo_cliente=cliente.deuda_total,
            referencia=payload.referencia,
            fecha=_normalize_naive_datetime(payload.fecha) or datetime.now(UTC),
        )
        db.add(abono)
        db.flush()

    db.refresh(abono)
    return _to_abono_response(abono)


@router.post("/api/clientes", response_model=ClienteResponse, status_code=201)
@router.post("/api/cartera/clientes", response_model=ClienteResponse, status_code=201)
def create_cliente(
    payload: ClienteCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteResponse:
    nombre_normalizado = payload.nombre.strip()
    if not nombre_normalizado:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")

    existente_por_nombre = db.execute(
        select(ClienteModel).where(ClienteModel.nombre == nombre_normalizado),
    ).scalar_one_or_none()
    if existente_por_nombre is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")

    documento = payload.documento.strip() if payload.documento else None
    telefono_whatsapp = payload.telefono_whatsapp.strip() if payload.telefono_whatsapp else None

    cliente = ClienteModel(
        nombre=nombre_normalizado,
        documento=documento,
        telefono_whatsapp=telefono_whatsapp,
        limite_credito=payload.limite_credito,
        deuda_total=0.0,
    )

    try:
        db.add(cliente)
        db.commit()
        db.refresh(cliente)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El documento ya existe para otro cliente",
        ) from exc

    return _to_cliente_model_response(cliente)


@router.patch("/api/cartera/clientes/{cliente_id}", response_model=ClienteResponse)
def update_cliente_cartera(
    cliente_id: int,
    payload: ClienteUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteResponse:
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if (
        payload.nombre is None
        and payload.documento is None
        and payload.telefono_whatsapp is None
        and payload.limite_credito is None
    ):
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ClienteModel).where(
                ClienteModel.nombre == nombre,
                ClienteModel.id != cliente_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")
        cliente.nombre = nombre

    if payload.documento is not None:
        cliente.documento = payload.documento.strip() or None

    if payload.telefono_whatsapp is not None:
        cliente.telefono_whatsapp = payload.telefono_whatsapp.strip() or None

    if payload.limite_credito is not None:
        if payload.limite_credito < float(cliente.deuda_total):
            raise HTTPException(
                status_code=400,
                detail="El limite de credito no puede ser menor que la deuda actual",
            )
        cliente.limite_credito = payload.limite_credito

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflicto de datos al actualizar cliente") from exc

    db.refresh(cliente)
    return _to_cliente_model_response(cliente)


@router.delete(
    "/api/cartera/clientes/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_cartera(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ventas_asociadas = db.execute(
        select(func.count())
        .select_from(VentaModel)
        .where(VentaModel.cliente_id == cliente_id),
    ).scalar_one()
    abonos_asociados = db.execute(
        select(func.count())
        .select_from(AbonoCarteraModel)
        .where(AbonoCarteraModel.cliente_id == cliente_id),
    ).scalar_one()

    if ventas_asociadas > 0 or abonos_asociados > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un cliente con historial de ventas o abonos",
        )

    db.delete(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/api/cartera/ventas", response_model=VentaResponse, status_code=201)
def create_cartera_venta(
    payload: CarteraVentaCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> VentaResponse:
    total = 0.0
    detalle_payload: list[VentaDetalleResponse] = []

    try:
        with db.begin():
            cliente = db.execute(
                select(ClienteModel)
                .where(ClienteModel.id == payload.cliente_id)
                .with_for_update(),
            ).scalar_one_or_none()

            if cliente is None:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")

            for item in payload.items:
                producto = db.execute(
                    select(ProductoModel)
                    .where(ProductoModel.id == item.producto_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if producto is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Producto {item.producto_id} no encontrado",
                    )

                if producto.stock_actual < item.cantidad:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Stock insuficiente para '{producto.nombre}'. "
                            f"Disponible: {producto.stock_actual}"
                        ),
                    )

                producto.stock_actual -= item.cantidad
                subtotal = float(item.cantidad * producto.precio_venta)
                total += subtotal

                detalle_payload.append(
                    VentaDetalleResponse(
                        producto_id=producto.id,
                        nombre_producto=producto.nombre,
                        cantidad=item.cantidad,
                        precio_unitario=producto.precio_venta,
                        subtotal=subtotal,
                    ),
                )

            abono_inicial = float(payload.abono_inicial)
            if abono_inicial > total:
                raise HTTPException(
                    status_code=400,
                    detail="El abono inicial no puede superar el total de la venta",
                )

            deuda_incremento = float(total - abono_inicial)
            nueva_deuda = float(cliente.deuda_total + deuda_incremento)
            if nueva_deuda > float(cliente.limite_credito):
                raise HTTPException(
                    status_code=400,
                    detail="Limite de credito excedido",
                )

            cliente.deuda_total = nueva_deuda

            fecha_venta = _normalize_naive_datetime(payload.fecha_venta) or datetime.now(UTC)
            venta = VentaModel(
                cliente_id=cliente.id,
                cliente_tienda_id=None,
                tipo_fiado=FIADO_ORIGEN_CARTERA if deuda_incremento > 0 else None,
                es_fiado=deuda_incremento > 0,
                total=total,
                saldo_pendiente=cliente.deuda_total,
                fecha=fecha_venta,
            )
            db.add(venta)
            db.flush()

            for detalle in detalle_payload:
                db.add(
                    DetalleVentaModel(
                        venta_id=venta.id,
                        producto_id=detalle.producto_id,
                        nombre_producto=detalle.nombre_producto,
                        cantidad=detalle.cantidad,
                        precio_unitario=detalle.precio_unitario,
                        subtotal=detalle.subtotal,
                    ),
                )

            if abono_inicial > 0:
                db.add(
                    AbonoCarteraModel(
                        cliente_id=cliente.id,
                        monto=abono_inicial,
                        saldo_cliente=cliente.deuda_total,
                        referencia=payload.referencia or f"Abono aplicado en venta #{venta.id}",
                        fecha=fecha_venta,
                    ),
                )

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No fue posible registrar la venta de cartera por conflicto de datos",
        ) from exc

    resumen = build_recibo_text(
        venta_id=venta.id,
        detalles=detalle_payload,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        cliente_nombre=cliente.nombre,
    )

    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_tienda_id=None,
        cliente_nombre=cliente.nombre,
        es_fiado=venta.es_fiado,
        fiado_origen=venta.tipo_fiado,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        fecha=venta.fecha,
        detalles=detalle_payload,
        resumen_recibo=resumen,
    )


@router.get("/api/clientes/{nombre}", response_model=ClienteResponse)
def get_cliente_por_nombre(
    nombre: str,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteResponse:
    repository = SqlAlchemyClienteRepository(db)
    cliente = repository.get_by_nombre(nombre)

    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return _to_cliente_response(cliente)
