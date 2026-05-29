"""Router de cobros y abonos de cartera."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import search_filter
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import AbonoCarteraModel, ClienteModel, DetalleVentaModel, ProductoModel, VentaModel
from src.api.routers.cartera_shared import build_cliente_page_response, normalize_naive_datetime, to_abono_response
from src.api.schemas.cartera import (
    AbonoCarteraCreateAdminRequest,
    AbonoCarteraCreateRequest,
    AbonoCarteraResponse,
    AbonoCarteraUpdateRequest,
    CarteraResumenResponse,
    ClienteCarteraPageResponse,
    ClienteCobroResponse,
    MovimientoClientePageResponse,
    MovimientoClienteResponse,
)

router = APIRouter(tags=["clientes-cartera-cobros"])


@router.get("/api/cartera/resumen", response_model=CarteraResumenResponse)
def cartera_resumen(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> CarteraResumenResponse:
    clientes = db.execute(
        select(ClienteModel).where(ClienteModel.activo == True),
    ).scalars().all()

    clientes_totales = len(clientes)
    clientes_con_deuda = sum(1 for c in clientes if c.deuda_total > 0)
    deuda_total = float(sum(c.deuda_total for c in clientes))
    clientes_alto_riesgo = sum(1 for c in clientes if c.deuda_total > 400000)
    clientes_riesgo_medio = sum(1 for c in clientes if 200000 < c.deuda_total <= 400000)
    saldo_promedio = deuda_total / clientes_con_deuda if clientes_con_deuda > 0 else 0.0

    return CarteraResumenResponse(
        clientes_totales=clientes_totales,
        clientes_con_deuda=clientes_con_deuda,
        deuda_total=deuda_total,
        clientes_alto_riesgo=clientes_alto_riesgo,
        clientes_riesgo_medio=clientes_riesgo_medio,
        saldo_promedio=saldo_promedio,
    )


@router.get("/api/cartera/clientes", response_model=ClienteCarteraPageResponse)
def list_clientes_cartera_admin(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClienteCarteraPageResponse:
    query = select(ClienteModel).where(ClienteModel.activo == True)
    normalized_search = search.strip() if search else None

    filters = search_filter(normalized_search, ClienteModel.nombre, ClienteModel.documento, ClienteModel.telefono_whatsapp)
    if filters:
        query = query.where(or_(*filters))

    return build_cliente_page_response(query=query, page=page, limit=limit, db=db)


@router.get("/api/clientes/cartera", response_model=ClienteCarteraPageResponse)
def list_clientes_cartera(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClienteCarteraPageResponse:
    query = select(ClienteModel).where(ClienteModel.activo == True, ClienteModel.deuda_total > 0)
    normalized_search = search.strip() if search else None

    filters = search_filter(normalized_search, ClienteModel.nombre, ClienteModel.documento, ClienteModel.telefono_whatsapp)
    if filters:
        query = query.where(or_(*filters))

    return build_cliente_page_response(query=query, page=page, limit=limit, db=db)


@router.get(
    "/api/clientes/{cliente_id}/movimientos",
    response_model=MovimientoClientePageResponse,
)
@router.get(
    "/api/cartera/clientes/{cliente_id}/movimientos",
    response_model=MovimientoClientePageResponse,
)
def list_cliente_movimientos(
    cliente_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=5, ge=1, le=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> MovimientoClientePageResponse:
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    MAX_PAGE = limit * 10
    search_limit = max(MAX_PAGE, 500)

    ventas = db.execute(
        select(VentaModel)
        .where(VentaModel.cliente_id == cliente_id)
        .order_by(VentaModel.fecha.desc())
        .limit(search_limit),
    ).scalars().all()

    abonos = db.execute(
        select(AbonoCarteraModel)
        .where(AbonoCarteraModel.cliente_id == cliente_id)
        .order_by(AbonoCarteraModel.fecha.desc())
        .limit(search_limit),
    ).scalars().all()

    detalles_por_venta_id: dict[int, list[DetalleVentaModel]] = {}
    venta_ids = [venta.id for venta in ventas]
    if venta_ids:
        detalles = db.execute(
            select(DetalleVentaModel)
            .join(ProductoModel, DetalleVentaModel.producto_id == ProductoModel.id)
            .where(
                DetalleVentaModel.venta_id.in_(venta_ids),
                ProductoModel.catalogo == 'cartera',
            ),
        ).scalars().all()
        for detalle in detalles:
            detalles_por_venta_id.setdefault(detalle.venta_id, []).append(detalle)

    movimientos: list[MovimientoClienteResponse] = []
    for venta in ventas:
        detalles_venta = detalles_por_venta_id.get(venta.id, [])
        if not detalles_venta:
            continue
        for detalle in detalles_venta:
            movimientos.append(
                MovimientoClienteResponse(
                    id=detalle.id,
                    tipo="Venta",
                    descripcion="Venta fiada" if venta.es_fiado else "Venta cancelada",
                    articulo=detalle.nombre_producto,
                    cantidad=detalle.cantidad,
                    monto=detalle.subtotal,
                    fecha=venta.fecha,
                    saldo=None,
                ),
            )

    for abono in abonos:
        movimientos.append(
            MovimientoClienteResponse(
                id=abono.id,
                tipo="Abono",
                descripcion="Pago aplicado a deuda",
                referencia=abono.referencia,
                monto=abono.monto,
                fecha=abono.fecha,
                saldo=abono.saldo_cliente,
            ),
        )

    movimientos.sort(key=lambda movimiento: movimiento.fecha, reverse=True)

    total_items = len(movimientos)
    total_pages = max(1, (total_items + limit - 1) // limit)
    start = (page - 1) * limit
    end = start + limit
    movimientos_paginados = movimientos[start:end]

    return MovimientoClientePageResponse(
        data=movimientos_paginados,
        total_pages=total_pages,
        current_page=page,
    )


@router.get("/api/cartera/abonos", response_model=list[AbonoCarteraResponse])
def list_abonos_cartera(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> list[AbonoCarteraResponse]:
    abonos = db.execute(
        select(AbonoCarteraModel).order_by(AbonoCarteraModel.fecha.desc()),
    ).scalars().all()

    return [to_abono_response(abono) for abono in abonos]


@router.post("/api/cartera/clientes/{cliente_id}/abonos", response_model=AbonoCarteraResponse, status_code=201)
def create_abono_cartera(
    cliente_id: int,
    payload: AbonoCarteraCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AbonoCarteraResponse:
    with db.begin():
        cliente = db.execute(
            select(ClienteModel)
            .where(ClienteModel.id == cliente_id)
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
        abono = AbonoCarteraModel(
            cliente_id=cliente.id,
            monto=monto,
            metodo_pago=payload.metodo_pago,
            saldo_cliente=cliente.deuda_total,
            referencia=payload.referencia,
            fecha=normalize_naive_datetime(payload.fecha) or datetime.now(UTC),
        )
        db.add(abono)
        db.flush()

    db.refresh(abono)
    return to_abono_response(abono)


@router.post("/api/cartera/abonos", response_model=AbonoCarteraResponse, status_code=201)
def create_abono_cartera_direct(
    payload: AbonoCarteraCreateAdminRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AbonoCarteraResponse:
    with db.begin():
        cliente = db.execute(
            select(ClienteModel)
            .where(ClienteModel.id == payload.cliente_id)
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
        abono = AbonoCarteraModel(
            cliente_id=cliente.id,
            monto=monto,
            metodo_pago=payload.metodo_pago,
            saldo_cliente=cliente.deuda_total,
            referencia=payload.referencia,
            fecha=normalize_naive_datetime(payload.fecha) or datetime.now(UTC),
        )
        db.add(abono)
        db.flush()

    db.refresh(abono)
    return to_abono_response(abono)


@router.patch("/api/cartera/abonos/{abono_id}", response_model=AbonoCarteraResponse)
def update_abono_cartera(
    abono_id: int,
    payload: AbonoCarteraUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AbonoCarteraResponse:
    abono = db.execute(
        select(AbonoCarteraModel).where(AbonoCarteraModel.id == abono_id),
    ).scalar_one_or_none()
    if abono is None:
        raise HTTPException(status_code=404, detail="Abono no encontrado")

    if payload.monto is not None:
        abono.monto = payload.monto
    if payload.metodo_pago is not None:
        abono.metodo_pago = payload.metodo_pago
    if payload.referencia is not None:
        abono.referencia = payload.referencia

    db.commit()
    db.refresh(abono)
    return to_abono_response(abono)


@router.delete("/api/cartera/abonos/{abono_id}", status_code=204)
def delete_abono_cartera(
    abono_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> None:
    abono = db.execute(
        select(AbonoCarteraModel).where(AbonoCarteraModel.id == abono_id),
    ).scalar_one_or_none()
    if abono is None:
        raise HTTPException(status_code=404, detail="Abono no encontrado")

    db.delete(abono)
    db.commit()
