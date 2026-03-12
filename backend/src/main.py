"""Aplicacion principal FastAPI para Variedades Angelly."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.domain.cliente import Cliente
from src.domain.producto import Producto
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    ClienteModel,
    DetalleVentaModel,
    ProductoModel,
    VentaModel,
)
from src.infrastructure.repositories.sqlalchemy_repository import (
    SqlAlchemyClienteRepository,
    SqlAlchemyProductoRepository,
)


class ClienteResponse(BaseModel):
    """DTO de salida para el endpoint de clientes."""

    id: int
    nombre: str
    documento: str | None
    limite_credito: float
    deuda_total: float


class ClienteCreateRequest(BaseModel):
    """DTO de entrada para crear clientes desde UI."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    documento: Annotated[str, Field(min_length=5, max_length=30)]
    limite_credito: Annotated[float, Field(gt=0)]


class ProductoResponse(BaseModel):
    """DTO de salida para consultas de inventario."""

    id: int
    nombre: str
    precio_costo: float
    precio_venta: float
    stock_actual: int
    stock_minimo: int
    stock_critico: bool


class ProductoCreateRequest(BaseModel):
    """DTO de entrada para crear productos nuevos."""

    nombre: Annotated[str, Field(min_length=2, max_length=120)]
    precio_costo: Annotated[float, Field(ge=0)]
    precio_venta: Annotated[float, Field(ge=0)]
    stock_actual: Annotated[int, Field(ge=0)] = 0
    stock_minimo: Annotated[int, Field(ge=0)] = 0


class ProductoStockPatchRequest(BaseModel):
    """DTO para ajustes rapidos de stock por delta."""

    delta: Annotated[int, Field(ne=0)]


class ProductoPrecioPatchRequest(BaseModel):
    """DTO para edicion inline de precio de venta."""

    precio_venta: Annotated[float, Field(ge=0)]


class VentaItemCreateRequest(BaseModel):
    """DTO de cada item a vender."""

    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0)]


class VentaCreateRequest(BaseModel):
    """DTO de entrada para registrar ventas."""

    cliente_id: Annotated[int | None, Field(gt=0)] = None
    items: Annotated[list[VentaItemCreateRequest], Field(min_length=1)]
    es_fiado: bool = False


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
    cliente_nombre: str | None
    es_fiado: bool
    total: float
    saldo_pendiente: float
    fecha: datetime
    detalles: list[VentaDetalleResponse]
    resumen_recibo: str


def _to_detalle_response(detalle: DetalleVentaModel) -> VentaDetalleResponse:
    """Convierte detalle persistido a DTO HTTP."""
    return VentaDetalleResponse(
        producto_id=detalle.producto_id,
        nombre_producto=detalle.nombre_producto,
        cantidad=detalle.cantidad,
        precio_unitario=detalle.precio_unitario,
        subtotal=detalle.subtotal,
    )


def _to_cliente_response(cliente: Cliente) -> ClienteResponse:
    """Convierte entidad de dominio a contrato HTTP."""
    return ClienteResponse(
        id=cliente.id or 0,
        nombre=cliente.nombre,
        documento=cliente.documento,
        limite_credito=cliente.limite_credito,
        deuda_total=cliente.deuda_total,
    )


def _to_producto_response(producto: Producto) -> ProductoResponse:
    """Convierte entidad de producto a contrato HTTP."""
    return ProductoResponse(
        id=producto.id or 0,
        nombre=producto.nombre,
        precio_costo=producto.precio_costo,
        precio_venta=producto.precio_venta,
        stock_actual=producto.stock_actual,
        stock_minimo=producto.stock_minimo,
        stock_critico=producto.stock_critico,
    )


