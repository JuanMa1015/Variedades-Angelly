"""Router de ventas y fidelizacion."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.application.services.ventas_service import build_recibo_text, ventas_metric_since
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    ClienteFiadoTiendaModel,
    ClienteFidelizacionModel,
    ClienteModel,
    DetalleVentaModel,
    ProductoModel,
    VentaModel,
)

router = APIRouter(tags=["ventas-fidelizacion"])

FIDELIZACION_UMBRAL_BONO = 100
FIADO_ORIGEN_CARTERA = "cartera"
FIADO_ORIGEN_TIENDA = "tienda"


class VentaItemCreateRequest(BaseModel):
    """DTO de cada item a vender."""

    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0)]


class VentaCreateRequest(BaseModel):
    """DTO de entrada para registrar ventas."""

    cliente_id: Annotated[int | None, Field(gt=0)] = None
    cliente_tienda_id: Annotated[int | None, Field(gt=0)] = None
    items: Annotated[list[VentaItemCreateRequest], Field(min_length=1)]
    es_fiado: bool = False
    fiado_origen: str | None = None


class VentaUpdateRequest(BaseModel):
    """Entrada administrativa para editar una venta existente."""

    cliente_id: Annotated[int | None, Field(gt=0)] = None
    cliente_tienda_id: Annotated[int | None, Field(gt=0)] = None
    es_fiado: bool | None = None
    fiado_origen: str | None = None
    total: Annotated[float | None, Field(ge=0)] = None
    saldo_pendiente: Annotated[float | None, Field(ge=0)] = None


class VentaDetalleResponse(BaseModel):
    """DTO de salida para lineas de una venta."""

    producto_id: int
    nombre_producto: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class VentaResponse(BaseModel):
    """DTO de salida para venta creada."""

    venta_id: int
    cliente_id: int | None
    cliente_tienda_id: int | None
    cliente_nombre: str | None
    es_fiado: bool
    fiado_origen: str | None
    total: float
    saldo_pendiente: float
    fecha: datetime
    detalles: list[VentaDetalleResponse]
    resumen_recibo: str


class ClienteFiadoTiendaResponse(BaseModel):
    """DTO para clientes fiados operativos de tienda."""

    id: int
    nombre: str
    telefono_whatsapp: str | None


class ClienteFiadoTiendaCreateRequest(BaseModel):
    """Entrada para crear clientes fiados de tienda."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None


class ClienteFiadoTiendaUpdateRequest(BaseModel):
    """Entrada para editar cliente fiado operativo de tienda."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None


class ClienteFidelizacionResponse(BaseModel):
    """DTO de salida para clientes del modulo de fidelizacion."""

    id: int
    nombre: str
    telefono_whatsapp: str
    puntos_acumulados: int


class ClienteFidelizacionCreateRequest(BaseModel):
    """Entrada para crear cliente de fidelizacion."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    telefono_whatsapp: Annotated[str, Field(min_length=7, max_length=25)]
    puntos_acumulados: Annotated[int, Field(ge=0)] = 0


