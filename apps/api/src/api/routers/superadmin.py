"""Router "superadmin" que expone CRUD mínimo para tablas administrativas.
Protegido con require_roles('superadmin').
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.services.caja_calculos import efectivo_esperado
from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.services import usuarios as servicio_usuarios
from src.api.routers.facturas_compra import (
    FacturaCompraResponse,
    _to_factura_response,
)
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    CierreCajaModel,
    DetalleVentaModel,
    FacturaCompraDetalleModel,
    FacturaCompraModel,
    ProveedorModel,
    VentaModel,
)

router = APIRouter(tags=["superadmin"])

# --- Schemas ---
class UsuarioSchema(BaseModel):
    id: int
    username: str
    rol: str
    activo: bool = True


class UsuarioCreate(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=50)]
    password: Annotated[str, Field(min_length=8, max_length=128)]


class UsuarioUpdate(BaseModel):
    username: Annotated[str | None, Field(min_length=3, max_length=50)] = None
    password: Annotated[str | None, Field(min_length=8, max_length=128)] = None


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


# --- Usuarios (vendedores y admins): se desactivan, no se borran ---
def _rutas_de_usuarios(ruta: str, rol: str) -> None:
    """Las mismas rutas para vendedores y admins; la logica vive en services/usuarios.py."""

    @router.get(f"/api/superadmin/usuarios/{ruta}", response_model=list[UsuarioSchema], name=f"listar_{ruta}")
    def listar(db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_roles("superadmin"))) -> list[UsuarioSchema]:
        return [UsuarioSchema(**u) for u in servicio_usuarios.listar(db, rol)]

    @router.post(f"/api/superadmin/usuarios/{ruta}", response_model=UsuarioSchema, status_code=201, name=f"crear_{ruta}")
    def crear(
        payload: UsuarioCreate,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        return UsuarioSchema(**servicio_usuarios.crear(db, rol, payload.username, payload.password, current_user.username))

    @router.patch(f"/api/superadmin/usuarios/{ruta}/{{usuario_id}}", response_model=UsuarioSchema, name=f"editar_{ruta}")
    def editar(
        usuario_id: int,
        payload: UsuarioUpdate,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        return UsuarioSchema(**servicio_usuarios.editar(db, rol, usuario_id, payload.username, payload.password, current_user.username))

    @router.delete(f"/api/superadmin/usuarios/{ruta}/{{usuario_id}}", response_model=UsuarioSchema, name=f"desactivar_{ruta}")
    def desactivar(
        usuario_id: int,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        """Desactiva al usuario (no se borra) y le cierra las sesiones."""
        return UsuarioSchema(**servicio_usuarios.desactivar(db, rol, usuario_id, current_user.username))

    @router.put(f"/api/superadmin/usuarios/{ruta}/{{usuario_id}}/reactivar", response_model=UsuarioSchema, name=f"reactivar_{ruta}")
    def reactivar(
        usuario_id: int,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        return UsuarioSchema(**servicio_usuarios.reactivar(db, rol, usuario_id, current_user.username))

    @router.post(f"/api/superadmin/usuarios/{ruta}/{{usuario_id}}/cerrar-sesiones", response_model=UsuarioSchema, name=f"cerrar_sesiones_{ruta}")
    def cerrar_sesiones(
        usuario_id: int,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        return UsuarioSchema(**servicio_usuarios.cerrar_sesiones(db, rol, usuario_id, current_user.username))


_rutas_de_usuarios("vendedores", "vendedor")
_rutas_de_usuarios("admins", "admin")


# --- Informes ---
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
        .where(VentaModel.creado_por.is_not(None), VentaModel.anulada.is_(False))
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
        .join(VentaModel, VentaModel.id == DetalleVentaModel.venta_id)
        .where(VentaModel.anulada.is_(False))
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
        .join(VentaModel, VentaModel.id == DetalleVentaModel.venta_id)
        .where(VentaModel.anulada.is_(False))
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
        ).where(VentaModel.creado_por.is_not(None), VentaModel.anulada.is_(False)),
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


# --- Cierres de caja ---
class CajaCierreSchema(BaseModel):
    id: int
    monto_inicial: float
    monto_ventas_efectivo: float
    monto_ventas_transferencia: float
    monto_ventas_tarjeta: float = 0.0
    monto_gastos: float
    monto_cierre: float | None
    fecha_apertura: datetime
    fecha_cierre: datetime | None
    abierto_por: str
    cerrado_por: str | None
    saldo_esperado: float
    esta_abierta: bool


@router.get("/api/superadmin/caja", response_model=list[CajaCierreSchema])
def list_caja(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
):
    offset = (page - 1) * limit
    rows = db.execute(
        select(CierreCajaModel).order_by(CierreCajaModel.fecha_apertura.desc()).offset(offset).limit(limit),
    ).scalars().all()
    return [
        CajaCierreSchema(
            id=r.id,
            monto_inicial=float(r.monto_inicial),
            monto_ventas_efectivo=float(r.monto_ventas_efectivo),
            monto_ventas_transferencia=float(r.monto_ventas_transferencia),
            monto_ventas_tarjeta=float(r.monto_ventas_tarjeta or 0.0),
            monto_gastos=float(r.monto_gastos),
            monto_cierre=float(r.monto_cierre) if r.monto_cierre is not None else None,
            fecha_apertura=r.fecha_apertura,
            fecha_cierre=r.fecha_cierre,
            abierto_por=r.abierto_por,
            cerrado_por=r.cerrado_por,
            saldo_esperado=efectivo_esperado(r.monto_inicial, r.monto_ventas_efectivo, r.monto_gastos),
            esta_abierta=r.fecha_cierre is None,
        )
        for r in rows
    ]


@router.get("/api/superadmin/facturas-compra", response_model=list[FacturaCompraResponse])
def list_facturas_compra(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
):
    offset = (page - 1) * limit
    facturas = db.execute(
        select(FacturaCompraModel)
        .order_by(FacturaCompraModel.fecha_creacion.desc())
        .offset(offset)
        .limit(limit),
    ).scalars().all()

    if not facturas:
        return []

    proveedor_ids = {f.proveedor_id for f in facturas}
    proveedores = db.execute(
        select(ProveedorModel).where(ProveedorModel.id.in_(proveedor_ids)),
    ).scalars().all()
    proveedor_map = {p.id: p.nombre for p in proveedores}

    factura_ids = [f.id for f in facturas]
    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(FacturaCompraDetalleModel.factura_id.in_(factura_ids)),
    ).scalars().all()
    detalles_map: dict[int, list[FacturaCompraDetalleModel]] = {}
    for d in detalles:
        detalles_map.setdefault(d.factura_id, []).append(d)

    return [
        _to_factura_response(
            f,
            proveedor_nombre=proveedor_map.get(f.proveedor_id, "Proveedor"),
            items=detalles_map.get(f.id, []),
        )
        for f in facturas
    ]