def _build_recibo_text(
    venta_id: int,
    detalles: list[VentaDetalleResponse],
    total: float,
    saldo_pendiente: float,
    cliente_nombre: str | None,
) -> str:
    """Construye resumen textual para mostrar o enviar por WhatsApp."""
    lineas = ", ".join(
        f"{detalle.cantidad} {detalle.nombre_producto} (${int(detalle.subtotal)})"
        for detalle in detalles
    )
    cliente_label = cliente_nombre or "Mostrador"
    detalle_label = lineas or "Sin productos"
    return (
        f"Variedades Angelly - Recibo #{venta_id}: Cliente: {cliente_label}. {detalle_label}. "
        f"Total: ${int(total)}. Saldo pendiente: ${int(saldo_pendiente)}"
    )


app = FastAPI(title="Variedades Angelly API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/clientes", response_model=list[ClienteResponse])
def list_clientes(db: Session = Depends(get_db)) -> list[ClienteResponse]:
    """Lista todos los clientes para la tabla de creditos."""
    repository = SqlAlchemyClienteRepository(db)
    clientes = repository.list_all()
    return [_to_cliente_response(cliente) for cliente in clientes]


@app.post("/api/clientes", response_model=ClienteResponse, status_code=201)
def create_cliente(
    payload: ClienteCreateRequest,
    db: Session = Depends(get_db),
) -> ClienteResponse:
    """Registra un cliente nuevo y retorna su informacion base."""
    repository = SqlAlchemyClienteRepository(db)

    if repository.get_by_nombre(payload.nombre) is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")

    cliente = Cliente(
        nombre=payload.nombre,
        documento=payload.documento,
        limite_credito=payload.limite_credito,
    )
    try:
        created = repository.add(cliente)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El documento ya existe para otro cliente",
        ) from exc

    return _to_cliente_response(created)


@app.get("/api/productos", response_model=list[ProductoResponse])
def list_productos(db: Session = Depends(get_db)) -> list[ProductoResponse]:
    """Lista todos los productos del inventario."""
    repository = SqlAlchemyProductoRepository(db)
    productos = repository.list_all()
    return [_to_producto_response(producto) for producto in productos]


@app.post("/api/productos", response_model=ProductoResponse, status_code=201)
def create_producto(
    payload: ProductoCreateRequest,
    db: Session = Depends(get_db),
) -> ProductoResponse:
    """Crea un producto nuevo para inventario."""
    repository = SqlAlchemyProductoRepository(db)

    if repository.get_by_nombre(payload.nombre) is not None:
        raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre")

    producto = Producto(
        nombre=payload.nombre,
        precio_costo=payload.precio_costo,
        precio_venta=payload.precio_venta,
        stock=payload.stock_actual,
        stock_minimo=payload.stock_minimo,
    )

    try:
        created = repository.add(producto)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudo crear el producto por restriccion de unicidad",
        ) from exc

    return _to_producto_response(created)


@app.patch("/api/productos/{producto_id}/stock", response_model=ProductoResponse)
def patch_producto_stock(
    producto_id: int,
    payload: ProductoStockPatchRequest,
    db: Session = Depends(get_db),
) -> ProductoResponse:
    """Ajusta stock de forma rapida sumando o restando unidades."""
    repository = SqlAlchemyProductoRepository(db)

    try:
        updated = repository.update_stock(producto_id, payload.delta)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    return _to_producto_response(updated)


@app.patch("/api/productos/{producto_id}/precio_venta", response_model=ProductoResponse)
def patch_producto_precio_venta(
    producto_id: int,
    payload: ProductoPrecioPatchRequest,
    db: Session = Depends(get_db),
) -> ProductoResponse:
    """Permite editar precio de venta en modo inline desde el dashboard."""
    repository = SqlAlchemyProductoRepository(db)

    try:
        updated = repository.update_precio_venta(producto_id, payload.precio_venta)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    return _to_producto_response(updated)


