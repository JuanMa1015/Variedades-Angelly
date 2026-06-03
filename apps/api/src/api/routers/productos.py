"""Router del modulo de productos e inventario."""

from __future__ import annotations

from typing import Annotated
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo, build_page, search_filter
from src.domain.producto import Producto
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import DetalleVentaModel, ProductoModel, ProveedorModel
from src.infrastructure.repositories.sqlalchemy_repository import SqlAlchemyProductoRepository

router = APIRouter(tags=["productos"])


class ProductoResponse(BaseModel):
    """DTO de salida para consultas de inventario."""

    id: int
    nombre: str
    codigo_barras: str | None
    precio_costo: float
    precio_venta: float
    catalogo: str
    stock_actual: int
    stock_minimo: int
    stock_critico: bool
    imagen_url: str | None = None
    proveedor_id: int | None = None
    proveedor_nombre: str | None = None


class ProductoCreateRequest(BaseModel):
    """DTO de entrada para crear productos nuevos."""

    nombre: Annotated[str, Field(min_length=2, max_length=120)]
    codigo_barras: Annotated[str | None, Field(max_length=64)] = None
    catalogo: Literal["tienda", "cartera"] = "tienda"
    precio_costo: Annotated[float, Field(ge=0)]
    precio_venta: Annotated[float, Field(ge=0)]
    stock_actual: Annotated[int, Field(ge=0)] = 0
    stock_minimo: Annotated[int, Field(ge=0)] = 0
    imagen_url: str | None = None
    proveedor_id: int | None = None


class ProductoUpdateRequest(BaseModel):
    """DTO para edicion administrativa de producto."""

    nombre: Annotated[str | None, Field(min_length=2, max_length=120)] = None
    codigo_barras: Annotated[str | None, Field(max_length=64)] = None
    catalogo: Literal["tienda", "cartera"] | None = None
    precio_costo: Annotated[float | None, Field(ge=0)] = None
    precio_venta: Annotated[float | None, Field(ge=0)] = None
    stock_actual: Annotated[int | None, Field(ge=0)] = None
    stock_minimo: Annotated[int | None, Field(ge=0)] = None
    imagen_url: str | None = None
    proveedor_id: int | None = None
    activo: bool | None = None


class ProductoStockPatchRequest(BaseModel):
    """DTO para ajustes rapidos de stock por delta."""

    delta: int

    @field_validator("delta")
    @classmethod
    def validate_non_zero_delta(cls, value: int) -> int:
        if value == 0:
            raise ValueError("delta no puede ser 0")
        return value


class ProductoPageResponse(BaseModel):
    """Respuesta paginada de productos."""

    data: list[ProductoResponse]
    page: PageInfo


class ProductoPrecioPatchRequest(BaseModel):
    """DTO para edicion inline de precio de venta."""

    precio_venta: Annotated[float, Field(ge=0)]


def _to_producto_response(producto: Producto) -> ProductoResponse:
    return ProductoResponse(
        id=producto.id or 0,
        nombre=producto.nombre,
        codigo_barras=producto.codigo_barras,
        precio_costo=producto.precio_costo,
        precio_venta=producto.precio_venta,
        catalogo=producto.catalogo,
        stock_actual=producto.stock_actual,
        stock_minimo=producto.stock_minimo,
        stock_critico=producto.stock_critico,
        imagen_url=producto.imagen_url,
    )


def _to_producto_response_from_model(p: ProductoModel) -> ProductoResponse:
    return ProductoResponse(
        id=p.id,
        nombre=p.nombre,
        codigo_barras=p.codigo_barras,
        precio_costo=p.precio_costo,
        precio_venta=p.precio_venta,
        catalogo=p.catalogo,
        stock_actual=p.stock_actual,
        stock_minimo=p.stock_minimo,
        stock_critico=p.stock_actual <= p.stock_minimo,
        imagen_url=p.imagen_url,
        proveedor_id=p.proveedor_id,
        proveedor_nombre=p.proveedor.nombre if p.proveedor else None,
    )


def _producto_search_filter(query, q: str | None):
    filters = search_filter(q.strip() if q else None, ProductoModel.nombre, ProductoModel.codigo_barras)
    if filters:
        query = query.where(or_(*filters))
    return query