class ClienteFidelizacionUpdateRequest(BaseModel):
    """Entrada para editar cliente de fidelizacion."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(min_length=7, max_length=25)] = None
    puntos_acumulados: Annotated[int | None, Field(ge=0)] = None


class DashboardResumenResponse(BaseModel):
    """Resumen ejecutivo de ventas para dashboard inicial."""

    ventas_diarias: float
    ventas_semanales: float
    ventas_mensuales: float
    transacciones_diarias: int
    transacciones_semanales: int
    transacciones_mensuales: int


def _to_detalle_response(detalle: DetalleVentaModel) -> VentaDetalleResponse:
    return VentaDetalleResponse(
        producto_id=detalle.producto_id,
        nombre_producto=detalle.nombre_producto,
        cantidad=detalle.cantidad,
        precio_unitario=detalle.precio_unitario,
        subtotal=detalle.subtotal,
    )


@router.get("/api/clientes/tienda-fiado", response_model=list[ClienteFiadoTiendaResponse])
def list_clientes_fiado_tienda(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[ClienteFiadoTiendaResponse]:
    clientes = db.execute(
        select(ClienteFiadoTiendaModel).order_by(ClienteFiadoTiendaModel.nombre.asc()),
    ).scalars().all()

    return [
        ClienteFiadoTiendaResponse(
            id=cliente.id,
            nombre=cliente.nombre,
            telefono_whatsapp=cliente.telefono_whatsapp,
        )
        for cliente in clientes
    ]


@router.post("/api/clientes/tienda-fiado", response_model=ClienteFiadoTiendaResponse, status_code=201)
def create_cliente_fiado_tienda(
    payload: ClienteFiadoTiendaCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ClienteFiadoTiendaResponse:
    existente = db.execute(
        select(ClienteFiadoTiendaModel).where(
            ClienteFiadoTiendaModel.nombre == payload.nombre,
        ),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")

    cliente = ClienteFiadoTiendaModel(
        nombre=payload.nombre,
        telefono_whatsapp=payload.telefono_whatsapp,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    return ClienteFiadoTiendaResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
    )


@router.patch("/api/clientes/tienda-fiado/{cliente_id}", response_model=ClienteFiadoTiendaResponse)
def update_cliente_fiado_tienda(
    cliente_id: int,
    payload: ClienteFiadoTiendaUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteFiadoTiendaResponse:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ClienteFiadoTiendaModel).where(
                ClienteFiadoTiendaModel.nombre == nombre,
                ClienteFiadoTiendaModel.id != cliente_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")
        cliente.nombre = nombre

    if payload.telefono_whatsapp is not None:
        cliente.telefono_whatsapp = payload.telefono_whatsapp.strip() or None

    db.commit()
    db.refresh(cliente)

    return ClienteFiadoTiendaResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
    )


@router.delete(
    "/api/clientes/tienda-fiado/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_fiado_tienda(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")

    ventas_asociadas = db.execute(
        select(func.count())
        .select_from(VentaModel)
        .where(VentaModel.cliente_tienda_id == cliente_id),
    ).scalar_one()
    if ventas_asociadas > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un cliente con historial de ventas",
        )

    db.delete(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/dashboard/resumen", response_model=DashboardResumenResponse)
def dashboard_resumen(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> DashboardResumenResponse:
    now = datetime.now(UTC)
    inicio_dia = now.replace(hour=0, minute=0, second=0, microsecond=0)
    inicio_semana = inicio_dia - timedelta(days=inicio_dia.weekday())
    inicio_mes = inicio_dia.replace(day=1)

    ventas_diarias, transacciones_diarias = ventas_metric_since(db, inicio_dia)
    ventas_semanales, transacciones_semanales = ventas_metric_since(db, inicio_semana)
    ventas_mensuales, transacciones_mensuales = ventas_metric_since(db, inicio_mes)

    return DashboardResumenResponse(
        ventas_diarias=ventas_diarias,
        ventas_semanales=ventas_semanales,
        ventas_mensuales=ventas_mensuales,
        transacciones_diarias=transacciones_diarias,
        transacciones_semanales=transacciones_semanales,
        transacciones_mensuales=transacciones_mensuales,
    )


@router.get("/api/fidelizacion/clientes", response_model=list[ClienteFidelizacionResponse])
def list_clientes_fidelizacion(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[ClienteFidelizacionResponse]:
    clientes = db.execute(
        select(ClienteFidelizacionModel).order_by(
            ClienteFidelizacionModel.puntos_acumulados.desc(),
            ClienteFidelizacionModel.nombre.asc(),
        ),
    ).scalars().all()

    return [
        ClienteFidelizacionResponse(
            id=cliente.id,
            nombre=cliente.nombre,
            telefono_whatsapp=cliente.telefono_whatsapp,
            puntos_acumulados=cliente.puntos_acumulados,
        )
        for cliente in clientes
    ]


@router.post("/api/fidelizacion/clientes", response_model=ClienteFidelizacionResponse, status_code=201)
def create_cliente_fidelizacion(
    payload: ClienteFidelizacionCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteFidelizacionResponse:
    existente = db.execute(
        select(ClienteFidelizacionModel).where(
            ClienteFidelizacionModel.telefono_whatsapp == payload.telefono_whatsapp,
        ),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese WhatsApp")

    cliente = ClienteFidelizacionModel(
        nombre=payload.nombre,
        telefono_whatsapp=payload.telefono_whatsapp,
        puntos_acumulados=payload.puntos_acumulados,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


@router.patch("/api/fidelizacion/clientes/{cliente_id}", response_model=ClienteFidelizacionResponse)
def update_cliente_fidelizacion(
    cliente_id: int,
    payload: ClienteFidelizacionUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteFidelizacionResponse:
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if payload.nombre is not None:
        cliente.nombre = payload.nombre.strip()

    if payload.telefono_whatsapp is not None:
        telefono = payload.telefono_whatsapp.strip()
        existente = db.execute(
            select(ClienteFidelizacionModel).where(
                ClienteFidelizacionModel.telefono_whatsapp == telefono,
                ClienteFidelizacionModel.id != cliente_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese WhatsApp")
        cliente.telefono_whatsapp = telefono

    if payload.puntos_acumulados is not None:
        cliente.puntos_acumulados = payload.puntos_acumulados

    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


@router.delete(
    "/api/fidelizacion/clientes/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    db.delete(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/api/fidelizacion/clientes/{cliente_id}/canjear-bono", response_model=ClienteFidelizacionResponse)
def canjear_bono_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ClienteFidelizacionResponse:
    cliente = db.execute(
        select(ClienteFidelizacionModel)
        .where(ClienteFidelizacionModel.id == cliente_id)
        .with_for_update(),
    ).scalar_one_or_none()

    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if cliente.puntos_acumulados < FIDELIZACION_UMBRAL_BONO:
        raise HTTPException(
            status_code=400,
            detail="El cliente aun no alcanza el umbral para canjear bono",
        )

    cliente.puntos_acumulados -= FIDELIZACION_UMBRAL_BONO
    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


@router.post("/api/ventas", response_model=VentaResponse, status_code=201)
def create_venta(
    payload: VentaCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> VentaResponse:
    total = 0.0
    detalle_payload: list[VentaDetalleResponse] = []
    cliente: ClienteModel | None = None
    cliente_tienda: ClienteFiadoTiendaModel | None = None
    cliente_nombre: str | None = None
    saldo_pendiente = 0.0
    fiado_origen: str | None = None

    if payload.es_fiado:
        fiado_origen = str(payload.fiado_origen or "").lower().strip()
        if fiado_origen not in {FIADO_ORIGEN_CARTERA, FIADO_ORIGEN_TIENDA}:
            raise HTTPException(
                status_code=400,
                detail="Debes indicar fiado_origen: cartera o tienda",
            )
    else:
        fiado_origen = None

    try:
        with db.begin():
            if payload.es_fiado and fiado_origen == FIADO_ORIGEN_CARTERA:
                if current_user.role != "admin":
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

                cliente_nombre = cliente_tienda.nombre

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

            if payload.es_fiado:
                if fiado_origen == FIADO_ORIGEN_CARTERA:
                    if cliente is None:
                        raise HTTPException(
                            status_code=400,
                            detail="Debes seleccionar un cliente de cartera",
                        )

                    nueva_deuda = float(cliente.deuda_total + total)
                    if nueva_deuda > float(cliente.limite_credito):
                        raise HTTPException(
                            status_code=400,
                            detail="Limite de credito excedido",
                        )
                    cliente.deuda_total = nueva_deuda
                    saldo_pendiente = nueva_deuda
                elif fiado_origen == FIADO_ORIGEN_TIENDA:
                    saldo_pendiente = float(total)

            venta = VentaModel(
                cliente_id=cliente.id if cliente is not None else None,
                cliente_tienda_id=cliente_tienda.id if cliente_tienda is not None else None,
                tipo_fiado=fiado_origen,
                es_fiado=payload.es_fiado,
                total=total,
                saldo_pendiente=saldo_pendiente,
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

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No fue posible registrar la venta por conflicto de datos",
        ) from exc

    resumen = build_recibo_text(
        venta_id=venta.id,
        detalles=detalle_payload,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        cliente_nombre=cliente_nombre,
    )

    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_tienda_id=venta.cliente_tienda_id,
        cliente_nombre=cliente_nombre,
        es_fiado=venta.es_fiado,
        fiado_origen=venta.tipo_fiado,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        fecha=venta.fecha,
        detalles=detalle_payload,
        resumen_recibo=resumen,
    )


@router.get("/api/ventas", response_model=list[VentaResponse])
def list_ventas(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[VentaResponse]:
    ventas = db.execute(
        select(VentaModel).order_by(VentaModel.fecha.desc()),
    ).scalars().all()

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

    payload: list[VentaResponse] = []
    for venta in ventas:
        detalles_model = db.execute(
            select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta.id),
        ).scalars().all()
        detalles = [_to_detalle_response(detalle) for detalle in detalles_model]
        if venta.cliente_id is not None:
            cliente_nombre = clientes_por_id.get(venta.cliente_id)
        elif venta.cliente_tienda_id is not None:
            cliente_nombre = clientes_tienda_por_id.get(venta.cliente_tienda_id)
        else:
            cliente_nombre = None

        payload.append(
            VentaResponse(
                venta_id=venta.id,
                cliente_id=venta.cliente_id,
                cliente_tienda_id=venta.cliente_tienda_id,
                cliente_nombre=cliente_nombre,
                es_fiado=venta.es_fiado,
                fiado_origen=venta.tipo_fiado,
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
            ),
        )

    return payload


@router.patch("/api/ventas/{venta_id}", response_model=VentaResponse)
def update_venta(
    venta_id: int,
    payload: VentaUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
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

        if venta.tipo_fiado == FIADO_ORIGEN_CARTERA:
            raise HTTPException(
                status_code=409,
                detail="Las ventas de cartera se gestionan desde el modulo de cartera",
            )

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
            saldo_pendiente = (
                float(payload.saldo_pendiente)
                if "saldo_pendiente" in campos and payload.saldo_pendiente is not None
                else float(total)
            )
        else:
            tipo_fiado = None
            cliente_id = None
            cliente_tienda_id = None
            saldo_pendiente = (
                float(payload.saldo_pendiente)
                if "saldo_pendiente" in campos and payload.saldo_pendiente is not None
                else 0.0
            )

        venta.total = total
        venta.es_fiado = es_fiado
        venta.tipo_fiado = tipo_fiado
        venta.cliente_id = cliente_id
        venta.cliente_tienda_id = cliente_tienda_id
        venta.saldo_pendiente = saldo_pendiente
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

    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_tienda_id=venta.cliente_tienda_id,
        cliente_nombre=cliente_nombre,
        es_fiado=venta.es_fiado,
        fiado_origen=venta.tipo_fiado,
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
    )


@router.delete(
    "/api/ventas/{venta_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    with db.begin():
        venta = db.execute(
            select(VentaModel)
            .where(VentaModel.id == venta_id)
            .with_for_update(),
        ).scalar_one_or_none()

        if venta is None:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        if venta.tipo_fiado == FIADO_ORIGEN_CARTERA:
            raise HTTPException(
                status_code=409,
                detail="Las ventas de cartera se eliminan desde el modulo de cartera",
            )

        detalles = db.execute(
            select(DetalleVentaModel)
            .where(DetalleVentaModel.venta_id == venta.id)
            .with_for_update(),
        ).scalars().all()

        for detalle in detalles:
            producto = db.execute(
                select(ProductoModel)
                .where(ProductoModel.id == detalle.producto_id)
                .with_for_update(),
            ).scalar_one_or_none()
            if producto is not None:
                producto.stock_actual = int(producto.stock_actual + detalle.cantidad)

        for detalle in detalles:
            db.delete(detalle)

        db.delete(venta)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
