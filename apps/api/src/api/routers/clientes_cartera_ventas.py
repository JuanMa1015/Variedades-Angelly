"""Router de ventas e historial de cartera."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.routers.cartera_shared import normalize_naive_datetime
from src.application.services.ventas_service import build_recibo_text
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import ClienteModel, DetalleVentaModel, ProductoModel, VentaModel, AbonoCarteraModel
from src.api.schemas.cartera import (
    AbonoCarteraResponse,
    CarteraVentaCreateRequest,
    CarteraVentaHistorialItemResponse,
    VentaDetalleResponse,
    VentaResponse,
)

router = APIRouter(tags=["clientes-cartera-ventas"])

FIADO_ORIGEN_CARTERA = "cartera"


@router.post("/api/cartera/ventas", response_model=VentaResponse, status_code=201)
def create_cartera_venta(
    payload: CarteraVentaCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> VentaResponse:
    total = 0.0
    detalle_payload: list[VentaDetalleResponse] = []

    try:
        with db.begin():
            cliente = db.execute(
                select(ClienteModel)
                .where(ClienteModel.id == payload.cliente_id)
                .with_for_update(),
            ).scalar_one_or_none()

            if cliente is None:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")

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

                if producto.stock_actual < item.cantidad:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Stock insuficiente para '{producto.nombre}'. "
                            f"Disponible: {producto.stock_actual}"
                        ),
                    )

                producto.stock_actual -= item.cantidad
                subtotal = float(item.cantidad * producto.precio_venta)
                total += subtotal

                detalle_payload.append(
                    VentaDetalleResponse(
                        producto_id=producto.id,
                        nombre_producto=producto.nombre,
                        cantidad=item.cantidad,
                        precio_unitario=producto.precio_venta,
                        subtotal=subtotal,
                    ),
                )

            abono_inicial = float(payload.abono_inicial)
            if abono_inicial > total:
                raise HTTPException(
                    status_code=400,
                    detail="El abono inicial no puede superar el total de la venta",
                )

            deuda_incremento = float(total - abono_inicial)
            cliente.deuda_total = float(cliente.deuda_total + deuda_incremento)

            fecha_venta = normalize_naive_datetime(payload.fecha_venta) or datetime.now(UTC)
            venta = VentaModel(
                cliente_id=cliente.id,
                cliente_tienda_id=None,
                tipo_fiado=FIADO_ORIGEN_CARTERA if deuda_incremento > 0 else None,
                metodo_pago=payload.metodo_pago,
                es_fiado=deuda_incremento > 0,
                total=total,
                saldo_pendiente=cliente.deuda_total,
                fecha=fecha_venta,
            )
            db.add(venta)
            db.flush()

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
                    ),
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
            ),
        )

    return historial