@router.get("/api/productos", response_model=list[ProductoResponse])
def list_productos(
    db: Session = Depends(get_db),
    catalogo: str = Query("todos", pattern="^(todos|tienda|cartera)$"),
    q: str | None = Query(default=None, min_length=1, max_length=100),
    include_inactivos: bool = Query(default=False),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[ProductoResponse]:
    """Lista todos los productos del inventario. Opcionalmente filtra por texto en nombre o código de barras."""
    query = select(ProductoModel)
    if not include_inactivos:
        query = query.where(ProductoModel.activo == True)
    if catalogo != "todos":
        query = query.where(ProductoModel.catalogo == catalogo)
    query = _producto_search_filter(query, q)

    items = db.execute(query.order_by(ProductoModel.nombre.asc())).scalars().all()
    return [_to_producto_response_from_model(p) for p in items]


@router.get("/api/productos/paginados", response_model=ProductoPageResponse)
def list_productos_paginados(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    catalogo: str = Query("todos", pattern="^(todos|tienda|cartera)$"),
    q: str | None = Query(default=None, min_length=1, max_length=100),
    include_inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProductoPageResponse:
    """Lista paginada de productos. Opcionalmente filtra por texto en nombre o código de barras."""
    query = select(ProductoModel)
    if not include_inactivos:
        query = query.where(ProductoModel.activo == True)
    if catalogo != "todos":
        query = query.where(ProductoModel.catalogo == catalogo)
    query = _producto_search_filter(query, q)

    items, page_info = build_page(db, query, page, limit, ProductoModel.nombre.asc())

    return ProductoPageResponse(
        data=[_to_producto_response_from_model(p) for p in items],
        page=page_info,
    )


@router.post("/api/productos", response_model=ProductoResponse, status_code=201)
def create_producto(
    payload: ProductoCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProductoResponse:
    """Crea un producto nuevo para inventario."""
    repository = SqlAlchemyProductoRepository(db)

    if repository.get_by_nombre(payload.nombre) is not None:
        raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre")

    if payload.codigo_barras:
        existe_codigo = db.execute(select(ProductoModel).where(ProductoModel.codigo_barras == payload.codigo_barras.strip())).scalar_one_or_none()
        if existe_codigo is not None:
            raise HTTPException(status_code=409, detail="Ya existe un producto con ese codigo de barras")

    producto = Producto(
        nombre=payload.nombre,
        codigo_barras=(payload.codigo_barras or "").strip() or None,
        precio_costo=payload.precio_costo,
        precio_venta=payload.precio_venta,
        stock=payload.stock_actual,
        stock_minimo=payload.stock_minimo,
        catalogo=payload.catalogo,
        imagen_url=payload.imagen_url,
    )

    try:
        created = repository.add(producto)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudo crear el producto por restriccion de unicidad",
        ) from exc

    if payload.proveedor_id is not None:
        model = db.execute(select(ProductoModel).where(ProductoModel.id == created.id)).scalar_one()
        model.proveedor_id = payload.proveedor_id
        db.commit()
        db.refresh(model)
        return _to_producto_response_from_model(model)

    return _to_producto_response(created)


@router.patch("/api/productos/{producto_id}", response_model=ProductoResponse)
def update_producto(
    producto_id: int,
    payload: ProductoUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProductoResponse:
    """Edita datos de producto en inventario."""
    producto = db.execute(select(ProductoModel).where(ProductoModel.id == producto_id)).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ProductoModel).where(ProductoModel.nombre == nombre, ProductoModel.id != producto_id)
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre")
        producto.nombre = nombre

    if payload.codigo_barras is not None:
        codigo = payload.codigo_barras.strip() or None
        if codigo is not None:
            existente_codigo = db.execute(
                select(ProductoModel).where(ProductoModel.codigo_barras == codigo, ProductoModel.id != producto_id)
            ).scalar_one_or_none()
            if existente_codigo is not None:
                raise HTTPException(status_code=409, detail="Ya existe un producto con ese codigo de barras")
        producto.codigo_barras = codigo

    if payload.precio_costo is not None:
        producto.precio_costo = payload.precio_costo

    if payload.catalogo is not None:
        producto.catalogo = payload.catalogo

    if payload.precio_venta is not None:
        producto.precio_venta = payload.precio_venta

    if payload.stock_actual is not None:
        producto.stock_actual = payload.stock_actual

    if payload.stock_minimo is not None:
        producto.stock_minimo = payload.stock_minimo

    if payload.proveedor_id is not None:
        producto.proveedor_id = payload.proveedor_id

    if payload.imagen_url is not None:
        producto.imagen_url = payload.imagen_url

    if payload.activo is not None:
        producto.activo = payload.activo

    db.commit()
    db.refresh(producto)

    return ProductoResponse(
        id=producto.id,
        nombre=producto.nombre,
        codigo_barras=producto.codigo_barras,
        precio_costo=producto.precio_costo,
        precio_venta=producto.precio_venta,
        catalogo=producto.catalogo,
        stock_actual=producto.stock_actual,
        stock_minimo=producto.stock_minimo,
        stock_critico=producto.stock_actual <= producto.stock_minimo,
        imagen_url=producto.imagen_url,
        proveedor_id=producto.proveedor_id,
        proveedor_nombre=producto.proveedor.nombre if producto.proveedor else None,
    )


@router.delete(
    "/api/productos/{producto_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> Response:
    """Desactiva un producto (soft-delete)."""
    producto = db.execute(select(ProductoModel).where(ProductoModel.id == producto_id)).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    producto.activo = False
    producto.proveedor_id = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/api/productos/{producto_id}/reactivar", status_code=200)
def reactivar_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> dict:
    producto = db.execute(select(ProductoModel).where(ProductoModel.id == producto_id)).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    producto.activo = True
    db.commit()
    return {"message": "Producto reactivado"}


@router.patch("/api/productos/{producto_id}/stock", response_model=ProductoResponse)
def patch_producto_stock(
    producto_id: int,
    payload: ProductoStockPatchRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
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


@router.patch("/api/productos/{producto_id}/precio_venta", response_model=ProductoResponse)
def patch_producto_precio_venta(
    producto_id: int,
    payload: ProductoPrecioPatchRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
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
