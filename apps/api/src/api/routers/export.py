"""Exportacion de datos a CSV."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    GastoModel,
    ProductoModel,
    VentaModel,
    DetalleVentaModel,
    ClienteModel,
)

router = APIRouter(tags=["export"])


def _csv_response(rows: list[list[str]], filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/api/export/productos")
def export_productos(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> StreamingResponse:
    productos = db.execute(
        select(ProductoModel).order_by(ProductoModel.nombre.asc()),
    ).scalars().all()

    rows = [
        ["id", "nombre", "codigo_barras", "catalogo", "precio_costo", "precio_venta", "stock_actual", "stock_minimo", "activo"],
    ]
    for p in productos:
        rows.append([
            str(p.id),
            p.nombre,
            p.codigo_barras or "",
            p.catalogo,
            str(p.precio_costo),
            str(p.precio_venta),
            str(p.stock_actual),
            str(p.stock_minimo),
            "Si" if p.activo else "No",
        ])

    return _csv_response(rows, "productos.csv")


@router.get("/api/export/ventas")
def export_ventas(
    fecha_desde: str | None = Query(default=None),
    fecha_hasta: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> StreamingResponse:
    query = select(VentaModel).order_by(VentaModel.fecha.desc())
    if fecha_desde:
        query = query.where(VentaModel.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.where(VentaModel.fecha <= fecha_hasta)
    ventas = db.execute(query).scalars().all()

    cliente_ids = {v.cliente_id for v in ventas if v.cliente_id is not None}
    clientes_map: dict[int, str] = {}
    if cliente_ids:
        clientes = db.execute(
            select(ClienteModel).where(ClienteModel.id.in_(cliente_ids)),
        ).scalars().all()
        clientes_map = {c.id: c.nombre for c in clientes}

    rows = [
        ["id", "fecha", "cliente", "total", "saldo_pendiente", "metodo_pago", "es_fiado", "tipo_fiado", "creado_por"],
    ]
    for v in ventas:
        rows.append([
            str(v.id),
            str(v.fecha),
            clientes_map.get(v.cliente_id) or "",
            str(v.total),
            str(v.saldo_pendiente),
            v.metodo_pago or "",
            "Si" if v.es_fiado else "No",
            v.tipo_fiado or "",
            v.creado_por or "",
        ])

    return _csv_response(rows, "ventas.csv")


@router.get("/api/export/gastos")
def export_gastos(
    fecha_desde: str | None = Query(default=None),
    fecha_hasta: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> StreamingResponse:
    query = select(GastoModel).order_by(GastoModel.fecha.desc())
    if fecha_desde:
        query = query.where(GastoModel.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.where(GastoModel.fecha <= fecha_hasta)
    gastos = db.execute(query).scalars().all()

    rows = [
        ["id", "fecha", "categoria", "descripcion", "monto", "registrado_por"],
    ]
    for g in gastos:
        rows.append([
            str(g.id),
            str(g.fecha),
            g.categoria,
            g.descripcion,
            str(g.monto),
            g.registrado_por,
        ])

    return _csv_response(rows, "gastos.csv")
