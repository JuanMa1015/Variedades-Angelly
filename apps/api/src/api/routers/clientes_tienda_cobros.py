"""Router de cobros y abonos de fiado de tienda."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

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

    MAX_PAGE = limit * 10
    search_limit = max(MAX_PAGE, 500)

    ventas = db.execute(
        select(VentaModel)
        .where(VentaModel.cliente_tienda_id == cliente_id)
        .order_by(VentaModel.fecha.desc())
        .limit(search_limit),
    ).scalars().all()

    abonos = db.execute(
        select(AbonoTiendaModel)
        .where(AbonoTiendaModel.cliente_id == cliente_id)
        .order_by(AbonoTiendaModel.fecha.desc())
        .limit(search_limit),
    ).scalars().all()

    venta_ids = [venta.id for venta in ventas]
    detalles_por_venta_id: dict[int, list[DetalleVentaModel]] = {}
    if venta_ids:
        detalles = db.execute(
            select(DetalleVentaModel).where(DetalleVentaModel.venta_id.in_(venta_ids)),
        ).scalars().all()
        for detalle in detalles:
            detalles_por_venta_id.setdefault(detalle.venta_id, []).append(detalle)

    movimientos: list[MovimientoTiendaResponse] = []
    for venta in ventas:
        detalles_venta = detalles_por_venta_id.get(venta.id, [])
        for detalle in detalles_venta:
            movimientos.append(
                MovimientoTiendaResponse(
                    id=detalle.id,
                    tipo="Venta",
                    descripcion="Venta fiada" if venta.es_fiado else "Venta cancelada",
                    articulo=detalle.nombre_producto,
                    cantidad=detalle.cantidad,
                    precio_unitario=detalle.precio_unitario,
                    monto=detalle.subtotal,
                    fecha=venta.fecha,
                    saldo=None,
                ),
            )

    for abono in abonos:
        movimientos.append(
            MovimientoTiendaResponse(
                id=abono.id,
                tipo="Abono",
                descripcion="Pago aplicado a deuda",
                referencia=abono.referencia,
                monto=abono.monto,
                fecha=abono.fecha,
                saldo=abono.saldo_cliente,
            ),
        )

    movimientos.sort(key=lambda m: m.fecha, reverse=True)

    total_items = len(movimientos)
    total_pages = max(1, (total_items + limit - 1) // limit)
    start = (page - 1) * limit
    end = start + limit
    movimientos_paginados = movimientos[start:end]

    return MovimientoTiendaPageResponse(
        data=movimientos_paginados,
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
