"""Router de cobros y abonos de fiado de tienda."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.limiter import limiter, login_rate_limit
from src.api.pagination import search_filter
from src.api.schemas.anulacion import AnularRequest
from src.api.schemas.tienda import (
    AbonoTiendaCreateRequest,
    AbonoTiendaResponse,
    ClienteTiendaCobroResponse,
    ClienteTiendaListaItem,
    ClienteTiendaListaPage,
    ClienteTiendaPageResponse,
    ItemMovimientoTienda,
    MovimientoTiendaPageResponse,
    MovimientoTiendaResponse,
    TiendaResumenResponse,
)
from src.api.services.anulacion import anular_abono_tienda, quien_autoriza
from src.api.services.antiguedad_deuda import dias_de_deuda, estado_deuda
from src.api.services.auditoria import registrar_auditoria
from src.api.services.venta_reglas import exigir_caja_abierta
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    AbonoTiendaModel,
    ClienteFiadoTiendaModel,
    DetalleVentaModel,
    VentaModel,
)

router = APIRouter(tags=["clientes-tienda-cobros"])

FiltroLista = Literal["todos", "con_deuda", "alerta", "moroso"]
OrdenLista = Literal["deuda", "nombre", "antiguedad"]


def _respuesta_abono(abono: AbonoTiendaModel, cliente: ClienteFiadoTiendaModel | None) -> AbonoTiendaResponse:
    return AbonoTiendaResponse(
        id=abono.id,
        cliente_id=abono.cliente_id,
        monto=abono.monto,
        metodo_pago=abono.metodo_pago,
        saldo_cliente=abono.saldo_cliente,
        referencia=abono.referencia,
        fecha=abono.fecha,
        cliente_nombre=cliente.nombre if cliente is not None else None,
        deuda_anterior=float(abono.saldo_cliente) + float(abono.monto),
        anulado=bool(abono.anulado),
    )


@router.get("/api/clientes/tienda/resumen", response_model=TiendaResumenResponse)
def tienda_resumen(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> TiendaResumenResponse:
    clientes = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.activo.is_(True)),
    ).scalars().all()
    dias = dias_de_deuda(db, list(clientes))

    con_deuda = [c for c in clientes if float(c.deuda_total or 0) > 0]
    estados = {c.id: estado_deuda(c.deuda_total, dias.get(c.id)) for c in con_deuda}
    deuda_total = float(sum(float(c.deuda_total or 0) for c in con_deuda))
    morosos = [c for c in con_deuda if estados[c.id] == "moroso"]

    return TiendaResumenResponse(
        clientes_totales=len(clientes),
        clientes_con_deuda=len(con_deuda),
        deuda_total=deuda_total,
        clientes_alto_riesgo=len(morosos),
        clientes_riesgo_medio=sum(1 for c in con_deuda if estados[c.id] == "alerta"),
        saldo_promedio=deuda_total / len(con_deuda) if con_deuda else 0.0,
        deuda_morosa=float(sum(float(c.deuda_total) for c in morosos)),
    )


@router.get("/api/clientes/tienda/lista", response_model=ClienteTiendaListaPage)
def lista_clientes_tienda(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1, max_length=120),
    filtro: FiltroLista = Query(default="todos"),
    orden: OrdenLista = Query(default="deuda"),
    inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> ClienteTiendaListaPage:
    """Lista unica de clientes: buscador, filtro por estado y orden (por defecto, quien mas debe primero)."""
    if inactivos and current_user.role == "vendedor":
        raise HTTPException(status_code=403, detail="Solo un administrador puede ver los clientes eliminados")

    consulta = select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.activo.is_(not inactivos))
    termino = q.strip() if q else None
    filtros = search_filter(termino, ClienteFiadoTiendaModel.nombre, ClienteFiadoTiendaModel.telefono_whatsapp)
    if filtros:
        consulta = consulta.where(or_(*filtros))
    clientes = list(db.execute(consulta).scalars().all())

    dias = dias_de_deuda(db, clientes)
    items = [
        (c, dias.get(c.id), estado_deuda(c.deuda_total, dias.get(c.id)))
        for c in clientes
    ]
    if filtro == "con_deuda":
        items = [i for i in items if i[2] != "sin_deuda"]
    elif filtro in {"alerta", "moroso"}:
        items = [i for i in items if i[2] == filtro]

    if orden == "nombre":
        items.sort(key=lambda i: i[0].nombre.casefold())
    elif orden == "antiguedad":
        items.sort(key=lambda i: (-(i[1] if i[1] is not None else -1), i[0].nombre.casefold()))
    else:
        items.sort(key=lambda i: (-float(i[0].deuda_total or 0), i[0].nombre.casefold()))

    total = len(items)
    pagina = items[(page - 1) * limit : page * limit]
    con_ventas = set(
        db.execute(
            select(VentaModel.cliente_tienda_id)
            .where(VentaModel.cliente_tienda_id.in_([c.id for c, _, _ in pagina]))
            .distinct(),
        ).scalars(),
    ) if pagina else set()

    return ClienteTiendaListaPage(
        data=[
            ClienteTiendaListaItem(
                id=c.id,
                nombre=c.nombre,
                telefono_whatsapp=c.telefono_whatsapp,
                deuda_total=float(c.deuda_total or 0),
                dias_deuda=d,
                estado_deuda=e,
                tiene_ventas=c.id in con_ventas,
                activo=bool(c.activo),
            )
            for c, d, e in pagina
        ],
        total=total,
        total_pages=max(1, (total + limit - 1) // limit),
        current_page=page,
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
        ClienteFiadoTiendaModel.activo.is_(True),
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


def _items_de_ventas(db: Session, venta_ids: list[int]) -> dict[int, list[ItemMovimientoTienda]]:
    if not venta_ids:
        return {}
    filas = db.execute(
        select(DetalleVentaModel).where(DetalleVentaModel.venta_id.in_(venta_ids)).order_by(DetalleVentaModel.id),
    ).scalars().all()
    por_venta: dict[int, list[ItemMovimientoTienda]] = {}
    for fila in filas:
        por_venta.setdefault(fila.venta_id, []).append(
            ItemMovimientoTienda(
                articulo=fila.nombre_producto,
                cantidad=fila.cantidad,
                precio_unitario=float(fila.precio_unitario),
                subtotal=float(fila.subtotal),
            ),
        )
    return por_venta


@router.get("/api/clientes/tienda/{cliente_id}/movimientos", response_model=MovimientoTiendaPageResponse)
def list_cliente_tienda_movimientos(
    cliente_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> MovimientoTiendaPageResponse:
    """Historial del cliente: cada venta fiada (con sus productos) y cada abono, del mas reciente al mas antiguo."""
    cliente = db.get(ClienteFiadoTiendaModel, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ventas = db.execute(select(VentaModel).where(VentaModel.cliente_tienda_id == cliente_id)).scalars().all()
    abonos = db.execute(select(AbonoTiendaModel).where(AbonoTiendaModel.cliente_id == cliente_id)).scalars().all()
    eventos = sorted([*ventas, *abonos], key=lambda e: e.fecha, reverse=True)

    total = len(eventos)
    total_pages = max(1, (total + limit - 1) // limit)
    pagina = eventos[(page - 1) * limit : page * limit]
    items = _items_de_ventas(db, [e.id for e in pagina if isinstance(e, VentaModel)])

    movimientos = []
    for evento in pagina:
        if isinstance(evento, VentaModel):
            movimientos.append(MovimientoTiendaResponse(
                id=evento.id,
                tipo="Venta",
                fecha=evento.fecha,
                monto=float(evento.total),
                por_pagar=min(float(evento.saldo_pendiente), float(evento.total)),
                metodo_pago=evento.metodo_pago,
                items=items.get(evento.id, []),
                anulado=bool(evento.anulada),
                motivo_anulacion=evento.motivo_anulacion,
                anulado_por=evento.anulada_por,
            ))
        else:
            movimientos.append(MovimientoTiendaResponse(
                id=evento.id,
                tipo="Abono",
                fecha=evento.fecha,
                monto=float(evento.monto),
                metodo_pago=evento.metodo_pago,
                referencia=evento.referencia,
                saldo=float(evento.saldo_cliente),
                anulado=bool(evento.anulado),
                motivo_anulacion=evento.motivo_anulacion,
                anulado_por=evento.anulado_por,
            ))

    return MovimientoTiendaPageResponse(data=movimientos, total_pages=total_pages, current_page=page)


@router.post("/api/clientes/tienda/{cliente_id}/abonos", response_model=AbonoTiendaResponse, status_code=201)
def create_abono_tienda(
    cliente_id: int,
    payload: AbonoTiendaCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> AbonoTiendaResponse:
    with db.begin():
        # Un abono es dinero que entra: sin turno abierto no quedaria en ningun cuadre de caja.
        exigir_caja_abierta(db, "registrar abonos")
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

        deuda_antes = float(cliente.deuda_total)
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
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="clientes_tienda",
            entidad="abono_tienda",
            accion="abono",
            entidad_id=abono.id,
            detalle=f"{cliente.nombre}: {monto} por {abono.metodo_pago}. Deuda {deuda_antes} -> {cliente.deuda_total}",
        )

    db.refresh(abono)
    return _respuesta_abono(abono, cliente)


@router.post("/api/clientes/tienda/abonos/{abono_id}/anular", response_model=AbonoTiendaResponse)
@limiter.limit(login_rate_limit())
def anular_abono(
    request: Request,
    abono_id: int,
    payload: AnularRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin", "admin", "vendedor")),
) -> AbonoTiendaResponse:
    """Anula un abono del turno abierto: la deuda vuelve a subir y queda el registro con motivo y autorizacion."""
    with db.begin():
        autorizado_por = quien_autoriza(db, current_user, payload.autorizador_usuario, payload.autorizador_password)
        abono = anular_abono_tienda(
            db,
            abono_id,
            solicitante=current_user.username,
            autorizado_por=autorizado_por,
            motivo=payload.motivo.strip(),
        )
        db.flush()
        cliente = db.get(ClienteFiadoTiendaModel, abono.cliente_id)
        return _respuesta_abono(abono, cliente)
