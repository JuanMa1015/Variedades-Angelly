"""Router del modulo de productos e inventario."""

from __future__ import annotations

from typing import Annotated
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.services.auditoria import registrar_auditoria
from src.api.services.catalogos import catalogo_del_rol, exigir_catalogo_propio, resolver_catalogo
from src.api.services.stock import mover_stock
from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo, search_filter
from src.domain.producto import Producto
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import MovimientoStockModel, ProductoModel, ProveedorModel
from src.infrastructure.repositories.sqlalchemy_repository import SqlAlchemyProductoRepository

router = APIRouter(tags=["productos"])

EstadoStock = Literal["todos", "agotado", "bajo", "ok"]
OrdenProductos = Literal["nombre", "stock", "precio"]


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
    activo: bool = True


class ProductoCreateRequest(BaseModel):
    """DTO de entrada para crear productos nuevos."""

    nombre: Annotated[str, Field(min_length=2, max_length=120)]
    codigo_barras: Annotated[str | None, Field(max_length=64)] = None
    catalogo: Literal["tienda", "cartera"] = "tienda"
    precio_costo: Annotated[float, Field(ge=0)]
    precio_venta: Annotated[float, Field(gt=0)]
    stock_actual: Annotated[int, Field(ge=0)] = 0
    stock_minimo: Annotated[int, Field(ge=0)] = 0
    imagen_url: str | None = None
    proveedor_id: int | None = None


class ProductoUpdateRequest(BaseModel):
    """DTO para editar un producto. El stock no se edita aqui: se corrige con un ajuste que deja motivo y registro.

    Solo se cambian los campos enviados; ``proveedor_id`` o ``imagen_url`` en ``null`` los quitan.
    """

    nombre: Annotated[str | None, Field(min_length=2, max_length=120)] = None
    codigo_barras: Annotated[str | None, Field(max_length=64)] = None
    catalogo: Literal["tienda", "cartera"] | None = None
    precio_costo: Annotated[float | None, Field(ge=0)] = None
    precio_venta: Annotated[float | None, Field(gt=0)] = None
    stock_minimo: Annotated[int | None, Field(ge=0)] = None
    imagen_url: str | None = None
    proveedor_id: int | None = None
    activo: bool | None = None


class ProductoPageResponse(BaseModel):
    """Respuesta paginada de productos."""

    data: list[ProductoResponse]
    page: PageInfo


class ProductoPrecioPatchRequest(BaseModel):
    """DTO para edicion inline de precio de venta."""

    precio_venta: Annotated[float, Field(gt=0)]


class ProductoStockPatchRequest(BaseModel):
    """DTO para ajustes rapidos de stock por delta (queda registrado como ajuste rapido)."""

    delta: int

    @field_validator("delta")
    @classmethod
    def validate_non_zero_delta(cls, value: int) -> int:
        if value == 0:
            raise ValueError("delta no puede ser 0")
        return value


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
        activo=bool(p.activo),
    )


def _producto_search_filter(query, q: str | None):
    """Busca por nombre, codigo de barras o nombre del proveedor."""
    termino = q.strip() if q else None
    if not termino:
        return query
    filters = search_filter(termino, ProductoModel.nombre, ProductoModel.codigo_barras, ProveedorModel.nombre)
    return query.outerjoin(ProveedorModel, ProveedorModel.id == ProductoModel.proveedor_id).where(or_(*filters))


def _filtrar_por_stock(query, estado: EstadoStock):
    """Agotado: sin unidades. Bajo: quedan pero no pasan del minimo. Ok: por encima del minimo."""
    if estado == "agotado":
        return query.where(ProductoModel.stock_actual == 0)
    if estado == "bajo":
        return query.where(ProductoModel.stock_actual > 0, ProductoModel.stock_actual <= ProductoModel.stock_minimo)
    if estado == "ok":
        return query.where(ProductoModel.stock_actual > ProductoModel.stock_minimo)
    return query


def _orden(orden: OrdenProductos):
    if orden == "stock":
        return (ProductoModel.stock_actual.asc(), ProductoModel.nombre.asc())
    if orden == "precio":
        return (ProductoModel.precio_venta.desc(), ProductoModel.nombre.asc())
    return (ProductoModel.nombre.asc(),)


def _producto_con_nombre(db: Session, nombre: str, excluir_id: int | None = None) -> ProductoModel | None:
    """Los nombres se comparan sin importar mayusculas: 'Arroz' y 'arroz' son el mismo producto."""
    consulta = select(ProductoModel).where(func.lower(ProductoModel.nombre) == nombre.strip().lower())
    if excluir_id is not None:
        consulta = consulta.where(ProductoModel.id != excluir_id)
    return db.execute(consulta.limit(1)).scalar_one_or_none()


