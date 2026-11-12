"""Router de ventas e historial de cartera."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo
from src.api.routers.cartera_shared import normalize_naive_datetime
from src.api.schemas.cartera import (
    AnularVentaCarteraRequest,
    CarteraVentaCreateRequest,
    CarteraVentaHistorialItemResponse,
    VentaDetalleResponse,
    VentaResponse,
)
from src.api.services.anulacion import devolver_stock_de_venta
from src.api.services.auditoria import registrar_auditoria
from src.api.services.stock import mover_stock
from src.api.services.venta_reglas import (
    exigir_cliente_activo,
    exigir_metodo_pago_si_hay_cobro,
    exigir_producto_vendible,
)
from src.application.services.ventas_service import build_recibo_text
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    ClienteModel,
    DetalleVentaModel,
    ProductoModel,
    VentaModel,
)

router = APIRouter(tags=["clientes-cartera-ventas"])

FIADO_ORIGEN_CARTERA = "cartera"
CATALOGO_CARTERA = "cartera"
TOLERANCIA_FECHA = timedelta(minutes=5)  # relojes del navegador y del servidor no coinciden al segundo


def _fecha_de_venta(valor: datetime | None) -> datetime:
    """La venta puede registrarse con fecha pasada (cuaderno), nunca futura: falsearia la antiguedad de la deuda."""
    ahora = datetime.now(UTC).replace(tzinfo=None)
    fecha = normalize_naive_datetime(valor) or ahora
    if fecha > ahora + TOLERANCIA_FECHA:
        raise HTTPException(status_code=400, detail="La fecha de la venta no puede ser futura")
    return fecha


@router.post("/api/cartera/ventas", response_model=VentaResponse, status_code=201)
def create_cartera_venta(
    payload: CarteraVentaCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> VentaResponse:
    total = 0.0
    detalle_payload: list[VentaDetalleResponse] = []
    movimientos_stock = []

    try:
        with db.begin():
            cliente = db.execute(
                select(ClienteModel)
                .where(ClienteModel.id == payload.cliente_id)
                .with_for_update(),
            ).scalar_one_or_none()

            if cliente is None:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")
            exigir_cliente_activo(cliente)
            fecha_venta = _fecha_de_venta(payload.fecha_venta)

            for item in payload.items:
                producto = db.execute(
                    select(ProductoModel)
                    .where(ProductoModel.id == item.producto_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if producto is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Producto {item.producto_id} no encontrado",
                    )
                exigir_producto_vendible(producto)
                if producto.catalogo != CATALOGO_CARTERA:
                    raise HTTPException(
                        status_code=400,
                        detail=f"'{producto.nombre}' no es un producto de cartera",
                    )

                if producto.stock_actual < item.cantidad:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Stock insuficiente para '{producto.nombre}'. "
                            f"Disponible: {producto.stock_actual}"
                        ),
                    )

                movimientos_stock.append(
                    mover_stock(db, producto, -item.cantidad, tipo="venta_cartera", usuario=current_user.username, referencia_tipo="venta"),
                )
                subtotal = round(float(item.cantidad * producto.precio_venta), 2)
                total = round(total + subtotal, 2)

                detalle_payload.append(
                    VentaDetalleResponse(
                        producto_id=producto.id,
                        nombre_producto=producto.nombre,
                        cantidad=item.cantidad,
                        precio_unitario=producto.precio_venta,
                        subtotal=subtotal,
                    ),
                )

            abono_inicial = round(float(payload.abono_inicial), 2)
            if abono_inicial > total:
                raise HTTPException(
                    status_code=400,
                    detail="El abono inicial no puede superar el total de la venta",
                )
            exigir_metodo_pago_si_hay_cobro(payload.metodo_pago, abono_inicial > 0)

            deuda_incremento = round(total - abono_inicial, 2)
            cliente.deuda_total = round(float(cliente.deuda_total) + deuda_incremento, 2)

            venta = VentaModel(
                creado_por=current_user.username,
                cliente_id=cliente.id,
                cliente_tienda_id=None,
                tipo_fiado=FIADO_ORIGEN_CARTERA if deuda_incremento > 0 else None,
                metodo_pago=payload.metodo_pago,
                es_fiado=deuda_incremento > 0,
                total=total,
                saldo_pendiente=cliente.deuda_total,
                fecha=fecha_venta,
                fuera_de_caja=True,
            )
            db.add(venta)
            db.flush()
            for movimiento in movimientos_stock:
                movimiento.referencia_id = venta.id

            for detalle in detalle_payload:
                db.add(
                    DetalleVentaModel(
                        venta_id=venta.id,
                        producto_id=detalle.producto_id,
                        nombre_producto=detalle.nombre_producto,
                        cantidad=detalle.cantidad,
                        precio_unitario=detalle.precio_unitario,
                        subtotal=detalle.subtotal,
                    ),
                )

            if abono_inicial > 0:
                db.add(
                    AbonoCarteraModel(
                        cliente_id=cliente.id,
                        monto=abono_inicial,
                        metodo_pago=payload.metodo_pago,
                        saldo_cliente=cliente.deuda_total,
                        referencia=payload.referencia or f"Abono aplicado en venta #{venta.id}",
                        fecha=fecha_venta,
                        fuera_de_caja=True,
                        venta_id=venta.id,
                    ),
                )

            registrar_auditoria(
                db,
                usuario=current_user.username,
                modulo="cartera",
                entidad="venta",
                accion="crear",
                entidad_id=venta.id,
                detalle=f"{cliente.nombre}: total {total}, abono inicial {abono_inicial}, queda debiendo {cliente.deuda_total}",
            )

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No fue posible registrar la venta de cartera por conflicto de datos",
        ) from exc

    resumen = build_recibo_text(
        venta_id=venta.id,
        detalles=detalle_payload,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        cliente_nombre=cliente.nombre,
    )

    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_tienda_id=None,
        cliente_nombre=cliente.nombre,
        es_fiado=venta.es_fiado,
        fiado_origen=venta.tipo_fiado,
        metodo_pago=venta.metodo_pago,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        fecha=venta.fecha,
        detalles=detalle_payload,
        resumen_recibo=resumen,
    )


def _abonos_iniciales(db: Session, venta: VentaModel) -> list[AbonoCarteraModel]:
    """Abono(s) que salieron de esta venta. Las ventas viejas no tienen enlace: se reconocen por cliente y fecha exacta."""
    enlazados = db.execute(select(AbonoCarteraModel).where(AbonoCarteraModel.venta_id == venta.id, AbonoCarteraModel.anulado.is_(False))).scalars().all()
    if enlazados:
        return list(enlazados)
    return list(
        db.execute(
            select(AbonoCarteraModel).where(
                AbonoCarteraModel.cliente_id == venta.cliente_id,
                AbonoCarteraModel.venta_id.is_(None),
                AbonoCarteraModel.anulado.is_(False),
                AbonoCarteraModel.fecha == venta.fecha,
            ),
        ).scalars(),
    )


@router.post("/api/cartera/ventas/{venta_id}/anular", status_code=200)
def anular_venta_cartera(
    venta_id: int,
    payload: AnularVentaCarteraRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> dict:
    """Anula la venta: devuelve el stock y le quita al cliente la deuda que dejo. No borra la venta.

    Si el cliente ya abono por encima de lo que debe de otras ventas, la deuda no alcanza para devolverla:
    primero se corrige ese abono.
    """
    venta = db.execute(select(VentaModel).where(VentaModel.id == venta_id).with_for_update()).scalar_one_or_none()
    if venta is None or venta.cliente_id is None:
        raise HTTPException(status_code=404, detail="Venta de cartera no encontrada")
    if venta.anulada:
        raise HTTPException(status_code=409, detail="La venta ya esta anulada")
    if not venta.fuera_de_caja:
        raise HTTPException(
            status_code=409,
            detail="Esta venta se registro en el punto de venta (caja del vendedor): se corrige desde ese modulo",
        )

    cliente = db.execute(select(ClienteModel).where(ClienteModel.id == venta.cliente_id).with_for_update()).scalar_one()
    abonos = _abonos_iniciales(db, venta)
    abono_inicial = round(sum(float(a.monto) for a in abonos), 2)
    deuda_de_la_venta = round(max(0.0, float(venta.total) - abono_inicial), 2)
    deuda_actual = float(cliente.deuda_total)
    if deuda_actual + 0.005 < deuda_de_la_venta:
        raise HTTPException(
            status_code=409,
            detail=(
                f"El cliente ya abono: debe {deuda_actual:.0f} y esta venta dejo {deuda_de_la_venta:.0f}. "
                "Corrige o elimina primero el abono que se aplico a ella."
            ),
        )

    cliente.deuda_total = round(deuda_actual - deuda_de_la_venta, 2)
    for abono in abonos:
        db.delete(abono)
    devolver_stock_de_venta(db, venta.id, current_user.username)

    venta.anulada = True
    venta.anulada_en = datetime.now(UTC).replace(tzinfo=None)
    venta.anulada_por = current_user.username
    venta.autorizada_por = current_user.username
    venta.motivo_anulacion = payload.motivo.strip()
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="cartera",
        entidad="venta",
        accion="anular",
        entidad_id=venta.id,
        detalle=(
            f"{cliente.nombre}: total {venta.total}, abono inicial devuelto {abono_inicial}, "
            f"deuda {deuda_actual} -> {cliente.deuda_total}. Motivo: {venta.motivo_anulacion}"
        ),
    )
    db.commit()
    return {"message": "Venta anulada", "venta_id": venta.id, "deuda_cliente": float(cliente.deuda_total)}


class LineaVentaCartera(BaseModel):
    nombre_producto: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class VentaCarteraItem(BaseModel):
    venta_id: int
    cliente_id: int
    cliente_nombre: str
    fecha: datetime
    total: float
    es_fiado: bool
    metodo_pago: str | None = None
    abono_inicial: float | None = None  # None en ventas viejas que no se pueden enlazar con su abono
    saldo_cliente: float  # deuda total del cliente justo despues de esta venta
    anulada: bool = False
    motivo_anulacion: str | None = None
    anulada_por: str | None = None
    creado_por: str | None = None
    anulable: bool = False
    lineas: list[LineaVentaCartera]


class VentasCarteraPageResponse(BaseModel):
    data: list[VentaCarteraItem]
    page: PageInfo


FiltroVentas = Literal["todas", "fiado", "contado", "anuladas"]


@router.get("/api/cartera/ventas/paginadas", response_model=VentasCarteraPageResponse)
def list_cartera_ventas_paginadas(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    q: str | None = Query(default=None, max_length=100, description="Nombre del cliente o numero de venta (#12)"),
    estado: FiltroVentas = Query(default="todas"),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> VentasCarteraPageResponse:
    """Historial de ventas de cartera con busqueda, filtros, fechas y lineas de cada venta."""
    query = (
        select(VentaModel, ClienteModel.nombre)
        .join(ClienteModel, ClienteModel.id == VentaModel.cliente_id)
        .where(VentaModel.cliente_id.is_not(None))
    )
    if estado == "anuladas":
        query = query.where(VentaModel.anulada.is_(True))
    elif estado == "fiado":
        query = query.where(VentaModel.anulada.is_(False), VentaModel.es_fiado.is_(True))
    elif estado == "contado":
        query = query.where(VentaModel.anulada.is_(False), VentaModel.es_fiado.is_(False))
    if desde is not None:
        query = query.where(VentaModel.fecha >= datetime.combine(desde, time.min))
    if hasta is not None:
        query = query.where(VentaModel.fecha < datetime.combine(hasta + timedelta(days=1), time.min))
    termino = " ".join((q or "").split())
    if termino:
        numero = termino.lstrip("#")
        condicion = ClienteModel.nombre.ilike(f"%{termino}%")
        if numero.isdigit():
            condicion = condicion | (VentaModel.id == int(numero))
        query = query.where(condicion)

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    filas = db.execute(query.order_by(VentaModel.fecha.desc(), VentaModel.id.desc()).offset((page - 1) * limit).limit(limit)).all()
    ids = [venta.id for venta, _ in filas]

    lineas: dict[int, list[LineaVentaCartera]] = {}
    abonos: dict[int, float] = {}
    if ids:
        for d in db.execute(select(DetalleVentaModel).where(DetalleVentaModel.venta_id.in_(ids)).order_by(DetalleVentaModel.id)).scalars():
            lineas.setdefault(d.venta_id, []).append(
                LineaVentaCartera(nombre_producto=d.nombre_producto, cantidad=d.cantidad, precio_unitario=float(d.precio_unitario), subtotal=float(d.subtotal)),
            )
        for venta_id, monto in db.execute(
            select(AbonoCarteraModel.venta_id, func.sum(AbonoCarteraModel.monto)).where(AbonoCarteraModel.venta_id.in_(ids)).group_by(AbonoCarteraModel.venta_id),
        ).all():
            abonos[int(venta_id)] = float(monto or 0)

    def _abono(venta: VentaModel) -> float | None:
        if venta.id in abonos:
            return abonos[venta.id]
        # Con enlace o sin abono: una venta nueva a credito sin abono inicial es 0; las viejas no se pueden saber.
        return 0.0 if venta.creado_por is not None and venta.fuera_de_caja else None

    return VentasCarteraPageResponse(
        data=[
            VentaCarteraItem(
                venta_id=v.id,
                cliente_id=v.cliente_id,
                cliente_nombre=nombre,
                fecha=v.fecha,
                total=float(v.total),
                es_fiado=bool(v.es_fiado),
                metodo_pago=v.metodo_pago,
                abono_inicial=_abono(v),
                saldo_cliente=float(v.saldo_pendiente),
                anulada=bool(v.anulada),
                motivo_anulacion=v.motivo_anulacion,
                anulada_por=v.anulada_por,
                creado_por=v.creado_por,
                anulable=bool(v.fuera_de_caja and not v.anulada),
                lineas=lineas.get(v.id, []),
            )
            for v, nombre in filas
        ],
        page=PageInfo(total=total, total_pages=max(1, (total + limit - 1) // limit), current_page=page, limit=limit),
    )


@router.get(
    "/api/cartera/ventas/historial",
    response_model=list[CarteraVentaHistorialItemResponse],
)
def list_cartera_ventas_historial(
    limit: int = Query(default=60, ge=1, le=500),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> list[CarteraVentaHistorialItemResponse]:
    ventas = db.execute(
        select(VentaModel, ClienteModel.nombre)
        .join(ClienteModel, ClienteModel.id == VentaModel.cliente_id)
        .where(VentaModel.cliente_id.is_not(None))
        .order_by(VentaModel.fecha.desc())
        .limit(limit),
    ).all()

    if not ventas:
        return []

    venta_ids = [venta.id for venta, _ in ventas]
    detalles_rows = db.execute(
        select(
            DetalleVentaModel.venta_id,
            DetalleVentaModel.nombre_producto,
            DetalleVentaModel.cantidad,
        )
        .where(DetalleVentaModel.venta_id.in_(venta_ids))
        .order_by(DetalleVentaModel.venta_id.asc(), DetalleVentaModel.id.asc()),
    ).all()

    detalles_por_venta: dict[int, list[tuple[str, int]]] = {}
    for venta_id, nombre_producto, cantidad in detalles_rows:
        detalles_por_venta.setdefault(int(venta_id), []).append((str(nombre_producto), int(cantidad or 0)))

    historial: list[CarteraVentaHistorialItemResponse] = []
    for venta, cliente_nombre in ventas:
        detalles = detalles_por_venta.get(venta.id, [])
        articulos = sum(cantidad for _, cantidad in detalles)
        articulos_detalle = ', '.join(f"{nombre} x{cantidad}" for nombre, cantidad in detalles)

        historial.append(
            CarteraVentaHistorialItemResponse(
                venta_id=venta.id,
                cliente_id=venta.cliente_id or 0,
                cliente_nombre=cliente_nombre,
                total=venta.total,
                saldo_cliente=venta.saldo_pendiente,
                metodo_pago=venta.metodo_pago,
                articulos=articulos,
                articulos_detalle=articulos_detalle or '-',
                fecha=venta.fecha,
                es_fiado=bool(venta.es_fiado),
                anulada=bool(venta.anulada),
                motivo_anulacion=venta.motivo_anulacion,
                creado_por=venta.creado_por,
            ),
        )

    return historial
