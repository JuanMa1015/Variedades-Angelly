"""Stock de los productos: ajustes con motivo, historial de movimientos y resumen del inventario."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.services.catalogos import exigir_catalogo_propio, resolver_catalogo
from src.api.pagination import PageInfo
from src.api.routers.productos import ProductoResponse, _to_producto_response_from_model
from src.api.services.auditoria import registrar_auditoria
from src.api.services.stock import ETIQUETA_MOTIVO, MOTIVOS_POR_MODO, ModoAjuste, MotivoAjuste, mover_stock
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import MovimientoStockModel, ProductoModel, ProveedorModel

router = APIRouter(tags=["productos-stock"])


class AjusteStockRequest(BaseModel):
    """Corregir el stock siempre lleva motivo.

    - ``sumar`` / ``restar``: ``cantidad`` es cuantas unidades entran o salen.
    - ``contar``: ``cantidad`` es lo que hay realmente en el estante; el servidor calcula la diferencia
      sobre el stock de ese instante (asi no pisa una venta que ocurrio mientras se contaba).
    """

    modo: ModoAjuste
    cantidad: Annotated[int, Field(ge=0, le=1_000_000)]
    motivo: MotivoAjuste
    nota: Annotated[str | None, Field(max_length=200)] = None

    @model_validator(mode="after")
    def _validar(self) -> "AjusteStockRequest":
        if self.modo != "contar" and self.cantidad == 0:
            raise ValueError("La cantidad debe ser mayor a 0")
        if self.motivo not in MOTIVOS_POR_MODO[self.modo]:
            raise ValueError("Ese motivo no corresponde a este tipo de ajuste")
        if self.motivo == "otro" and len((self.nota or "").strip()) < 3:
            raise ValueError("Cuando el motivo es 'otro' explica que paso en la nota")
        return self


class MovimientoStockResponse(BaseModel):
    id: int
    producto_id: int
    fecha: str
    tipo: str
    delta: int
    stock_resultante: int
    motivo: str | None = None
    usuario: str
    referencia_tipo: str | None = None
    referencia_id: int | None = None


class AjusteStockResponse(BaseModel):
    producto: ProductoResponse
    movimiento: MovimientoStockResponse


class MovimientoStockPage(BaseModel):
    data: list[MovimientoStockResponse]
    page: PageInfo


class ProductoUrgente(BaseModel):
    id: int
    nombre: str
    stock_actual: int
    stock_minimo: int


class ResumenInventarioResponse(BaseModel):
    """Cifras de todo el catalogo (no de la pagina que se esta viendo)."""

    total: int
    stock_total: int
    agotados: int
    bajo_stock: int
    urgentes: list[ProductoUrgente]


class ProductoReposicion(BaseModel):
    id: int
    nombre: str
    stock_actual: int
    stock_minimo: int
    sugerido: int  # unidades para volver a 2 veces el minimo (al menos 1)
    costo: float


class GrupoReposicion(BaseModel):
    """Lo que hay que pedir a un proveedor (o los productos sin proveedor asignado)."""

    proveedor_id: int | None
    proveedor_nombre: str | None
    telefono: str | None
    productos: list[ProductoReposicion]
    monto_estimado: float


class ReposicionResponse(BaseModel):
    grupos: list[GrupoReposicion]
    total_productos: int


def _sugerido(stock_actual: int, stock_minimo: int) -> int:
    """Pedir hasta tener el doble del minimo: alcanza para volver a vender sin pedir cada semana."""
    return max(1, int(stock_minimo) * 2 - int(stock_actual))


def _to_movimiento(m: MovimientoStockModel) -> MovimientoStockResponse:
    return MovimientoStockResponse(
        id=m.id,
        producto_id=m.producto_id,
        fecha=m.fecha.isoformat(),
        tipo=m.tipo,
        delta=m.delta,
        stock_resultante=m.stock_resultante,
        motivo=m.motivo,
        usuario=m.usuario,
        referencia_tipo=m.referencia_tipo,
        referencia_id=m.referencia_id,
    )


def _texto_motivo(payload: AjusteStockRequest) -> str:
    base = ETIQUETA_MOTIVO[payload.motivo]
    nota = (payload.nota or "").strip()
    return f"{base}: {nota}" if nota else base


@router.get("/api/productos/resumen", response_model=ResumenInventarioResponse)
def resumen_inventario(
    catalogo: Literal["tienda", "cartera"] | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ResumenInventarioResponse:
    """Totales de todo el catalogo activo: productos, unidades, agotados y bajo stock, y los mas urgentes."""
    catalogo = resolver_catalogo(current_user, catalogo, defecto="tienda")
    activos = (ProductoModel.activo.is_(True), ProductoModel.catalogo == catalogo)
    cuenta = lambda condicion: func.coalesce(func.sum(case((condicion, 1), else_=0)), 0)  # noqa: E731
    total, stock_total, agotados, bajo = db.execute(
        select(
            func.count(ProductoModel.id),
            func.coalesce(func.sum(ProductoModel.stock_actual), 0),
            cuenta(ProductoModel.stock_actual == 0),
            cuenta((ProductoModel.stock_actual > 0) & (ProductoModel.stock_actual <= ProductoModel.stock_minimo)),
        ).where(*activos),
    ).one()
    urgentes = db.execute(
        select(ProductoModel)
        .where(*activos, ProductoModel.stock_actual <= ProductoModel.stock_minimo)
        .order_by(ProductoModel.stock_actual.asc(), ProductoModel.nombre.asc())
        .limit(5),
    ).scalars().all()
    return ResumenInventarioResponse(
        total=int(total),
        stock_total=int(stock_total),
        agotados=int(agotados),
        bajo_stock=int(bajo),
        urgentes=[
            ProductoUrgente(id=p.id, nombre=p.nombre, stock_actual=p.stock_actual, stock_minimo=p.stock_minimo)
            for p in urgentes
        ],
    )


@router.get("/api/productos/reposicion", response_model=ReposicionResponse)
def productos_a_reponer(
    catalogo: Literal["tienda", "cartera"] | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> ReposicionResponse:
    """Productos agotados o por agotarse, agrupados por proveedor con la cantidad sugerida y el costo estimado."""
    catalogo = resolver_catalogo(current_user, catalogo, defecto="tienda")
    filas = db.execute(
        select(ProductoModel, ProveedorModel)
        .outerjoin(ProveedorModel, ProveedorModel.id == ProductoModel.proveedor_id)
        .where(
            ProductoModel.activo.is_(True),
            ProductoModel.catalogo == catalogo,
            ProductoModel.stock_actual <= ProductoModel.stock_minimo,
        )
        .order_by(ProductoModel.stock_actual.asc(), ProductoModel.nombre.asc()),
    ).all()

    grupos: dict[int | None, GrupoReposicion] = {}
    for producto, proveedor in filas:
        clave = proveedor.id if proveedor is not None else None
        if clave not in grupos:
            grupos[clave] = GrupoReposicion(
                proveedor_id=clave,
                proveedor_nombre=proveedor.nombre if proveedor is not None else None,
                telefono=proveedor.telefono if proveedor is not None else None,
                productos=[],
                monto_estimado=0.0,
            )
        sugerido = _sugerido(producto.stock_actual, producto.stock_minimo)
        grupo = grupos[clave]
        grupo.productos.append(ProductoReposicion(
            id=producto.id, nombre=producto.nombre, stock_actual=producto.stock_actual,
            stock_minimo=producto.stock_minimo, sugerido=sugerido, costo=float(producto.precio_costo),
        ))
        grupo.monto_estimado += float(producto.precio_costo) * sugerido

    # Primero los proveedores por nombre; lo que no tiene proveedor al final (no se puede pedir hasta asignarlo).
    ordenados = sorted(grupos.values(), key=lambda g: (g.proveedor_id is None, (g.proveedor_nombre or "").casefold()))
    return ReposicionResponse(grupos=ordenados, total_productos=len(filas))


@router.post("/api/productos/{producto_id}/ajustes-stock", response_model=AjusteStockResponse)
def ajustar_stock(
    producto_id: int,
    payload: AjusteStockRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> AjusteStockResponse:
    """Suma, resta o cuenta el stock con motivo obligatorio. Queda en el historial del producto y en la auditoria."""
    producto = db.execute(
        select(ProductoModel).where(ProductoModel.id == producto_id).with_for_update(),
    ).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    exigir_catalogo_propio(current_user, producto.catalogo)

    if payload.modo == "sumar":
        delta = payload.cantidad
    elif payload.modo == "restar":
        delta = -payload.cantidad
    else:
        delta = payload.cantidad - int(producto.stock_actual)
        if delta == 0:
            raise HTTPException(status_code=400, detail="El conteo coincide con el stock actual: no hay nada que ajustar")

    stock_antes = int(producto.stock_actual)
    movimiento = mover_stock(
        db, producto, delta, tipo="ajuste", usuario=current_user.username, motivo=_texto_motivo(payload),
    )
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="productos",
        entidad="producto",
        accion="ajuste_stock",
        entidad_id=producto.id,
        detalle=f"{producto.nombre}: stock {stock_antes} -> {producto.stock_actual} ({delta:+d}). {_texto_motivo(payload)}",
    )
    db.commit()
    db.refresh(producto)
    db.refresh(movimiento)
    return AjusteStockResponse(producto=_to_producto_response_from_model(producto), movimiento=_to_movimiento(movimiento))


@router.get("/api/productos/{producto_id}/movimientos-stock", response_model=MovimientoStockPage)
def movimientos_de_stock(
    producto_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> MovimientoStockPage:
    """Historial de por que cambio el stock del producto, del mas reciente al mas antiguo."""
    producto = db.get(ProductoModel, producto_id)
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    exigir_catalogo_propio(current_user, producto.catalogo)
    consulta = select(MovimientoStockModel).where(MovimientoStockModel.producto_id == producto_id)
    total = db.execute(select(func.count()).select_from(consulta.subquery())).scalar_one()
    filas = db.execute(
        consulta.order_by(MovimientoStockModel.fecha.desc(), MovimientoStockModel.id.desc()).offset((page - 1) * limit).limit(limit),
    ).scalars().all()
    return MovimientoStockPage(
        data=[_to_movimiento(m) for m in filas],
        page=PageInfo(total=total, total_pages=max(1, (total + limit - 1) // limit), current_page=page, limit=limit),
    )
