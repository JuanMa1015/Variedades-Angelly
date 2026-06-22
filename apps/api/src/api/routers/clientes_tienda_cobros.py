"""Router de cobros y abonos de fiado de tienda."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, literal, null, or_, select, union
from sqlalchemy.orm import Session, aliased

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import search_filter
from src.api.schemas.tienda import (
    AbonoTiendaCreateRequest,
    AbonoTiendaResponse,
    ClienteTiendaCobroResponse,
    ClienteTiendaPageResponse,
    MovimientoTiendaPageResponse,
    MovimientoTiendaResponse,
    TiendaResumenResponse,
)
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    AbonoTiendaModel,
    ClienteFiadoTiendaModel,
    DetalleVentaModel,
    VentaModel,
)

router = APIRouter(tags=["clientes-tienda-cobros"])


@router.get("/api/clientes/tienda/resumen", response_model=TiendaResumenResponse)
def tienda_resumen(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> TiendaResumenResponse:
    clientes = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.activo == True),
    ).scalars().all()

    clientes_totales = len(clientes)
    clientes_con_deuda = sum(1 for c in clientes if float(c.deuda_total or 0) > 0)
    deuda_total = float(sum(float(c.deuda_total or 0) for c in clientes))
    clientes_alto_riesgo = sum(1 for c in clientes if float(c.deuda_total or 0) > 400000)
    clientes_riesgo_medio = sum(1 for c in clientes if 200000 < float(c.deuda_total or 0) <= 400000)
    saldo_promedio = deuda_total / clientes_con_deuda if clientes_con_deuda > 0 else 0.0

    return TiendaResumenResponse(
        clientes_totales=clientes_totales,
        clientes_con_deuda=clientes_con_deuda,
        deuda_total=deuda_total,
        clientes_alto_riesgo=clientes_alto_riesgo,
        clientes_riesgo_medio=clientes_riesgo_medio,
        saldo_promedio=saldo_promedio,
    )


@router.get("/api/clientes/tienda/cobro", response_model=ClienteTiendaPageResponse)
def list_clientes_tienda_cobro(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> ClienteTiendaPageResponse:
    query = select(ClienteFiadoTiendaModel).where(
        ClienteFiadoTiendaModel.activo == True,
        ClienteFiadoTiendaModel.deuda_total > 0,
    )
    normalized_search = search.strip() if search else None
    filters = search_filter(normalized_search, ClienteFiadoTiendaModel.nombre, ClienteFiadoTiendaModel.telefono_whatsapp)
    if filters:
        query = query.where(or_(*filters))

    total_items = db.execute(
        select(func.count()).select_from(query.subquery()),
    ).scalar_one()
    total_pages = max(1, (total_items + limit - 1) // limit)
    offset = (page - 1) * limit

    clientes = db.execute(
        query.order_by(ClienteFiadoTiendaModel.nombre.asc()).offset(offset).limit(limit),
    ).scalars().all()

    return ClienteTiendaPageResponse(
        data=[
            ClienteTiendaCobroResponse(
                id=c.id,
                nombre=c.nombre,
                telefono_whatsapp=c.telefono_whatsapp,
                deuda_total=c.deuda_total,
            )
            for c in clientes
        ],
        total_pages=total_pages,
        current_page=page,
    )


@router.get("/api/clientes/tienda/{cliente_id}/movimientos", response_model=MovimientoTiendaPageResponse)
def list_cliente_tienda_movimientos(
    cliente_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=5, ge=1, le=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> MovimientoTiendaPageResponse:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ventas_q = select(
        literal('Venta').label('tipo'),
        DetalleVentaModel.id.label('id'),
        VentaModel.fecha.label('fecha'),
        DetalleVentaModel.nombre_producto.label('articulo'),
        DetalleVentaModel.cantidad.label('cantidad'),
        DetalleVentaModel.precio_unitario.label('precio_unitario'),
        DetalleVentaModel.subtotal.label('monto'),
        null().label('referencia'),
        null().label('saldo'),
        VentaModel.es_fiado.label('es_fiado'),
    ).where(
        VentaModel.cliente_tienda_id == cliente_id,
        DetalleVentaModel.venta_id == VentaModel.id,
    )

    abonos_q = select(
        literal('Abono').label('tipo'),
        AbonoTiendaModel.id.label('id'),
        AbonoTiendaModel.fecha.label('fecha'),
        null().label('articulo'),
        null().label('cantidad'),
        null().label('precio_unitario'),
        AbonoTiendaModel.monto.label('monto'),
        AbonoTiendaModel.referencia.label('referencia'),
        AbonoTiendaModel.saldo_cliente.label('saldo'),
        null().label('es_fiado'),
    ).where(
        AbonoTiendaModel.cliente_id == cliente_id,
    )

    union_subq = union(ventas_q, abonos_q).subquery()

    total = db.execute(
        select(func.count()).select_from(union_subq),
    ).scalar_one()
    total_pages = max(1, (total + limit - 1) // limit) if total > 0 else 1
    offset = (page - 1) * limit

    rows = db.execute(
        select(union_subq).order_by(union_subq.c.fecha.desc()).offset(offset).limit(limit),
    ).all()

    movimientos = []
    for row in rows:
        if row.tipo == 'Venta':
            movimientos.append(MovimientoTiendaResponse(
                id=row.id,
                tipo="Venta",
                descripcion="Venta fiada" if row.es_fiado else "Venta cancelada",
                articulo=row.articulo,
                cantidad=row.cantidad,
                precio_unitario=row.precio_unitario,
                monto=row.monto,
                fecha=row.fecha,
                saldo=None,
            ))
        else:
            movimientos.append(MovimientoTiendaResponse(
                id=row.id,
                tipo="Abono",
                descripcion="Pago aplicado a deuda",
                referencia=row.referencia,
                monto=row.monto,
                fecha=row.fecha,
                saldo=row.saldo,
            ))

    return MovimientoTiendaPageResponse(
        data=movimientos,
        total_pages=total_pages,
        current_page=page,
    )


@router.post("/api/clientes/tienda/{cliente_id}/abonos", response_model=AbonoTiendaResponse, status_code=201)
def create_abono_tienda(
    cliente_id: int,
    payload: AbonoTiendaCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> AbonoTiendaResponse:
    with db.begin():
        cliente = db.execute(
            select(ClienteFiadoTiendaModel)
            .where(ClienteFiadoTiendaModel.id == cliente_id)
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
        abono = AbonoTiendaModel(
            cliente_id=cliente.id,
            monto=monto,
            metodo_pago=payload.metodo_pago,
            saldo_cliente=cliente.deuda_total,
            referencia=payload.referencia,
        )
        db.add(abono)
        db.flush()

    db.refresh(abono)
    return AbonoTiendaResponse(
        id=abono.id,
        cliente_id=abono.cliente_id,
        monto=abono.monto,
        metodo_pago=abono.metodo_pago,
        saldo_cliente=abono.saldo_cliente,
        referencia=abono.referencia,
        fecha=abono.fecha,
    )
