"""Router "superadmin" que expone CRUD mínimo para tablas administrativas.
Protegido con require_roles('superadmin').
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    AuditoriaModel,
    DetalleVentaModel,
    ProductoModel,
    ProveedorModel,
    UsuarioModel,
    VentaModel,
)
from src.auth.security import hash_password

router = APIRouter(tags=["superadmin"])

# --- Schemas ---
class UsuarioSchema(BaseModel):
    id: int
    username: str
    rol: str


class UsuarioCreate(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=50)]
    password: Annotated[str, Field(min_length=6, max_length=128)]


class UsuarioUpdate(BaseModel):
    username: Annotated[str | None, Field(min_length=3, max_length=50)] = None
    password: Annotated[str | None, Field(min_length=6, max_length=128)] = None


class ProductoSchema(BaseModel):
    id: int
    nombre: str
    codigo_barras: str | None
    precio_costo: float
    precio_venta: float
    catalogo: str
    stock_actual: int
    stock_minimo: int


class ProductoCreateUpdate(BaseModel):
    nombre: Annotated[str, Field(min_length=1, max_length=120)]
    codigo_barras: str | None = None
    precio_costo: float = 0.0
    precio_venta: float = 0.0
    catalogo: str = "tienda"
    stock_actual: int = 0
    stock_minimo: int = 0


class ProveedorSchema(BaseModel):
    id: int
    nombre: str
    contacto: str | None
    telefono: str | None
    activo: bool


class ProveedorCreateUpdate(BaseModel):
    nombre: Annotated[str, Field(min_length=1, max_length=120)]
    contacto: str | None = None
    telefono: str | None = None
    activo: bool = True


class AuditoriaSchema(BaseModel):
    id: int
    modulo: str
    entidad: str
    entidad_id: int | None
    accion: str
    detalle: str | None
    usuario: str
    fecha: datetime


class AuditoriaCreate(BaseModel):
    modulo: Annotated[str, Field(min_length=1, max_length=50)]
    entidad: Annotated[str, Field(min_length=1, max_length=80)]
    entidad_id: int | None = None
    accion: Annotated[str, Field(min_length=1, max_length=30)]
    detalle: str | None = None
    usuario: Annotated[str, Field(min_length=1, max_length=50)]


class RankingVentaSchema(BaseModel):
    vendedor: str
    ventas: int
    total_vendido: float


class RankingProductoSchema(BaseModel):
    producto_id: int
    producto: str
    unidades_vendidas: int
    total_vendido: float


class InformesSuperadminResponse(BaseModel):
    ventas_totales: int
    facturacion_total: float
    vendedor_mas_vendedor: RankingVentaSchema | None
    vendedores_top: list[RankingVentaSchema]
    producto_mas_vendido: RankingProductoSchema | None
    producto_menos_vendido: RankingProductoSchema | None
    productos_mas_vendidos: list[RankingProductoSchema]
    productos_menos_vendidos: list[RankingProductoSchema]


# --- Usuarios (vendedores) reuse existing logic ---
@router.get("/api/superadmin/usuarios/vendedores", response_model=list[UsuarioSchema])
def list_vendedores(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> list[UsuarioSchema]:
    usuarios = db.execute(
        select(UsuarioModel).where(UsuarioModel.rol == "vendedor").order_by(UsuarioModel.username.asc())
    ).scalars().all()

    return [UsuarioSchema(id=u.id, username=u.username, rol=u.rol) for u in usuarios]


@router.post("/api/superadmin/usuarios/vendedores", response_model=UsuarioSchema, status_code=201)
def create_vendedor(
    payload: UsuarioCreate,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> UsuarioSchema:
    username = payload.username.strip()
    existente = db.execute(select(UsuarioModel).where(UsuarioModel.username == username)).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese username")

    usuario = UsuarioModel(username=username, password_hash=hash_password(payload.password), rol="vendedor")
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return UsuarioSchema(id=usuario.id, username=usuario.username, rol=usuario.rol)


@router.patch("/api/superadmin/usuarios/vendedores/{usuario_id}", response_model=UsuarioSchema)
def update_vendedor(
    usuario_id: int,
    payload: UsuarioUpdate,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> UsuarioSchema:
    usuario = db.execute(
        select(UsuarioModel).where(
            UsuarioModel.id == usuario_id,
            UsuarioModel.rol == "vendedor",
        ),
    ).scalar_one_or_none()
    if usuario is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")

    if payload.username is not None:
        next_username = payload.username.strip()
        if not next_username:
            raise HTTPException(status_code=400, detail="Username invalido")

        existe_username = db.execute(
            select(UsuarioModel).where(
                UsuarioModel.username == next_username,
                UsuarioModel.id != usuario_id,
            ),
        ).scalar_one_or_none()
        if existe_username is not None:
            raise HTTPException(status_code=409, detail="Ya existe un usuario con ese username")

        usuario.username = next_username

    if payload.password is not None:
        usuario.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(usuario)
    return UsuarioSchema(id=usuario.id, username=usuario.username, rol=usuario.rol)


@router.delete("/api/superadmin/usuarios/vendedores/{usuario_id}", status_code=204)
def delete_vendedor(
    usuario_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> None:
    usuario = db.execute(
        select(UsuarioModel).where(
            UsuarioModel.id == usuario_id,
            UsuarioModel.rol == "vendedor",
        ),
    ).scalar_one_or_none()
    if usuario is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")

    db.delete(usuario)
    db.commit()


@router.get("/api/superadmin/usuarios/admins", response_model=list[UsuarioSchema])
def list_admins(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> list[UsuarioSchema]:
    usuarios = db.execute(
        select(UsuarioModel).where(UsuarioModel.rol == "admin").order_by(UsuarioModel.username.asc())
    ).scalars().all()

    return [UsuarioSchema(id=u.id, username=u.username, rol=u.rol) for u in usuarios]


@router.post("/api/superadmin/usuarios/admins", response_model=UsuarioSchema, status_code=201)
def create_admin(
    payload: UsuarioCreate,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> UsuarioSchema:
    username = payload.username.strip()
    existente = db.execute(select(UsuarioModel).where(UsuarioModel.username == username)).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese username")

    usuario = UsuarioModel(username=username, password_hash=hash_password(payload.password), rol="admin")
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return UsuarioSchema(id=usuario.id, username=usuario.username, rol=usuario.rol)


@router.patch("/api/superadmin/usuarios/admins/{usuario_id}", response_model=UsuarioSchema)
def update_admin(
    usuario_id: int,
    payload: UsuarioUpdate,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> UsuarioSchema:
    usuario = db.execute(
        select(UsuarioModel).where(
            UsuarioModel.id == usuario_id,
            UsuarioModel.rol == "admin",
        ),
    ).scalar_one_or_none()
    if usuario is None:
        raise HTTPException(status_code=404, detail="Admin no encontrado")

    if payload.username is not None:
        next_username = payload.username.strip()
        if not next_username:
            raise HTTPException(status_code=400, detail="Username invalido")

        existe_username = db.execute(
            select(UsuarioModel).where(
                UsuarioModel.username == next_username,
                UsuarioModel.id != usuario_id,
            ),
        ).scalar_one_or_none()
        if existe_username is not None:
            raise HTTPException(status_code=409, detail="Ya existe un usuario con ese username")

        usuario.username = next_username

    if payload.password is not None:
        usuario.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(usuario)
    return UsuarioSchema(id=usuario.id, username=usuario.username, rol=usuario.rol)


@router.delete("/api/superadmin/usuarios/admins/{usuario_id}", status_code=204)
def delete_admin(
    usuario_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> None:
    usuario = db.execute(
        select(UsuarioModel).where(
            UsuarioModel.id == usuario_id,
            UsuarioModel.rol == "admin",
        ),
    ).scalar_one_or_none()
    if usuario is None:
        raise HTTPException(status_code=404, detail="Admin no encontrado")

    db.delete(usuario)
    db.commit()


# --- Productos ---
@router.get("/api/superadmin/productos", response_model=list[ProductoSchema])
def list_productos(db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_roles("superadmin"))):
    rows = db.execute(select(ProductoModel).order_by(ProductoModel.nombre.asc())).scalars().all()
    return [ProductoSchema(
        id=r.id,
        nombre=r.nombre,
        codigo_barras=r.codigo_barras,
        precio_costo=r.precio_costo,
        precio_venta=r.precio_venta,
        catalogo=r.catalogo,
        stock_actual=r.stock_actual,
        stock_minimo=r.stock_minimo,
    ) for r in rows]


@router.post("/api/superadmin/productos", response_model=ProductoSchema, status_code=201)
def create_producto(payload: ProductoCreateUpdate, db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_roles("superadmin"))):
    producto = ProductoModel(
        nombre=payload.nombre.strip(),
        codigo_barras=payload.codigo_barras,
        precio_costo=payload.precio_costo,
        precio_venta=payload.precio_venta,
        catalogo=payload.catalogo,
        stock_actual=payload.stock_actual,
        stock_minimo=payload.stock_minimo,
    )
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return ProductoSchema(
        id=producto.id,
        nombre=producto.nombre,
        codigo_barras=producto.codigo_barras,
        precio_costo=producto.precio_costo,
        precio_venta=producto.precio_venta,
        catalogo=producto.catalogo,
        stock_actual=producto.stock_actual,
        stock_minimo=producto.stock_minimo,
    )


# --- Proveedores ---
@router.get("/api/superadmin/proveedores", response_model=list[ProveedorSchema])
def list_proveedores(db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_roles("superadmin"))):
    rows = db.execute(select(ProveedorModel).order_by(ProveedorModel.nombre.asc())).scalars().all()
    return [ProveedorSchema(id=r.id, nombre=r.nombre, contacto=r.contacto, telefono=r.telefono, activo=r.activo) for r in rows]


@router.post("/api/superadmin/proveedores", response_model=ProveedorSchema, status_code=201)
def create_proveedor(payload: ProveedorCreateUpdate, db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_roles("superadmin"))):
    existente = db.execute(select(ProveedorModel).where(ProveedorModel.nombre == payload.nombre.strip())).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Proveedor ya existe")
    prov = ProveedorModel(nombre=payload.nombre.strip(), contacto=payload.contacto, telefono=payload.telefono, activo=payload.activo)
    db.add(prov)
    db.commit()
    db.refresh(prov)
    return ProveedorSchema(id=prov.id, nombre=prov.nombre, contacto=prov.contacto, telefono=prov.telefono, activo=prov.activo)


# --- Auditorias ---
@router.get("/api/superadmin/auditorias", response_model=list[AuditoriaSchema])
def list_auditorias(db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_roles("superadmin"))):
    rows = db.execute(select(AuditoriaModel).order_by(AuditoriaModel.fecha.desc())).scalars().all()
    return [AuditoriaSchema(id=r.id, modulo=r.modulo, entidad=r.entidad, entidad_id=r.entidad_id, accion=r.accion, detalle=r.detalle, usuario=r.usuario, fecha=r.fecha) for r in rows]


@router.post("/api/superadmin/auditorias", response_model=AuditoriaSchema, status_code=201)
def create_auditoria(payload: AuditoriaCreate, db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_roles("superadmin"))):
    a = AuditoriaModel(modulo=payload.modulo, entidad=payload.entidad, entidad_id=payload.entidad_id, accion=payload.accion, detalle=payload.detalle, usuario=payload.usuario)
    db.add(a)
    db.commit()
    db.refresh(a)
    return AuditoriaSchema(id=a.id, modulo=a.modulo, entidad=a.entidad, entidad_id=a.entidad_id, accion=a.accion, detalle=a.detalle, usuario=a.usuario, fecha=a.fecha)


@router.get("/api/superadmin/informes", response_model=InformesSuperadminResponse)
def informes_superadmin(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> InformesSuperadminResponse:
    vendedores_rows = db.execute(
        select(
            VentaModel.creado_por.label("vendedor"),
            func.count(VentaModel.id).label("ventas"),
            func.coalesce(func.sum(VentaModel.total), 0.0).label("total_vendido"),
        )
        .where(VentaModel.creado_por.is_not(None))
        .group_by(VentaModel.creado_por)
        .order_by(
            func.sum(VentaModel.total).desc(),
            func.count(VentaModel.id).desc(),
            VentaModel.creado_por.asc(),
        )
    ).all()

    productos_rows = db.execute(
        select(
            DetalleVentaModel.producto_id.label("producto_id"),
            DetalleVentaModel.nombre_producto.label("producto"),
            func.coalesce(func.sum(DetalleVentaModel.cantidad), 0).label("unidades_vendidas"),
            func.coalesce(func.sum(DetalleVentaModel.subtotal), 0.0).label("total_vendido"),
        )
        .group_by(DetalleVentaModel.producto_id, DetalleVentaModel.nombre_producto)
        .order_by(
            func.sum(DetalleVentaModel.cantidad).desc(),
            func.sum(DetalleVentaModel.subtotal).desc(),
            DetalleVentaModel.nombre_producto.asc(),
        )
    ).all()

    productos_bottom_rows = db.execute(
        select(
            DetalleVentaModel.producto_id.label("producto_id"),
            DetalleVentaModel.nombre_producto.label("producto"),
            func.coalesce(func.sum(DetalleVentaModel.cantidad), 0).label("unidades_vendidas"),
            func.coalesce(func.sum(DetalleVentaModel.subtotal), 0.0).label("total_vendido"),
        )
        .group_by(DetalleVentaModel.producto_id, DetalleVentaModel.nombre_producto)
        .order_by(
            func.sum(DetalleVentaModel.cantidad).asc(),
            func.sum(DetalleVentaModel.subtotal).asc(),
            DetalleVentaModel.nombre_producto.asc(),
        )
    ).all()

    vendedores_top = [
        RankingVentaSchema(
            vendedor=row.vendedor,
            ventas=int(row.ventas or 0),
            total_vendido=float(row.total_vendido or 0.0),
        )
        for row in vendedores_rows
    ]
    productos_mas_vendidos = [
        RankingProductoSchema(
            producto_id=int(row.producto_id),
            producto=row.producto,
            unidades_vendidas=int(row.unidades_vendidas or 0),
            total_vendido=float(row.total_vendido or 0.0),
        )
        for row in productos_rows
    ]
    productos_menos_vendidos = [
        RankingProductoSchema(
            producto_id=int(row.producto_id),
            producto=row.producto,
            unidades_vendidas=int(row.unidades_vendidas or 0),
            total_vendido=float(row.total_vendido or 0.0),
        )
        for row in productos_bottom_rows
    ]

    total_ventas, facturacion_total = db.execute(
        select(
            func.count(VentaModel.id),
            func.coalesce(func.sum(VentaModel.total), 0.0),
        ).where(VentaModel.creado_por.is_not(None)),
    ).one()

    return InformesSuperadminResponse(
        ventas_totales=int(total_ventas or 0),
        facturacion_total=float(facturacion_total or 0.0),
        vendedor_mas_vendedor=vendedores_top[0] if vendedores_top else None,
        vendedores_top=vendedores_top[:5],
        producto_mas_vendido=productos_mas_vendidos[0] if productos_mas_vendidos else None,
        producto_menos_vendido=productos_menos_vendidos[0] if productos_menos_vendidos else None,
        productos_mas_vendidos=productos_mas_vendidos[:5],
        productos_menos_vendidos=productos_menos_vendidos[:5],
    )
