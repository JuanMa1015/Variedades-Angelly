"""Router CRUD para facturas de compra."""

from __future__ import annotations

import os
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo, build_page
from src.infrastructure.database.connection import get_db

IVA_RATE = float(os.getenv("IVA_RATE", "0.19"))
from src.infrastructure.database.models import (
    FacturaCompraDetalleModel,
    FacturaCompraModel,
    ProductoModel,
    ProveedorModel,
)

router = APIRouter(tags=["facturas-compra"])


class FacturaDetalleCreateRequest(BaseModel):
    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0)]
    aplica_iva: bool = False
    precio_unitario: Annotated[float, Field(gt=0)]


class FacturaCompraCreateRequest(BaseModel):
    proveedor_id: Annotated[int, Field(gt=0)]
    items: Annotated[list[FacturaDetalleCreateRequest], Field(min_length=1)]
    encomienda: Annotated[float, Field(ge=0)] = 0.0
    porcentaje_ganancia: Annotated[float, Field(gt=0, le=1)] = 0.70
    numero_factura: Annotated[str | None, Field(max_length=20)] = None


class FacturaDetalleResponse(BaseModel):
    producto_id: int
    nombre_producto: str
    cantidad: int
    aplica_iva: bool
    precio_unitario: float
    precio_total: float
    precio_venta_sugerido: float | None = None
    ganancia_estimada: float | None = None


class FacturaCompraResponse(BaseModel):
    id: int
    proveedor_id: int
    proveedor_nombre: str
    creado_por: str
    subtotal: float
    total_iva: float
    total_factura: float
    numero_factura: str | None = None
    encomienda: float | None = 0.0
    porcentaje_ganancia: float | None = None
    fecha_creacion: datetime
    items: list[FacturaDetalleResponse]


class FacturaCompraPageResponse(BaseModel):
    data: list[FacturaCompraResponse]
    page: PageInfo


class FacturaCompraUpdateRequest(BaseModel):
    total_factura: Annotated[float | None, Field(gt=0)] = None


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
        numero_factura=factura.numero_factura,
        encomienda=factura.encomienda,
        porcentaje_ganancia=factura.porcentaje_ganancia,
        fecha_creacion=factura.fecha_creacion,
        items=[
            FacturaDetalleResponse(
                producto_id=item.producto_id,
                nombre_producto=item.nombre_producto,
                cantidad=item.cantidad,
                aplica_iva=item.aplica_iva,
                precio_unitario=item.precio_unitario,
                precio_total=item.precio_total,
                precio_venta_sugerido=item.precio_venta_sugerido,
                ganancia_estimada=item.ganancia_estimada,
            )
            for item in items
        ],
    )


@router.get("/api/facturas-compra", response_model=list[FacturaCompraResponse])
def list_facturas_compra(
    db: Session = Depends(get_db),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[FacturaCompraResponse]:
    query = select(FacturaCompraModel)
    if fecha_desde:
        query = query.where(FacturaCompraModel.fecha_creacion >= fecha_desde)
    if fecha_hasta:
        query = query.where(FacturaCompraModel.fecha_creacion <= fecha_hasta)
    facturas = db.execute(
        query.order_by(FacturaCompraModel.fecha_creacion.desc()),
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


@router.get("/api/facturas-compra/paginadas", response_model=FacturaCompraPageResponse)
def list_facturas_compra_paginadas(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> FacturaCompraPageResponse:
    query = select(FacturaCompraModel)
    if fecha_desde:
        query = query.where(FacturaCompraModel.fecha_creacion >= fecha_desde)
    if fecha_hasta:
        query = query.where(FacturaCompraModel.fecha_creacion <= fecha_hasta)
    items, page_info = build_page(db, query, page, limit, FacturaCompraModel.fecha_creacion.desc())

    if not items:
        return FacturaCompraPageResponse(data=[], page=page_info)

    proveedor_ids = {factura.proveedor_id for factura in items}
    proveedores = db.execute(
        select(ProveedorModel).where(ProveedorModel.id.in_(proveedor_ids)),
    ).scalars().all()
    proveedor_map = {proveedor.id: proveedor.nombre for proveedor in proveedores}

    factura_ids = [factura.id for factura in items]
    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(FacturaCompraDetalleModel.factura_id.in_(factura_ids)),
    ).scalars().all()

    detalles_map: dict[int, list[FacturaCompraDetalleModel]] = {}
    for detalle in detalles:
        detalles_map.setdefault(detalle.factura_id, []).append(detalle)

    return FacturaCompraPageResponse(
        data=[
            _to_factura_response(
                factura,
                proveedor_nombre=proveedor_map.get(factura.proveedor_id, "Proveedor"),
                items=detalles_map.get(factura.id, []),
            )
            for factura in items
        ],
        page=page_info,
    )


@router.post("/api/facturas-compra", response_model=FacturaCompraResponse, status_code=201)
def create_factura_compra(
    payload: FacturaCompraCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
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
        iva = base * IVA_RATE if item.aplica_iva else 0.0
        total_linea = base + iva
        precio_con_iva = item.precio_unitario * (1 + IVA_RATE) if item.aplica_iva else item.precio_unitario
        precio_venta_sugerido = precio_con_iva / payload.porcentaje_ganancia
        ganancia_estimada = precio_venta_sugerido - precio_con_iva

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
                "precio_venta_sugerido": round(precio_venta_sugerido, 2),
                "ganancia_estimada": round(ganancia_estimada, 2),
            },
        )

    factura = FacturaCompraModel(
        proveedor_id=payload.proveedor_id,
        creado_por=current_user.username,
        subtotal=subtotal,
        total_iva=total_iva,
        total_factura=subtotal + total_iva - (payload.encomienda or 0),
        numero_factura=payload.numero_factura.strip() if payload.numero_factura else None,
        encomienda=payload.encomienda or None,
        porcentaje_ganancia=payload.porcentaje_ganancia,
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
            precio_venta_sugerido=item["precio_venta_sugerido"],
            ganancia_estimada=item["ganancia_estimada"],
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
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
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
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
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