@app.post("/api/ventas", response_model=VentaResponse, status_code=201)
def create_venta(
    payload: VentaCreateRequest,
    db: Session = Depends(get_db),
) -> VentaResponse:
    """Registra una venta de forma atomica con control de stock y credito."""
    total = 0.0
    detalle_payload: list[VentaDetalleResponse] = []
    cliente: ClienteModel | None = None
    cliente_nombre: str | None = None
    saldo_pendiente = 0.0

    try:
        with db.begin():
            if payload.cliente_id is not None:
                cliente = db.execute(
                    select(ClienteModel)
                    .where(ClienteModel.id == payload.cliente_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if cliente is None:
                    raise HTTPException(status_code=404, detail="Cliente no encontrado")

                cliente_nombre = cliente.nombre
            elif payload.es_fiado:
                raise HTTPException(
                    status_code=400,
                    detail="Debes seleccionar un cliente para ventas a fiado",
                )

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

            if payload.es_fiado:
                if cliente is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Debes seleccionar un cliente para ventas a fiado",
                    )

                nueva_deuda = float(cliente.deuda_total + total)
                if nueva_deuda > float(cliente.limite_credito):
                    raise HTTPException(
                        status_code=400,
                        detail="Limite de credito excedido",
                    )
                cliente.deuda_total = nueva_deuda
                saldo_pendiente = nueva_deuda

            venta = VentaModel(
                cliente_id=cliente.id if cliente is not None else None,
                es_fiado=payload.es_fiado,
                total=total,
                saldo_pendiente=saldo_pendiente,
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

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No fue posible registrar la venta por conflicto de datos",
        ) from exc

    resumen = _build_recibo_text(
        venta_id=venta.id,
        detalles=detalle_payload,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        cliente_nombre=cliente_nombre,
    )

    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_nombre=cliente_nombre,
        es_fiado=venta.es_fiado,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        fecha=venta.fecha,
        detalles=detalle_payload,
        resumen_recibo=resumen,
    )


@app.get("/api/ventas", response_model=list[VentaResponse])
def list_ventas(db: Session = Depends(get_db)) -> list[VentaResponse]:
    """Lista ventas registradas para analitica de dashboard y POS."""
    ventas = db.execute(
        select(VentaModel).order_by(VentaModel.fecha.desc()),
    ).scalars().all()

    cliente_ids = {venta.cliente_id for venta in ventas if venta.cliente_id is not None}
    clientes_por_id: dict[int, str] = {}
    if cliente_ids:
        clientes = db.execute(
            select(ClienteModel).where(ClienteModel.id.in_(cliente_ids)),
        ).scalars().all()
        clientes_por_id = {cliente.id: cliente.nombre for cliente in clientes}

    payload: list[VentaResponse] = []
    for venta in ventas:
        detalles_model = db.execute(
            select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta.id),
        ).scalars().all()
        detalles = [_to_detalle_response(detalle) for detalle in detalles_model]
        cliente_nombre = (
            clientes_por_id.get(venta.cliente_id)
            if venta.cliente_id is not None
            else None
        )

        payload.append(
            VentaResponse(
                venta_id=venta.id,
                cliente_id=venta.cliente_id,
                cliente_nombre=cliente_nombre,
                es_fiado=venta.es_fiado,
                total=venta.total,
                saldo_pendiente=venta.saldo_pendiente,
                fecha=venta.fecha,
                detalles=detalles,
                resumen_recibo=_build_recibo_text(
                    venta_id=venta.id,
                    detalles=detalles,
                    total=venta.total,
                    saldo_pendiente=venta.saldo_pendiente,
                    cliente_nombre=cliente_nombre,
                ),
            ),
        )

    return payload


@app.get("/api/clientes/{nombre}", response_model=ClienteResponse)
def get_cliente_por_nombre(
    nombre: str,
    db: Session = Depends(get_db),
) -> ClienteResponse:
    """Obtiene un cliente por nombre desde la capa de repositorio."""
    repository = SqlAlchemyClienteRepository(db)
    cliente = repository.get_by_nombre(nombre)

    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return _to_cliente_response(cliente)
