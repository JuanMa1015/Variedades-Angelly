"""Router de ventas y fidelizacion."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.schemas.anulacion import AnularRequest as AnularVentaRequest
from src.api.schemas.cartera import (
    DevolucionLineaResponse,
    DevolucionResponse,
    MetodoPago,
    VentaDetalleResponse,
    VentaItemCreateRequest,
    VentaResponse,
)
from src.api.limiter import limiter, login_rate_limit
from src.api.services.anulacion import anular_venta, quien_autoriza
from src.api.services.auditoria import registrar_auditoria
from src.api.services.fidelizacion import acumular_puntos, canjear_puntos, revertir_puntos_de_venta
from src.api.services.stock import mover_stock
from src.api.services.deuda import SIN_DEUDA, deuda_pendiente_tienda, mover_deuda_tienda
from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.services.venta_reglas import (
    exigir_caja_abierta,
    exigir_cliente_activo,
    exigir_credito_disponible,
    exigir_metodo_pago_si_hay_cobro,
    exigir_producto_vendible,
)
from src.api.pagination import PageInfo, build_page
from src.application.services.ventas_service import (
    build_recibo_text,
)
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    ClienteFiadoTiendaModel,
    ClienteModel,
    DetalleVentaModel,
    DevolucionVentaDetalleModel,
    DevolucionVentaModel,
    ProductoModel,
    VentaModel,
)

router = APIRouter(tags=["ventas-fidelizacion"])

FIADO_ORIGEN_CARTERA = "cartera"
FIADO_ORIGEN_TIENDA = "tienda"


class DescuentoManualRequest(BaseModel):
    """Descuento que el vendedor aplica al total: en porcentaje o en pesos, siempre con motivo."""

    tipo: Literal["porcentaje", "monto"]
    valor: Annotated[float, Field(gt=0)]
    motivo: Annotated[str, Field(min_length=3, max_length=200)]


class VentaCreateRequest(BaseModel):
    """DTO de entrada para registrar ventas."""

    cliente_id: Annotated[int | None, Field(gt=0)] = None
    cliente_tienda_id: Annotated[int | None, Field(gt=0)] = None
    cliente_fidelizacion_id: Annotated[int | None, Field(gt=0)] = None
    items: Annotated[list[VentaItemCreateRequest], Field(min_length=1)]
    es_fiado: bool = False
    fiado_origen: str | None = None
    abono_inicial: Annotated[float, Field(ge=0)] = 0
    metodo_pago: MetodoPago | None = None
    monto_recibido: Annotated[float | None, Field(ge=0)] = None
    puntos_a_canjear: Annotated[int, Field(ge=0)] = 0
    # Clave del cobro (la genera el navegador): si el servidor ya registro esa venta, devuelve la misma en vez de otra.
    clave_idempotencia: Annotated[str | None, Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")] = None
    descuento_manual: DescuentoManualRequest | None = None
    # Solo cuando el descuento pasa el limite del vendedor: la clave de un administrador.
    autorizador_usuario: Annotated[str | None, Field(max_length=50)] = None
    autorizador_password: Annotated[str | None, Field(max_length=128)] = None


class VentaUpdateRequest(BaseModel):
    """Entrada administrativa para editar una venta existente."""

    cliente_id: Annotated[int | None, Field(gt=0)] = None
    cliente_tienda_id: Annotated[int | None, Field(gt=0)] = None
    es_fiado: bool | None = None
    fiado_origen: str | None = None
    total: Annotated[float | None, Field(ge=0)] = None
    saldo_pendiente: Annotated[float | None, Field(ge=0)] = None


class VentaPageResponse(BaseModel):
    """Respuesta paginada de ventas."""

    data: list[VentaResponse]
    page: PageInfo


def _to_detalle_response(detalle: DetalleVentaModel) -> VentaDetalleResponse:
    return VentaDetalleResponse(
        producto_id=detalle.producto_id,
        nombre_producto=detalle.nombre_producto,
        cantidad=detalle.cantidad,
        precio_unitario=detalle.precio_unitario,
        subtotal=detalle.subtotal,
        cantidad_devuelta=int(detalle.cantidad_devuelta or 0),
    )


def _aplicar_canje(db: Session, payload: VentaCreateRequest, total: float, usuario: str, movimientos_puntos: list) -> float:
    """Descuento en pesos por los puntos que el cliente usa en esta venta (0 si no canjea)."""
    if payload.puntos_a_canjear <= 0:
        return 0.0
    if payload.cliente_fidelizacion_id is None:
        raise HTTPException(status_code=400, detail="Para usar puntos debes elegir el cliente de fidelizacion")
    descuento = canjear_puntos(db, payload.cliente_fidelizacion_id, payload.puntos_a_canjear, usuario=usuario, movimientos=movimientos_puntos)
    if descuento > total:
        raise HTTPException(status_code=400, detail="El descuento por puntos supera el total de la venta")
    return descuento


DESCUENTO_MAX_POR_DEFECTO = 5.0


def descuento_max_sin_autorizacion() -> float:
    """Porcentaje de descuento que el vendedor aplica solo (``DESCUENTO_MAX_SIN_AUTORIZACION_PCT``, 5 por defecto)."""
    crudo = os.getenv("DESCUENTO_MAX_SIN_AUTORIZACION_PCT", "").strip()
    try:
        valor = float(crudo) if crudo else DESCUENTO_MAX_POR_DEFECTO
    except ValueError:
        valor = DESCUENTO_MAX_POR_DEFECTO
    return max(0.0, min(100.0, valor))


def _aplicar_descuento_manual(
    db: Session, payload: VentaCreateRequest, *, subtotal: float, costo: float, solicitante: AuthenticatedUser,
) -> tuple[float, str | None]:
    """Pesos de descuento manual y quien lo autorizo (solo si pasa el limite del vendedor)."""
    descuento = payload.descuento_manual
    if descuento is None:
        return 0.0, None
    monto = round(subtotal * descuento.valor / 100, 2) if descuento.tipo == "porcentaje" else round(descuento.valor, 2)
    if monto <= 0 or monto >= subtotal:
        raise HTTPException(status_code=400, detail="El descuento debe ser mayor que cero y menor que el total de la venta")
    if round(subtotal - monto, 2) < round(costo, 2):
        raise HTTPException(status_code=400, detail="El descuento deja la venta por debajo del costo de los productos")
    limite = descuento_max_sin_autorizacion()
    if monto / subtotal * 100 > limite + 1e-9:
        autorizado = quien_autoriza(
            db, solicitante, payload.autorizador_usuario, payload.autorizador_password,
            accion=f"Un descuento de mas de {limite:g} %",
        )
        return monto, autorizado
    return monto, None


def _huella(payload: VentaCreateRequest) -> str:
    """Resumen del contenido de la venta (sin la clave): la misma clave con otro contenido no es un reintento."""
    contenido = payload.model_dump(exclude={"clave_idempotencia", "autorizador_usuario", "autorizador_password"}, mode="json")
    contenido["items"] = sorted(contenido["items"], key=lambda item: (item["producto_id"], item["cantidad"]))
    return hashlib.sha256(json.dumps(contenido, sort_keys=True).encode("utf-8")).hexdigest()


def _venta_de_la_clave(db: Session, usuario: str, clave: str) -> VentaModel | None:
    return db.execute(
        select(VentaModel).where(VentaModel.creado_por == usuario, VentaModel.clave_idempotencia == clave),
    ).scalar_one_or_none()


def _repetir_cobro(venta: VentaModel, huella: str, db: Session, response: Response) -> VentaResponse:
    """El cobro ya estaba registrado: se devuelve esa misma venta (200) en lugar de crear otra."""
    if venta.huella_idempotencia and venta.huella_idempotencia != huella:
        raise HTTPException(status_code=409, detail="Esa clave de cobro ya se uso para una venta distinta")
    response.status_code = 200
    response.headers["Idempotent-Replay"] = "true"
    return _build_venta_responses([venta], db)[0]


def _respuesta_venta(
    venta: VentaModel,
    detalles: list[VentaDetalleResponse],
    cliente_nombre: str | None,
    devoluciones: list[DevolucionResponse] | None = None,
) -> VentaResponse:
    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_tienda_id=venta.cliente_tienda_id,
        cliente_nombre=cliente_nombre,
        es_fiado=venta.es_fiado,
        fiado_origen=venta.tipo_fiado,
        metodo_pago=venta.metodo_pago,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        fecha=venta.fecha,
        detalles=detalles,
        resumen_recibo=build_recibo_text(
            venta_id=venta.id,
            detalles=detalles,
            total=venta.total,
            saldo_pendiente=venta.saldo_pendiente,
            cliente_nombre=cliente_nombre,
        ),
        puntos_otorgados=venta.puntos_otorgados,
        puntos_canjeados=int(venta.puntos_canjeados or 0),
        descuento_puntos=float(venta.descuento_puntos or 0.0),
        monto_recibido=venta.monto_recibido,
        anulada=bool(venta.anulada),
        anulada_en=venta.anulada_en,
        anulada_por=venta.anulada_por,
        autorizada_por=venta.autorizada_por,
        motivo_anulacion=venta.motivo_anulacion,
        vendedor=venta.creado_por,
        total_devuelto=float(venta.total_devuelto or 0),
        devoluciones=devoluciones or [],
        descuento_manual=float(venta.descuento_manual or 0),
        descuento_manual_motivo=venta.descuento_manual_motivo,
        descuento_autorizado_por=venta.descuento_autorizado_por,
    )


@router.post("/api/ventas", response_model=VentaResponse, status_code=201)
def create_venta(
    payload: VentaCreateRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> VentaResponse:
    total = 0.0
    costo_total = 0.0
    detalle_payload: list[VentaDetalleResponse] = []
    movimientos_stock = []
    movimientos_puntos = []
    cliente: ClienteModel | None = None
    cliente_tienda: ClienteFiadoTiendaModel | None = None
    cliente_nombre: str | None = None
    saldo_pendiente = 0.0
    fiado_origen: str | None = None
    abono_inicial = float(payload.abono_inicial or 0)

    if payload.es_fiado:
        fiado_origen = str(payload.fiado_origen or "").lower().strip()
        if fiado_origen not in {FIADO_ORIGEN_CARTERA, FIADO_ORIGEN_TIENDA}:
            raise HTTPException(
                status_code=400,
                detail="Debes indicar fiado_origen: cartera o tienda",
            )
    else:
        fiado_origen = None

    exigir_metodo_pago_si_hay_cobro(
        payload.metodo_pago,
        hay_cobro=(not payload.es_fiado) or abono_inicial > 0,
    )

    clave = payload.clave_idempotencia
    huella = _huella(payload) if clave else None

    try:
        with db.begin():
            if clave:
                previa = _venta_de_la_clave(db, current_user.username, clave)
                if previa is not None:
                    return _repetir_cobro(previa, huella, db, response)
            exigir_caja_abierta(db)
            if payload.es_fiado and fiado_origen == FIADO_ORIGEN_CARTERA:
                if current_user.role not in {"admin", "superadmin"}:
                    raise HTTPException(
                        status_code=403,
                        detail="Solo admin puede registrar fiados de cartera",
                    )

                if payload.cliente_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Debes seleccionar un cliente de cartera para fiado",
                    )

                cliente = db.execute(
                    select(ClienteModel)
                    .where(ClienteModel.id == payload.cliente_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if cliente is None:
                    raise HTTPException(status_code=404, detail="Cliente no encontrado")

                exigir_cliente_activo(cliente)
                cliente_nombre = cliente.nombre

            if payload.es_fiado and fiado_origen == FIADO_ORIGEN_TIENDA:
                if payload.cliente_tienda_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Debes seleccionar un cliente fiado de tienda",
                    )

                cliente_tienda = db.execute(
                    select(ClienteFiadoTiendaModel)
                    .where(ClienteFiadoTiendaModel.id == payload.cliente_tienda_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if cliente_tienda is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Cliente fiado de tienda no encontrado",
                    )

                exigir_cliente_activo(cliente_tienda)
                cliente_nombre = cliente_tienda.nombre

            # Lineas repetidas se juntan y los productos se bloquean siempre en el mismo orden (por id): dos ventas
            # a la vez con los mismos productos en distinto orden no se bloquean entre si.
            cantidades: dict[int, int] = {}
            for item in payload.items:
                cantidades[item.producto_id] = cantidades.get(item.producto_id, 0) + item.cantidad
            for producto_id, cantidad in sorted(cantidades.items()):
                producto = db.execute(
                    select(ProductoModel)
                    .where(ProductoModel.id == producto_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if producto is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Producto {producto_id} no encontrado",
                    )

                exigir_producto_vendible(producto)
                if producto.catalogo != "tienda":
                    raise HTTPException(status_code=400, detail=f"'{producto.nombre}' no es un producto de la tienda")

                if producto.stock_actual < cantidad:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Stock insuficiente para '{producto.nombre}'. "
                            f"Disponible: {producto.stock_actual}"
                        ),
                    )

                movimientos_stock.append(
                    mover_stock(db, producto, -cantidad, tipo="venta", usuario=current_user.username, referencia_tipo="venta"),
                )
                subtotal = float(cantidad * producto.precio_venta)
                total += subtotal
                costo_total += float(cantidad * producto.precio_costo)

                detalle_payload.append(
                    VentaDetalleResponse(
                        producto_id=producto.id,
                        nombre_producto=producto.nombre,
                        cantidad=cantidad,
                        precio_unitario=producto.precio_venta,
                        subtotal=subtotal,
                    ),
                )

            descuento_manual, descuento_autorizado_por = _aplicar_descuento_manual(
                db, payload, subtotal=total, costo=costo_total, solicitante=current_user,
            )
            total = round(total - descuento_manual, 2)

            descuento = _aplicar_canje(db, payload, total, current_user.username, movimientos_puntos)
            total = total - descuento

            cobrado_ahora = abono_inicial if payload.es_fiado else total
            if (
                payload.metodo_pago == "efectivo"
                and payload.monto_recibido is not None
                and round(float(payload.monto_recibido), 2) < round(float(cobrado_ahora), 2)
            ):
                raise HTTPException(status_code=400, detail="El dinero recibido no cubre lo que se cobra")

            if payload.es_fiado:
                if abono_inicial > total:
                    raise HTTPException(
                        status_code=400,
                        detail="El abono inicial no puede superar el total de la venta",
                    )

                if fiado_origen == FIADO_ORIGEN_CARTERA:
                    if cliente is None:
                        raise HTTPException(
                            status_code=400,
                            detail="Debes seleccionar un cliente de cartera",
                        )

                    nueva_deuda = float(cliente.deuda_total + (total - abono_inicial))
                    exigir_credito_disponible(cliente, nueva_deuda)
                    cliente.deuda_total = nueva_deuda
                    saldo_pendiente = nueva_deuda
                elif fiado_origen == FIADO_ORIGEN_TIENDA:
                    if cliente_tienda is None:
                        raise HTTPException(
                            status_code=400,
                            detail="Debes seleccionar un cliente de tienda",
                        )

                    nueva_deuda = float(cliente_tienda.deuda_total + (total - abono_inicial))
                    exigir_credito_disponible(cliente_tienda, nueva_deuda)
                    cliente_tienda.deuda_total = nueva_deuda
                    # Saldo de ESTA venta (no la deuda total del cliente): permite revertirla y calcular caja.
                    saldo_pendiente = float(total - abono_inicial)

            venta = VentaModel(
                creado_por=current_user.username,
                clave_idempotencia=clave,
                huella_idempotencia=huella,
                cliente_id=cliente.id if cliente is not None else None,
                cliente_tienda_id=cliente_tienda.id if cliente_tienda is not None else None,
                tipo_fiado=fiado_origen,
                metodo_pago=payload.metodo_pago if (not payload.es_fiado or abono_inicial > 0) else None,
                es_fiado=payload.es_fiado,
                total=total,
                saldo_pendiente=saldo_pendiente,
                monto_recibido=payload.monto_recibido,
                puntos_canjeados=payload.puntos_a_canjear if descuento else 0,
                descuento_puntos=descuento,
                descuento_manual=descuento_manual,
                descuento_manual_motivo=payload.descuento_manual.motivo.strip() if descuento_manual else None,
                descuento_autorizado_por=descuento_autorizado_por,
            )
            if payload.cliente_fidelizacion_id is not None:
                # Los puntos salen del dinero realmente cobrado (un fiado solo cuenta su abono).
                cobrado = abono_inicial if payload.es_fiado else float(total)
                venta.cliente_fidelizacion_id = payload.cliente_fidelizacion_id
                venta.puntos_otorgados = acumular_puntos(
                    db, payload.cliente_fidelizacion_id, cobrado, usuario=current_user.username, movimientos=movimientos_puntos,
                )

            db.add(venta)
            db.flush()
            if descuento_manual:
                registrar_auditoria(
                    db,
                    usuario=current_user.username,
                    modulo="ventas",
                    entidad="venta",
                    accion="descuento_manual",
                    entidad_id=venta.id,
                    detalle=(
                        f"Venta #{venta.id}: descuento {descuento_manual} sobre {round(total + descuento_manual + descuento, 2)}. "
                        f"Motivo: {payload.descuento_manual.motivo.strip()}."
                        f"{f' Autorizo: {descuento_autorizado_por}.' if descuento_autorizado_por else ''}"
                    ),
                )
            for movimiento in movimientos_stock:
                movimiento.referencia_id = venta.id
            for movimiento in movimientos_puntos:
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

            if cliente is not None and abono_inicial > 0:
                # Igual que la venta de cartera del modulo de cartera: el abono inicial es un cobro.
                db.add(
                    AbonoCarteraModel(
                        cliente_id=cliente.id,
                        monto=abono_inicial,
                        metodo_pago=payload.metodo_pago,
                        saldo_cliente=cliente.deuda_total,
                        referencia=f"Abono aplicado en venta #{venta.id}",
                    ),
                )

    except IntegrityError as exc:
        db.rollback()
        if clave:
            # Dos envios del mismo cobro a la vez: el segundo choca con la clave unica y recibe la venta del primero.
            ganadora = _venta_de_la_clave(db, current_user.username, clave)
            if ganadora is not None:
                return _repetir_cobro(ganadora, huella, db, response)
        raise HTTPException(
            status_code=409,
            detail="No fue posible registrar la venta por conflicto de datos",
        ) from exc

    return _respuesta_venta(venta, detalle_payload, cliente_nombre)


def _solo_las_del_rol(query, usuario: AuthenticatedUser):
    """El vendedor ve las ventas de la tienda; el admin, las del modulo de cartera; el superadmin, todas."""
    rol = str(usuario.role).lower().strip()
    if rol == "vendedor":
        return query.where(VentaModel.fuera_de_caja.is_(False))
    if rol == "admin":
        return query.where(VentaModel.fuera_de_caja.is_(True))
    return query


@router.get("/api/ventas", response_model=list[VentaResponse])
def list_ventas(
    db: Session = Depends(get_db),
    fecha_desde: datetime | None = Query(default=None),
    fecha_hasta: datetime | None = Query(default=None),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> list[VentaResponse]:
    query = _solo_las_del_rol(select(VentaModel), current_user)
    if fecha_desde:
        query = query.where(VentaModel.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.where(VentaModel.fecha <= fecha_hasta)
    ventas = db.execute(
        query.order_by(VentaModel.fecha.desc()),
    ).scalars().all()

    return _build_venta_responses(ventas, db)


@router.get("/api/ventas/paginadas", response_model=VentaPageResponse)
def list_ventas_paginadas(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    fecha_desde: datetime | None = Query(default=None),
    fecha_hasta: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> VentaPageResponse:
    """Lista paginada de ventas del rol: el vendedor ve las de la tienda y el admin las del modulo de cartera."""
    query = _solo_las_del_rol(select(VentaModel), current_user)
    if fecha_desde:
        query = query.where(VentaModel.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.where(VentaModel.fecha <= fecha_hasta)
    items, page_info = build_page(db, query, page, limit, VentaModel.fecha.desc())

    return VentaPageResponse(
        data=_build_venta_responses(list(items), db),
        page=page_info,
    )


def _devoluciones_de(db: Session, venta_ids: list[int]) -> dict[int, list[DevolucionResponse]]:
    """Devoluciones de las ventas pedidas (con sus lineas), de la mas antigua a la mas reciente."""
    if not venta_ids:
        return {}
    devoluciones = db.execute(
        select(DevolucionVentaModel).where(DevolucionVentaModel.venta_id.in_(venta_ids)).order_by(DevolucionVentaModel.id),
    ).scalars().all()
    if not devoluciones:
        return {}
    lineas = db.execute(
        select(DevolucionVentaDetalleModel)
        .where(DevolucionVentaDetalleModel.devolucion_id.in_([d.id for d in devoluciones]))
        .order_by(DevolucionVentaDetalleModel.id),
    ).scalars().all()
    lineas_por_devolucion: dict[int, list[DevolucionLineaResponse]] = {}
    for linea in lineas:
        lineas_por_devolucion.setdefault(linea.devolucion_id, []).append(
            DevolucionLineaResponse(
                producto_id=linea.producto_id, nombre_producto=linea.nombre_producto, cantidad=linea.cantidad, valor=float(linea.valor),
            ),
        )
    resultado: dict[int, list[DevolucionResponse]] = {}
    for d in devoluciones:
        resultado.setdefault(d.venta_id, []).append(
            DevolucionResponse(
                id=d.id, fecha=d.fecha, registrado_por=d.registrado_por, autorizado_por=d.autorizado_por, motivo=d.motivo,
                total_devuelto=float(d.total_devuelto), monto_reembolsado=float(d.monto_reembolsado),
                deuda_reducida=float(d.deuda_reducida), metodo_pago=d.metodo_pago, lineas=lineas_por_devolucion.get(d.id, []),
            ),
        )
    return resultado


def _build_venta_responses(
    ventas: list[VentaModel],
    db: Session,
) -> list[VentaResponse]:
    cliente_ids = {venta.cliente_id for venta in ventas if venta.cliente_id is not None}
    clientes_por_id: dict[int, str] = {}
    if cliente_ids:
        clientes = db.execute(
            select(ClienteModel).where(ClienteModel.id.in_(cliente_ids)),
        ).scalars().all()
        clientes_por_id = {cliente.id: cliente.nombre for cliente in clientes}

    clientes_tienda_ids = {
        venta.cliente_tienda_id
        for venta in ventas
        if venta.cliente_tienda_id is not None
    }
    clientes_tienda_por_id: dict[int, str] = {}
    if clientes_tienda_ids:
        clientes_tienda = db.execute(
            select(ClienteFiadoTiendaModel).where(
                ClienteFiadoTiendaModel.id.in_(clientes_tienda_ids),
            ),
        ).scalars().all()
        clientes_tienda_por_id = {
            cliente.id: cliente.nombre
            for cliente in clientes_tienda
        }

    venta_ids = [venta.id for venta in ventas]
    detalles_model = db.execute(
        select(DetalleVentaModel).where(DetalleVentaModel.venta_id.in_(venta_ids)),
    ).scalars().all()
    detalles_por_venta: dict[int, list[VentaDetalleResponse]] = {}
    for detalle in detalles_model:
        detalles_por_venta.setdefault(detalle.venta_id, []).append(
            _to_detalle_response(detalle),
        )

    devoluciones_por_venta = _devoluciones_de(db, venta_ids)

    payload: list[VentaResponse] = []
    for venta in ventas:
        detalles = detalles_por_venta.get(venta.id, [])
        if venta.cliente_id is not None:
            cliente_nombre = clientes_por_id.get(venta.cliente_id)
        elif venta.cliente_tienda_id is not None:
            cliente_nombre = clientes_tienda_por_id.get(venta.cliente_tienda_id)
        else:
            cliente_nombre = None

        payload.append(_respuesta_venta(venta, detalles, cliente_nombre, devoluciones_por_venta.get(venta.id)))

    return payload


@router.get("/api/ventas/config")
def get_ventas_config(
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> dict[str, float]:
    """Reglas del punto de venta que la pantalla necesita conocer."""
    return {"descuento_max_sin_autorizacion_pct": descuento_max_sin_autorizacion()}


@router.get("/api/ventas/{venta_id}", response_model=VentaResponse)
def get_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> VentaResponse:
    """Detalle de una venta (productos, cobro, cliente y quien la hizo), solo de las que el rol puede ver."""
    venta = db.execute(_solo_las_del_rol(select(VentaModel).where(VentaModel.id == venta_id), current_user)).scalar_one_or_none()
    if venta is None:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return _build_venta_responses([venta], db)[0]


@router.patch("/api/ventas/{venta_id}", response_model=VentaResponse)
def update_venta(
    venta_id: int,
    payload: VentaUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> VentaResponse:
    campos = payload.model_fields_set
    if not campos:
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    with db.begin():
        venta = db.execute(
            select(VentaModel)
            .where(VentaModel.id == venta_id)
            .with_for_update(),
        ).scalar_one_or_none()

        if venta is None:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        if venta.anulada:
            raise HTTPException(status_code=409, detail="La venta esta anulada y ya no se puede modificar")

        if float(venta.total_devuelto or 0) > 0:
            raise HTTPException(status_code=409, detail="La venta ya tiene devoluciones: no se puede modificar")

        if venta.tipo_fiado == FIADO_ORIGEN_CARTERA:
            raise HTTPException(
                status_code=409,
                detail="Las ventas de cartera se gestionan desde el modulo de cartera",
            )

        deuda_antes = deuda_pendiente_tienda(venta)

        total = float(payload.total) if "total" in campos and payload.total is not None else float(venta.total)

        es_fiado = (
            payload.es_fiado
            if "es_fiado" in campos and payload.es_fiado is not None
            else bool(venta.es_fiado)
        )

        tipo_fiado = venta.tipo_fiado
        if "fiado_origen" in campos:
            tipo_fiado = str(payload.fiado_origen or "").lower().strip() or None

        cliente_id = venta.cliente_id
        if "cliente_id" in campos:
            cliente_id = payload.cliente_id

        cliente_tienda_id = venta.cliente_tienda_id
        if "cliente_tienda_id" in campos:
            cliente_tienda_id = payload.cliente_tienda_id

        if es_fiado:
            if tipo_fiado not in {FIADO_ORIGEN_TIENDA}:
                raise HTTPException(
                    status_code=400,
                    detail="Solo se permite editar ventas fiadas de tienda desde este modulo",
                )
            if cliente_tienda_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="Debes definir cliente_tienda_id para venta fiada de tienda",
                )

            cliente_tienda = db.execute(
                select(ClienteFiadoTiendaModel)
                .where(ClienteFiadoTiendaModel.id == cliente_tienda_id)
                .with_for_update(),
            ).scalar_one_or_none()
            if cliente_tienda is None:
                raise HTTPException(status_code=404, detail="Cliente fiado de tienda no encontrado")

            cliente_id = None
            if "saldo_pendiente" in campos and payload.saldo_pendiente is not None:
                saldo_pendiente = float(payload.saldo_pendiente)
            elif venta.es_fiado:
                saldo_pendiente = min(float(venta.saldo_pendiente), float(total))  # conserva el abono ya hecho
            else:
                saldo_pendiente = float(total)
        else:
            tipo_fiado = None
            cliente_id = None
            cliente_tienda_id = None
            saldo_pendiente = (
                float(payload.saldo_pendiente)
                if "saldo_pendiente" in campos and payload.saldo_pendiente is not None
                else 0.0
            )

        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="ventas",
            entidad="venta",
            accion="editar",
            entidad_id=venta.id,
            detalle=f"total {venta.total}->{total}, saldo {venta.saldo_pendiente}->{saldo_pendiente}, fiado {venta.es_fiado}->{es_fiado}",
        )
        venta.total = total
        venta.es_fiado = es_fiado
        venta.tipo_fiado = tipo_fiado
        venta.cliente_id = cliente_id
        venta.cliente_tienda_id = cliente_tienda_id
        venta.saldo_pendiente = saldo_pendiente
        mover_deuda_tienda(db, deuda_antes, deuda_pendiente_tienda(venta))
        db.flush()

    venta = db.execute(
        select(VentaModel).where(VentaModel.id == venta_id),
    ).scalar_one_or_none()
    if venta is None:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    detalles_model = db.execute(
        select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta.id),
    ).scalars().all()
    detalles = [_to_detalle_response(detalle) for detalle in detalles_model]

    if venta.cliente_id is not None:
        cliente_model = db.execute(
            select(ClienteModel).where(ClienteModel.id == venta.cliente_id),
        ).scalar_one_or_none()
        cliente_nombre = cliente_model.nombre if cliente_model is not None else None
    elif venta.cliente_tienda_id is not None:
        cliente_tienda_model = db.execute(
            select(ClienteFiadoTiendaModel).where(
                ClienteFiadoTiendaModel.id == venta.cliente_tienda_id,
            ),
        ).scalar_one_or_none()
        cliente_nombre = cliente_tienda_model.nombre if cliente_tienda_model is not None else None
    else:
        cliente_nombre = None

    return _respuesta_venta(venta, detalles, cliente_nombre)


@router.post("/api/ventas/{venta_id}/anular", response_model=VentaResponse)
@limiter.limit(login_rate_limit())
def anular_venta_endpoint(
    request: Request,
    venta_id: int,
    payload: AnularVentaRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> VentaResponse:
    """Anula una venta del turno abierto: devuelve stock, deuda y puntos, y conserva el registro."""
    with db.begin():
        autorizada_por = quien_autoriza(db, current_user, payload.autorizador_usuario, payload.autorizador_password)
        venta = anular_venta(
            db,
            venta_id,
            solicitante=current_user.username,
            autorizada_por=autorizada_por,
            motivo=payload.motivo.strip(),
        )
        db.flush()
        detalles = [
            _to_detalle_response(d)
            for d in db.execute(select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta.id)).scalars()
        ]
        cliente_tienda = (
            db.get(ClienteFiadoTiendaModel, venta.cliente_tienda_id) if venta.cliente_tienda_id is not None else None
        )
        return _respuesta_venta(venta, detalles, cliente_tienda.nombre if cliente_tienda else None)


@router.delete(
    "/api/ventas/{venta_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> Response:
    with db.begin():
        venta = db.execute(
            select(VentaModel)
            .where(VentaModel.id == venta_id)
            .with_for_update(),
        ).scalar_one_or_none()

        if venta is None:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        if venta.anulada:
            raise HTTPException(status_code=409, detail="La venta esta anulada y ya no se puede modificar")

        if float(venta.total_devuelto or 0) > 0:
            raise HTTPException(status_code=409, detail="La venta ya tiene devoluciones: no se puede eliminar")

        if venta.tipo_fiado == FIADO_ORIGEN_CARTERA:
            raise HTTPException(
                status_code=409,
                detail="Las ventas de cartera se eliminan desde el modulo de cartera",
            )

        mover_deuda_tienda(db, deuda_pendiente_tienda(venta), SIN_DEUDA)
        revertir_puntos_de_venta(db, venta, usuario=current_user.username, tipo="eliminacion_venta")

        detalles = db.execute(
            select(DetalleVentaModel)
            .where(DetalleVentaModel.venta_id == venta.id)
            .with_for_update(),
        ).scalars().all()

        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="ventas",
            entidad="venta",
            accion="eliminar",
            entidad_id=venta.id,
            detalle=f"Eliminada venta total {venta.total} fiado={venta.es_fiado}",
        )
        for detalle in detalles:
            producto = db.execute(
                select(ProductoModel)
                .where(ProductoModel.id == detalle.producto_id)
                .with_for_update(),
            ).scalar_one_or_none()
            if producto is not None:
                mover_stock(
                    db, producto, detalle.cantidad, tipo="eliminacion_venta", usuario=current_user.username,
                    motivo="Venta eliminada", referencia_tipo="venta", referencia_id=venta.id,
                )

        for detalle in detalles:
            db.delete(detalle)

        db.delete(venta)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