def _detalle_repetido(otro: ProductoModel, que: str) -> str:
    """Dice donde esta el repetido: en que catalogo y si esta desactivado (la base no permite repetirlo en ninguno)."""
    sufijo = " (desactivado: reactivalo en lugar de crearlo de nuevo)" if not otro.activo else ""
    return f"Ya existe un producto con ese {que} en el catalogo de {otro.catalogo}{sufijo}"


def _nombre_repetido(db: Session, nombre: str, excluir_id: int | None = None) -> bool:
    return _producto_con_nombre(db, nombre, excluir_id) is not None


@router.get("/api/productos", response_model=list[ProductoResponse])
def list_productos(
    db: Session = Depends(get_db),
    catalogo: str = Query("todos", pattern="^(todos|tienda|cartera)$"),
    q: str | None = Query(default=None, min_length=1, max_length=100),
    include_inactivos: bool = Query(default=False),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[ProductoResponse]:
    """Lista los productos del catalogo del rol. Opcionalmente filtra por texto en nombre o código de barras."""
    catalogo = resolver_catalogo(current_user, catalogo)
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
    solo_inactivos: bool = Query(default=False),
    estado: EstadoStock = Query(default="todos"),
    proveedor_id: int | None = Query(default=None, gt=0),
    orden: OrdenProductos = Query(default="nombre"),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProductoPageResponse:
    """Lista paginada de productos del catalogo del rol con busqueda, filtro por estado de stock, proveedor y orden."""
    catalogo = resolver_catalogo(current_user, catalogo)
    query = select(ProductoModel)
    if solo_inactivos:
        query = query.where(ProductoModel.activo == False)
    elif not include_inactivos:
        query = query.where(ProductoModel.activo == True)
    if catalogo != "todos":
        query = query.where(ProductoModel.catalogo == catalogo)
    if proveedor_id is not None:
        query = query.where(ProductoModel.proveedor_id == proveedor_id)
    query = _filtrar_por_stock(query, estado)
    query = _producto_search_filter(query, q)

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    total_pages = max(1, (total + limit - 1) // limit) if total > 0 else 1
    items = db.execute(query.order_by(*_orden(orden)).offset((page - 1) * limit).limit(limit)).scalars().all()

    return ProductoPageResponse(
        data=[_to_producto_response_from_model(p) for p in items],
        page=PageInfo(total=total, total_pages=total_pages, current_page=page, limit=limit),
    )


@router.post("/api/productos", response_model=ProductoResponse, status_code=201)
def create_producto(
    payload: ProductoCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProductoResponse:
    """Crea un producto nuevo para inventario."""
    repository = SqlAlchemyProductoRepository(db)
    exigir_catalogo_propio(current_user, payload.catalogo)

    repetido = _producto_con_nombre(db, payload.nombre)
    if repetido is not None:
        raise HTTPException(status_code=409, detail=_detalle_repetido(repetido, "nombre"))

    if payload.codigo_barras:
        existe_codigo = db.execute(select(ProductoModel).where(ProductoModel.codigo_barras == payload.codigo_barras.strip())).scalar_one_or_none()
        if existe_codigo is not None:
            raise HTTPException(status_code=409, detail=_detalle_repetido(existe_codigo, "codigo de barras"))

    producto = Producto(
        nombre=payload.nombre.strip(),
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

    model = db.execute(select(ProductoModel).where(ProductoModel.id == created.id)).scalar_one()
    if payload.proveedor_id is not None:
        model.proveedor_id = payload.proveedor_id
    if payload.stock_actual > 0:
        db.add(MovimientoStockModel(
            producto_id=model.id, tipo="stock_inicial", delta=payload.stock_actual, stock_resultante=payload.stock_actual,
            motivo="Stock inicial al crear el producto", usuario=current_user.username,
        ))
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="productos",
        entidad="producto",
        accion="crear",
        entidad_id=model.id,
        detalle=f"{model.nombre}: costo {payload.precio_costo}, venta {payload.precio_venta}, stock {payload.stock_actual}",
    )
    db.commit()
    db.refresh(model)
    return _to_producto_response_from_model(model)


def _texto_valor(valor) -> str:
    """Los precios se muestran siempre como decimales (500.0), vengan del tipo que vengan."""
    return str(float(valor)) if isinstance(valor, (int, float)) and not isinstance(valor, bool) else str(valor)


def _cambios_producto(producto: ProductoModel, campos: dict) -> list[str]:
    """Texto 'campo: antes -> despues' de lo que realmente cambia (para la auditoria)."""
    return [
        f"{nombre}: {_texto_valor(getattr(producto, nombre))} -> {_texto_valor(nuevo)}"
        for nombre, nuevo in campos.items()
        if getattr(producto, nombre) != nuevo
    ]


@router.patch("/api/productos/{producto_id}", response_model=ProductoResponse)
def update_producto(
    producto_id: int,
    payload: ProductoUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProductoResponse:
    """Edita datos del producto. Solo cambia lo enviado; el stock se corrige con un ajuste."""
    producto = db.execute(select(ProductoModel).where(ProductoModel.id == producto_id)).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    exigir_catalogo_propio(current_user, producto.catalogo)

    enviados = payload.model_fields_set
    campos: dict = {}

    if "nombre" in enviados and payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")
        repetido = _producto_con_nombre(db, nombre, excluir_id=producto_id)
        if repetido is not None:
            raise HTTPException(status_code=409, detail=_detalle_repetido(repetido, "nombre"))
        campos["nombre"] = nombre

    if "codigo_barras" in enviados:
        codigo = (payload.codigo_barras or "").strip() or None
        if codigo is not None:
            existente_codigo = db.execute(
                select(ProductoModel).where(ProductoModel.codigo_barras == codigo, ProductoModel.id != producto_id)
            ).scalar_one_or_none()
            if existente_codigo is not None:
                raise HTTPException(status_code=409, detail=_detalle_repetido(existente_codigo, "codigo de barras"))
        campos["codigo_barras"] = codigo

    for nombre in ("precio_costo", "precio_venta", "stock_minimo", "catalogo", "activo"):
        if nombre in enviados and getattr(payload, nombre) is not None:
            campos[nombre] = getattr(payload, nombre)

    # Quitar el proveedor o la imagen es enviarlos en null; no enviarlos los deja como estan.
    if "proveedor_id" in enviados:
        campos["proveedor_id"] = payload.proveedor_id
    if "imagen_url" in enviados:
        campos["imagen_url"] = payload.imagen_url or None

    # Pasar un producto de un catalogo a otro cambia de quien es: solo lo decide quien ve los dos.
    if "catalogo" in campos and campos["catalogo"] != producto.catalogo and catalogo_del_rol(current_user) is not None:
        raise HTTPException(status_code=403, detail="Solo el superadmin puede pasar un producto de un catalogo a otro")

    cambios = _cambios_producto(producto, campos)
    for nombre, valor in campos.items():
        setattr(producto, nombre, valor)
    if cambios:
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="productos",
            entidad="producto",
            accion="editar",
            entidad_id=producto.id,
            detalle=f"{producto.nombre}: " + "; ".join(cambios),
        )

    db.commit()
    db.refresh(producto)
    return _to_producto_response_from_model(producto)


@router.delete(
    "/api/productos/{producto_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> Response:
    """Desactiva un producto (soft-delete)."""
    producto = db.execute(select(ProductoModel).where(ProductoModel.id == producto_id)).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    exigir_catalogo_propio(current_user, producto.catalogo)

    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="productos",
        entidad="producto",
        accion="desactivar",
        entidad_id=producto.id,
        detalle=f"Desactivado: {producto.nombre}",
    )
    producto.activo = False
    producto.proveedor_id = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/api/productos/{producto_id}/reactivar", status_code=200)
def reactivar_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> dict:
    producto = db.execute(select(ProductoModel).where(ProductoModel.id == producto_id)).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    exigir_catalogo_propio(current_user, producto.catalogo)
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="productos",
        entidad="producto",
        accion="reactivar",
        entidad_id=producto.id,
        detalle=f"Reactivado: {producto.nombre}",
    )
    producto.activo = True
    db.commit()
    return {"message": "Producto reactivado"}


@router.patch("/api/productos/{producto_id}/stock", response_model=ProductoResponse)
def patch_producto_stock(
    producto_id: int,
    payload: ProductoStockPatchRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProductoResponse:
    """Ajuste rapido por delta. Se conserva por compatibilidad; para corregir con motivo usa /ajustes-stock."""
    producto = db.execute(select(ProductoModel).where(ProductoModel.id == producto_id).with_for_update()).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    exigir_catalogo_propio(current_user, producto.catalogo)
    mover_stock(db, producto, payload.delta, tipo="ajuste", usuario=current_user.username, motivo="Ajuste rapido")
    db.commit()
    db.refresh(producto)
    return _to_producto_response_from_model(producto)


@router.patch("/api/productos/{producto_id}/precio_venta", response_model=ProductoResponse)
def patch_producto_precio_venta(
    producto_id: int,
    payload: ProductoPrecioPatchRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ProductoResponse:
    """Permite editar precio de venta en modo inline desde el dashboard."""
    existente = db.get(ProductoModel, producto_id)
    if existente is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    exigir_catalogo_propio(current_user, existente.catalogo)
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="productos",
        entidad="producto",
        accion="precio",
        entidad_id=producto_id,
        detalle=f"Nuevo precio de venta: {payload.precio_venta}",
    )
    repository = SqlAlchemyProductoRepository(db)

    try:
        updated = repository.update_precio_venta(producto_id, payload.precio_venta)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    return _to_producto_response(updated)
