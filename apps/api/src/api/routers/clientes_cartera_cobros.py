"""Router de cobros y abonos de cartera."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, literal, null, or_, select, union
from sqlalchemy.orm import Session

from src.api.services.antiguedad_deuda import dias_de_deuda_cartera, estado_deuda
from src.api.services.auditoria import registrar_auditoria
from src.api.services.deuda import reajustar_deuda_cartera
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
    EstadoCuentaResponse,
    MovimientoClientePageResponse,
    MovimientoClienteResponse,
    UltimaCompraFiada,
    UltimoAbonoResponse,
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
    con_deuda = [c for c in clientes if c.deuda_total > 0]
    clientes_con_deuda = len(con_deuda)
    deuda_total = float(sum(c.deuda_total for c in clientes))
    # Riesgo por antiguedad de la deuda (igual que Clientes y Clientes de tienda): moroso > 60 dias, alerta 31 a 60.
    dias = dias_de_deuda_cartera(db, con_deuda)
    estados = [estado_deuda(float(c.deuda_total), dias.get(c.id)) for c in con_deuda]
    clientes_alto_riesgo = estados.count("moroso")
    clientes_riesgo_medio = estados.count("alerta")
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

    ventas_q = select(
        literal('Venta').label('tipo'),
        DetalleVentaModel.id.label('id'),
        VentaModel.fecha.label('fecha'),
        DetalleVentaModel.nombre_producto.label('articulo'),
        DetalleVentaModel.cantidad.label('cantidad'),
        DetalleVentaModel.subtotal.label('monto'),
        null().label('referencia'),
        null().label('saldo'),
        VentaModel.es_fiado.label('es_fiado'),
    ).where(
        VentaModel.cliente_id == cliente_id,
        DetalleVentaModel.venta_id == VentaModel.id,
        VentaModel.anulada.is_(False),
        DetalleVentaModel.producto_id == ProductoModel.id,
        ProductoModel.catalogo == 'cartera',
    )

    abonos_q = select(
        literal('Abono').label('tipo'),
        AbonoCarteraModel.id.label('id'),
        AbonoCarteraModel.fecha.label('fecha'),
        null().label('articulo'),
        null().label('cantidad'),
        AbonoCarteraModel.monto.label('monto'),
        AbonoCarteraModel.referencia.label('referencia'),
        AbonoCarteraModel.saldo_cliente.label('saldo'),
        null().label('es_fiado'),
    ).where(
        AbonoCarteraModel.cliente_id == cliente_id,
        AbonoCarteraModel.anulado.is_(False),
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
            movimientos.append(MovimientoClienteResponse(
                id=row.id,
                tipo="Venta",
                descripcion="Venta fiada" if row.es_fiado else "Venta cancelada",
                articulo=row.articulo,
                cantidad=row.cantidad,
                monto=row.monto,
                fecha=row.fecha,
                saldo=None,
            ))
        else:
            movimientos.append(MovimientoClienteResponse(
                id=row.id,
                tipo="Abono",
                descripcion="Pago aplicado a deuda",
                referencia=row.referencia,
                monto=row.monto,
                fecha=row.fecha,
                saldo=row.saldo,
            ))

    return MovimientoClientePageResponse(
        data=movimientos,
        total_pages=total_pages,
        current_page=page,
    )


@router.get("/api/cartera/abonos", response_model=list[AbonoCarteraResponse])
def list_abonos_cartera(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> list[AbonoCarteraResponse]:
    abonos = db.execute(
        select(AbonoCarteraModel).where(AbonoCarteraModel.anulado.is_(False)).order_by(AbonoCarteraModel.fecha.desc()),
    ).scalars().all()

    return [to_abono_response(abono) for abono in abonos]


TOLERANCIA_FECHA = timedelta(minutes=5)  # relojes del navegador y del servidor no coinciden al segundo


def _fecha_de_abono(valor: datetime | None) -> datetime:
    """El abono puede registrarse con fecha pasada, nunca futura: falsearia la antiguedad de la deuda."""
    ahora = datetime.now(UTC).replace(tzinfo=None)
    fecha = normalize_naive_datetime(valor) or ahora
    if fecha > ahora + TOLERANCIA_FECHA:
        raise HTTPException(status_code=400, detail="La fecha del abono no puede ser futura")
    return fecha


def _registrar_abono(db: Session, usuario: str, cliente_id: int, payload) -> AbonoCarteraModel:
    """Un abono de cartera: baja la deuda, queda fuera de la caja del vendedor y deja rastro en la auditoria."""
    with db.begin():
        cliente = db.execute(
            select(ClienteModel)
            .where(ClienteModel.id == cliente_id)
            .with_for_update(),
        ).scalar_one_or_none()

        if cliente is None:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        monto = round(float(payload.monto), 2)
        deuda_antes = float(cliente.deuda_total)
        if monto > deuda_antes:
            raise HTTPException(
                status_code=400,
                detail="El abono supera la deuda actual del cliente",
            )
        fecha = _fecha_de_abono(payload.fecha)

        cliente.deuda_total = round(deuda_antes - monto, 2)
        abono = AbonoCarteraModel(
            cliente_id=cliente.id,
            monto=monto,
            metodo_pago=payload.metodo_pago,
            saldo_cliente=cliente.deuda_total,
            referencia=payload.referencia,
            fecha=fecha,
            fuera_de_caja=True,
        )
        db.add(abono)
        db.flush()
        registrar_auditoria(
            db,
            usuario=usuario,
            modulo="cartera",
            entidad="abono",
            accion="crear",
            entidad_id=abono.id,
            detalle=f"{cliente.nombre}: abono {monto} ({payload.metodo_pago or 'sin metodo'}), deuda {deuda_antes} -> {cliente.deuda_total}",
        )

    db.refresh(abono)
    return abono


@router.post("/api/cartera/clientes/{cliente_id}/abonos", response_model=AbonoCarteraResponse, status_code=201)
def create_abono_cartera(
    cliente_id: int,
    payload: AbonoCarteraCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AbonoCarteraResponse:
    return to_abono_response(_registrar_abono(db, current_user.username, cliente_id, payload))


@router.post("/api/cartera/abonos", response_model=AbonoCarteraResponse, status_code=201)
def create_abono_cartera_direct(
    payload: AbonoCarteraCreateAdminRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AbonoCarteraResponse:
    return to_abono_response(_registrar_abono(db, current_user.username, payload.cliente_id, payload))


def _abono_vigente(db: Session, abono_id: int) -> AbonoCarteraModel:
    abono = db.execute(
        select(AbonoCarteraModel).where(AbonoCarteraModel.id == abono_id).with_for_update(),
    ).scalar_one_or_none()
    if abono is None:
        raise HTTPException(status_code=404, detail="Abono no encontrado")
    if abono.anulado:
        raise HTTPException(status_code=409, detail="El abono ya esta anulado")
    if abono.venta_id is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Es el abono inicial de la venta #{abono.venta_id}: se corrige anulando esa venta",
        )
    return abono


def _motivo(valor: str | None) -> str:
    motivo = " ".join((valor or "").split())
    if len(motivo) < 3:
        raise HTTPException(status_code=400, detail="Explica el motivo (minimo 3 letras)")
    return motivo


@router.patch("/api/cartera/abonos/{abono_id}", response_model=AbonoCarteraResponse)
def update_abono_cartera(
    abono_id: int,
    payload: AbonoCarteraUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> AbonoCarteraResponse:
    abono = _abono_vigente(db, abono_id)
    cambios: list[str] = []

    if payload.monto is not None and round(float(payload.monto), 2) != round(float(abono.monto), 2):
        motivo = _motivo(payload.motivo)
        nuevo = round(float(payload.monto), 2)
        deuda_nueva = reajustar_deuda_cartera(db, abono.cliente_id, float(abono.monto) - nuevo)
        cambios.append(f"monto {float(abono.monto)} -> {nuevo}, deuda queda en {deuda_nueva}. Motivo: {motivo}")
        abono.monto = nuevo
    if payload.metodo_pago is not None and payload.metodo_pago != abono.metodo_pago:
        cambios.append(f"metodo {abono.metodo_pago} -> {payload.metodo_pago}")
        abono.metodo_pago = payload.metodo_pago
    if payload.referencia is not None and payload.referencia != abono.referencia:
        cambios.append("referencia editada")
        abono.referencia = payload.referencia

    if cambios:
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="cartera",
            entidad="abono",
            accion="editar",
            entidad_id=abono.id,
            detalle="; ".join(cambios),
        )
    db.commit()
    db.refresh(abono)
    return to_abono_response(abono)


@router.delete("/api/cartera/abonos/{abono_id}", status_code=204)
def anular_abono_cartera(
    abono_id: int,
    motivo: str | None = Query(default=None, max_length=200, description="Por que se anula (obligatorio)"),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> None:
    """Anula el abono (no lo borra): la deuda del cliente vuelve a subir y queda quien, cuando y por que."""
    razon = _motivo(motivo)
    abono = _abono_vigente(db, abono_id)
    deuda_nueva = reajustar_deuda_cartera(db, abono.cliente_id, float(abono.monto))

    abono.anulado = True
    abono.anulado_en = datetime.now(UTC).replace(tzinfo=None)
    abono.anulado_por = current_user.username
    abono.motivo_anulacion = razon
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="cartera",
        entidad="abono",
        accion="anular",
        entidad_id=abono.id,
        detalle=f"Abono de {float(abono.monto)} (cliente {abono.cliente_id}), deuda queda en {deuda_nueva}. Motivo: {razon}",
    )
    db.commit()


@router.get("/api/cartera/clientes/{cliente_id}/estado-cuenta", response_model=EstadoCuentaResponse)
def get_estado_cuenta(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> EstadoCuentaResponse:
    """Cifras reales para el mensaje de cobro: deuda, desde cuando, ultimas compras fiadas y ultimo abono."""
    cliente = db.get(ClienteModel, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    dias = dias_de_deuda_cartera(db, [cliente]).get(cliente.id)
    ventas = db.execute(
        select(VentaModel)
        .where(VentaModel.cliente_id == cliente_id, VentaModel.es_fiado.is_(True), VentaModel.anulada.is_(False))
        .order_by(VentaModel.fecha.desc(), VentaModel.id.desc())
        .limit(5),
    ).scalars().all()
    lineas: dict[int, list[str]] = {}
    if ventas:
        for d in db.execute(
            select(DetalleVentaModel).where(DetalleVentaModel.venta_id.in_([v.id for v in ventas])).order_by(DetalleVentaModel.id),
        ).scalars():
            lineas.setdefault(d.venta_id, []).append(f"{d.nombre_producto} x{d.cantidad}")
    ultimo = db.execute(
        select(AbonoCarteraModel)
        .where(AbonoCarteraModel.cliente_id == cliente_id, AbonoCarteraModel.anulado.is_(False), AbonoCarteraModel.venta_id.is_(None))
        .order_by(AbonoCarteraModel.fecha.desc(), AbonoCarteraModel.id.desc())
        .limit(1),
    ).scalar_one_or_none()

    return EstadoCuentaResponse(
        cliente_id=cliente.id,
        nombre=cliente.nombre,
        deuda_total=float(cliente.deuda_total),
        dias_deuda=dias,
        estado_deuda=estado_deuda(float(cliente.deuda_total), dias),
        ultimas_compras=[
            UltimaCompraFiada(venta_id=v.id, fecha=v.fecha, total=float(v.total), articulos=", ".join(lineas.get(v.id, [])) or "-")
            for v in ventas
        ],
        ultimo_abono=UltimoAbonoResponse(fecha=ultimo.fecha, monto=float(ultimo.monto)) if ultimo else None,
    )
