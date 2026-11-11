"""Router CRUD para facturas de compra."""

from __future__ import annotations

import os
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.api.limiter import limiter, login_rate_limit
from src.api.schemas.anulacion import AnularRequest
from src.api.services.anulacion import anular_factura, quien_autoriza
from src.api.services.auditoria import registrar_auditoria
from src.api.services.compras import (
    aplicar_compra_a_producto,
    costo_unitario,
    redondear_precio_venta,
    revertir_stock_de_factura,
)
from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo, build_page, search_filter
from src.api.services.venta_reglas import caja_abierta_id, exigir_caja_abierta
from src.infrastructure.database.connection import get_db

IVA_RATE = float(os.getenv("IVA_RATE", "0.19"))
from src.infrastructure.database.models import (
    FacturaCompraDetalleModel,
    FacturaCompraModel,
    PedidoProveedorModel,
    ProductoModel,
    ProveedorModel,
)

router = APIRouter(tags=["facturas-compra"])

MedioPagoCompra = Literal["efectivo", "transferencia", "tarjeta", "credito"]
NUMERO_MINIMO = 3


class FacturaDetalleCreateRequest(BaseModel):
    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0)]
    aplica_iva: bool = False
    precio_unitario: Annotated[float, Field(gt=0)]
    # Si es True el producto queda con `precio_venta` (o con el sugerido redondeado si no se envia).
    actualizar_precio: bool = False
    precio_venta: Annotated[float | None, Field(gt=0)] = None
    # Vender por debajo del costo es una decision que se confirma: sin esto el servidor lo rechaza.
    permitir_bajo_costo: bool = False


class FacturaCompraCreateRequest(BaseModel):
    proveedor_id: Annotated[int, Field(gt=0)]
    items: Annotated[list[FacturaDetalleCreateRequest], Field(min_length=1)]
    encomienda: Annotated[float, Field(ge=0)] = 0.0
    porcentaje_ganancia: Annotated[float, Field(ge=0.05, le=0.95)] = 0.70
    numero_factura: Annotated[str | None, Field(max_length=20)] = None
    # Pedido a este proveedor que esta factura cumple: queda como recibido y enlazado.
    pedido_id: Annotated[int | None, Field(gt=0)] = None
    # Como se pago: solo el efectivo sale del cajon (exige caja abierta). Sin dato, no toca la caja.
    medio_pago: MedioPagoCompra | None = None


class FacturaDetalleResponse(BaseModel):
    producto_id: int
    nombre_producto: str
    cantidad: int
    aplica_iva: bool
    precio_unitario: float
    precio_total: float
    precio_venta_sugerido: float | None = None
    ganancia_estimada: float | None = None


class FacturaCompraResponse(BaseModel):
    id: int
    proveedor_id: int
    proveedor_nombre: str
    creado_por: str
    subtotal: float
    total_iva: float
    total_factura: float
    numero_factura: str | None = None
    encomienda: float | None = 0.0
    porcentaje_ganancia: float | None = None
    fecha_creacion: datetime
    items: list[FacturaDetalleResponse]
    medio_pago: str | None = None
    caja_id: int | None = None
    anulada: bool = False
    anulada_en: datetime | None = None
    anulada_por: str | None = None
    autorizada_por: str | None = None
    motivo_anulacion: str | None = None


class FacturaCompraPageResponse(BaseModel):
    data: list[FacturaCompraResponse]
    page: PageInfo


class FacturaCompraUpdateRequest(BaseModel):
    total_factura: Annotated[float | None, Field(gt=0)] = None


def _to_factura_response(
    factura: FacturaCompraModel,
    proveedor_nombre: str,
    items: list[FacturaCompraDetalleModel],
) -> FacturaCompraResponse:
    return FacturaCompraResponse(
        id=factura.id,
        proveedor_id=factura.proveedor_id,
        proveedor_nombre=proveedor_nombre,
        creado_por=factura.creado_por,
        subtotal=factura.subtotal,
        total_iva=factura.total_iva,
        total_factura=factura.total_factura,
        numero_factura=factura.numero_factura,
        encomienda=factura.encomienda,
        porcentaje_ganancia=factura.porcentaje_ganancia,
        fecha_creacion=factura.fecha_creacion,
        medio_pago=factura.medio_pago,
        caja_id=factura.caja_id,
        anulada=bool(factura.anulada),
        anulada_en=factura.anulada_en,
        anulada_por=factura.anulada_por,
        autorizada_por=factura.autorizada_por,
        motivo_anulacion=factura.motivo_anulacion,
        items=[
            FacturaDetalleResponse(
                producto_id=item.producto_id,
                nombre_producto=item.nombre_producto,
                cantidad=item.cantidad,
                aplica_iva=item.aplica_iva,
                precio_unitario=item.precio_unitario,
                precio_total=item.precio_total,
                precio_venta_sugerido=item.precio_venta_sugerido,
                ganancia_estimada=item.ganancia_estimada,
            )
            for item in items
        ],
    )


@router.get("/api/facturas-compra/config")
def get_facturas_config(
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> dict[str, float]:
    """Parametros que el frontend necesita para previsualizar totales (fuente unica: backend)."""
    return {"iva_rate": IVA_RATE}


@router.get("/api/facturas-compra", response_model=list[FacturaCompraResponse])
def list_facturas_compra(
    db: Session = Depends(get_db),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[FacturaCompraResponse]:
    query = select(FacturaCompraModel)
    if fecha_desde:
        query = query.where(FacturaCompraModel.fecha_creacion >= fecha_desde)
    if fecha_hasta:
        # Hasta el final de ese dia: comparar contra la medianoche dejaba fuera todo el dia final.
        query = query.where(FacturaCompraModel.fecha_creacion < fecha_hasta + timedelta(days=1))
    facturas = db.execute(
        query.order_by(FacturaCompraModel.fecha_creacion.desc()),
    ).scalars().all()

    if not facturas:
        return []

    proveedor_ids = {factura.proveedor_id for factura in facturas}
    proveedores = db.execute(
        select(ProveedorModel).where(ProveedorModel.id.in_(proveedor_ids)),
    ).scalars().all()
    proveedor_map = {proveedor.id: proveedor.nombre for proveedor in proveedores}

    factura_ids = [factura.id for factura in facturas]
    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(FacturaCompraDetalleModel.factura_id.in_(factura_ids)),
    ).scalars().all()

    detalles_map: dict[int, list[FacturaCompraDetalleModel]] = {}
    for detalle in detalles:
        detalles_map.setdefault(detalle.factura_id, []).append(detalle)

    return [
        _to_factura_response(
            factura,
            proveedor_nombre=proveedor_map.get(factura.proveedor_id, "Proveedor"),
            items=detalles_map.get(factura.id, []),
        )
        for factura in facturas
    ]


@router.get("/api/facturas-compra/paginadas", response_model=FacturaCompraPageResponse)
def list_facturas_compra_paginadas(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100, description="Numero de factura o nombre del proveedor"),
    proveedor_id: int | None = Query(default=None, gt=0),
    medio_pago: MedioPagoCompra | None = Query(default=None),
    estado: Literal["todas", "vigentes", "anuladas"] = Query(default="todas"),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> FacturaCompraPageResponse:
    query = select(FacturaCompraModel).join(ProveedorModel, ProveedorModel.id == FacturaCompraModel.proveedor_id)
    if proveedor_id is not None:
        query = query.where(FacturaCompraModel.proveedor_id == proveedor_id)
    if medio_pago:
        query = query.where(FacturaCompraModel.medio_pago == medio_pago)
    if estado != "todas":
        query = query.where(FacturaCompraModel.anulada.is_(estado == "anuladas"))
    termino = (q or "").strip()
    if termino:
        query = query.where(or_(*search_filter(termino, FacturaCompraModel.numero_factura, ProveedorModel.nombre)))
    if fecha_desde:
        query = query.where(FacturaCompraModel.fecha_creacion >= fecha_desde)
    if fecha_hasta:
        # Hasta el final de ese dia: comparar contra la medianoche dejaba fuera todo el dia final.
        query = query.where(FacturaCompraModel.fecha_creacion < fecha_hasta + timedelta(days=1))
    items, page_info = build_page(db, query, page, limit, FacturaCompraModel.fecha_creacion.desc())

    if not items:
        return FacturaCompraPageResponse(data=[], page=page_info)

    proveedor_ids = {factura.proveedor_id for factura in items}
    proveedores = db.execute(
        select(ProveedorModel).where(ProveedorModel.id.in_(proveedor_ids)),
    ).scalars().all()
    proveedor_map = {proveedor.id: proveedor.nombre for proveedor in proveedores}

    factura_ids = [factura.id for factura in items]
    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(FacturaCompraDetalleModel.factura_id.in_(factura_ids)),
    ).scalars().all()

    detalles_map: dict[int, list[FacturaCompraDetalleModel]] = {}
    for detalle in detalles:
        detalles_map.setdefault(detalle.factura_id, []).append(detalle)

    return FacturaCompraPageResponse(
        data=[
            _to_factura_response(
                factura,
                proveedor_nombre=proveedor_map.get(factura.proveedor_id, "Proveedor"),
                items=detalles_map.get(factura.id, []),
            )
            for factura in items
        ],
        page=page_info,
    )


def _validar_numero(db: Session, proveedor_id: int, numero: str | None) -> str | None:
    """Numero limpio, de al menos 3 caracteres, y que no se haya registrado ya para ese proveedor."""
    limpio = (numero or "").strip()
    if not limpio:
        return None
    if len(limpio) < NUMERO_MINIMO:
        raise HTTPException(status_code=400, detail=f"El numero de factura debe tener al menos {NUMERO_MINIMO} caracteres")
    repetida = db.execute(
        select(FacturaCompraModel.id).where(
            FacturaCompraModel.proveedor_id == proveedor_id,
            func.lower(FacturaCompraModel.numero_factura) == limpio.lower(),
            FacturaCompraModel.anulada.is_(False),
        ).limit(1),
    ).scalar_one_or_none()
    if repetida is not None:
        raise HTTPException(status_code=409, detail=f"Esa factura ya esta registrada para este proveedor (#{repetida})")
    return limpio


@router.post("/api/facturas-compra", response_model=FacturaCompraResponse, status_code=201)
def create_factura_compra(
    payload: FacturaCompraCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> FacturaCompraResponse:
    for i, item in enumerate(payload.items):
        if not item.producto_id or item.producto_id <= 0:
            raise HTTPException(status_code=422, detail=f"Item #{i + 1}: producto invalido")
        if not item.cantidad or item.cantidad <= 0:
            raise HTTPException(status_code=422, detail=f"Item #{i + 1}: cantidad debe ser mayor a 0")
        if not item.precio_unitario or item.precio_unitario <= 0:
            raise HTTPException(status_code=422, detail=f"Item #{i + 1}: precio unitario debe ser mayor a 0")

    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == payload.proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    numero = _validar_numero(db, payload.proveedor_id, payload.numero_factura)
    if payload.medio_pago == "efectivo":
        exigir_caja_abierta(db, "registrar compras en efectivo")

    pedido = None
    if payload.pedido_id is not None:
        pedido = db.execute(
            select(PedidoProveedorModel).where(PedidoProveedorModel.id == payload.pedido_id).with_for_update(),
        ).scalar_one_or_none()
        if pedido is None:
            raise HTTPException(status_code=404, detail="El pedido indicado no existe")
        if pedido.proveedor_id != payload.proveedor_id:
            raise HTTPException(status_code=400, detail="El pedido es de otro proveedor")
        if pedido.estado != "enviado":
            raise HTTPException(status_code=409, detail=f"El pedido #{pedido.id} ya esta {pedido.estado}")

    producto_ids = {item.producto_id for item in payload.items}
    productos = db.execute(
        select(ProductoModel).where(ProductoModel.id.in_(producto_ids)).with_for_update(),
    ).scalars().all()
    productos_map = {producto.id: producto for producto in productos}

    if len(productos_map) != len(producto_ids):
        raise HTTPException(status_code=404, detail="Uno o mas productos no existen")
    inactivos = [p.nombre for p in productos if not p.activo]
    if inactivos:
        raise HTTPException(status_code=409, detail=f"Producto desactivado: {', '.join(inactivos)}. Reactivalo en Inventario para comprarlo")

    subtotal = 0.0
    total_iva = 0.0
    detalles_payload: list[dict] = []

    for item in payload.items:
        producto = productos_map[item.producto_id]
        base = item.cantidad * item.precio_unitario
        iva = base * IVA_RATE if item.aplica_iva else 0.0
        total_linea = base + iva
        precio_con_iva = costo_unitario(item.precio_unitario, item.aplica_iva, IVA_RATE)
        precio_venta_sugerido = redondear_precio_venta(precio_con_iva / payload.porcentaje_ganancia)
        ganancia_estimada = precio_venta_sugerido - precio_con_iva
        nuevo_precio = (item.precio_venta or precio_venta_sugerido) if item.actualizar_precio else None
        if nuevo_precio is not None and nuevo_precio < precio_con_iva and not item.permitir_bajo_costo:
            raise HTTPException(
                status_code=400,
                detail=f"'{producto.nombre}': el precio de venta {nuevo_precio:g} queda por debajo del costo {precio_con_iva:g}",
            )

        subtotal += base
        total_iva += iva
        detalles_payload.append(
            {
                "producto_id": producto.id,
                "nombre_producto": producto.nombre,
                "cantidad": item.cantidad,
                "aplica_iva": item.aplica_iva,
                "precio_unitario": item.precio_unitario,
                "precio_total": total_linea,
                "precio_venta_sugerido": round(precio_venta_sugerido, 2),
                "ganancia_estimada": round(ganancia_estimada, 2),
                "costo": precio_con_iva,
                "nuevo_precio_venta": nuevo_precio,
            },
        )

    factura = FacturaCompraModel(
        proveedor_id=payload.proveedor_id,
        creado_por=current_user.username,
        subtotal=subtotal,
        total_iva=total_iva,
        total_factura=subtotal + total_iva - (payload.encomienda or 0),
        numero_factura=numero,
        encomienda=payload.encomienda or None,
        porcentaje_ganancia=payload.porcentaje_ganancia,
        medio_pago=payload.medio_pago,
    )
    db.add(factura)
    db.flush()

    detalles_creados: list[FacturaCompraDetalleModel] = []
    for item in detalles_payload:
        detalle = FacturaCompraDetalleModel(
            factura_id=factura.id,
            producto_id=item["producto_id"],
            nombre_producto=item["nombre_producto"],
            cantidad=item["cantidad"],
            aplica_iva=item["aplica_iva"],
            precio_unitario=item["precio_unitario"],
            precio_total=item["precio_total"],
            precio_venta_sugerido=item["precio_venta_sugerido"],
            ganancia_estimada=item["ganancia_estimada"],
        )
        db.add(detalle)
        detalles_creados.append(detalle)

        anteriores = aplicar_compra_a_producto(
            db,
            productos_map[item["producto_id"]],
            cantidad=item["cantidad"],
            costo=item["costo"],
            nuevo_precio_venta=item["nuevo_precio_venta"],
            usuario=current_user.username,
            factura_id=factura.id,
        )
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="facturas",
            entidad="producto",
            accion="compra",
            entidad_id=item["producto_id"],
            detalle=(
                f"Factura {factura.id}: +{item['cantidad']} u., costo {anteriores['costo']}->{item['costo']}, "
                f"venta {anteriores['venta']}->{item['nuevo_precio_venta'] or anteriores['venta']}"
            ),
        )

    if pedido is not None:
        pedido.estado = "recibido"
        pedido.factura_id = factura.id
        pedido.fecha_resolucion = datetime.now(UTC).replace(tzinfo=None)
        pedido.resuelto_por = current_user.username
        pedido.nota = None
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="proveedores",
            entidad="pedido_proveedor",
            accion="cambiar_estado",
            entidad_id=pedido.id,
            detalle=f"enviado -> recibido (factura #{factura.id})",
        )

    db.commit()
    db.refresh(factura)

    return _to_factura_response(
        factura,
        proveedor_nombre=proveedor.nombre,
        items=detalles_creados,
    )


@router.patch("/api/facturas-compra/{factura_id}", response_model=FacturaCompraResponse)
def update_factura_compra(
    factura_id: int,
    payload: FacturaCompraUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> FacturaCompraResponse:
    factura = db.execute(
        select(FacturaCompraModel).where(FacturaCompraModel.id == factura_id),
    ).scalar_one_or_none()
    if factura is None:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if factura.anulada:
        raise HTTPException(status_code=409, detail="La factura esta anulada y no se puede editar")
    if payload.total_factura is not None and factura.medio_pago == "efectivo" and factura.caja_id not in (None, caja_abierta_id(db)):
        raise HTTPException(status_code=409, detail="La compra es de un turno de caja ya cerrado: no se puede cambiar su total")

    if payload.total_factura is not None:
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="facturas",
            entidad="factura_compra",
            accion="editar_total",
            entidad_id=factura.id,
            detalle=f"Total {factura.total_factura} -> {payload.total_factura}",
        )
        factura.total_factura = payload.total_factura

    db.commit()
    db.refresh(factura)

    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == factura.proveedor_id),
    ).scalar_one_or_none()
    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(
            FacturaCompraDetalleModel.factura_id == factura.id,
        ),
    ).scalars().all()

    return _to_factura_response(
        factura,
        proveedor_nombre=proveedor.nombre if proveedor else "Proveedor",
        items=detalles,
    )


@router.delete("/api/facturas-compra/{factura_id}", status_code=204)
def delete_factura_compra(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> None:
    factura = db.execute(
        select(FacturaCompraModel).where(FacturaCompraModel.id == factura_id),
    ).scalar_one_or_none()
    if factura is None:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if factura.medio_pago == "efectivo" and factura.caja_id is not None:
        raise HTTPException(status_code=409, detail="La compra en efectivo ya hace parte de un turno de caja: anulala en vez de borrarla")

    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(
            FacturaCompraDetalleModel.factura_id == factura.id,
        ),
    ).scalars().all()
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="facturas",
        entidad="factura_compra",
        accion="eliminar",
        entidad_id=factura.id,
        detalle=f"Eliminada factura total {factura.total_factura}",
    )
    productos = db.execute(
        select(ProductoModel)
        .where(ProductoModel.id.in_({d.producto_id for d in detalles}))
        .with_for_update(),
    ).scalars().all()
    revertir_stock_de_factura(
        db, detalles, {p.id: p for p in productos}, usuario=current_user.username, factura_id=factura.id,
    )
    # El pedido que esta factura cumplia vuelve a quedar pendiente.
    for pedido in db.execute(
        select(PedidoProveedorModel).where(PedidoProveedorModel.factura_id == factura.id),
    ).scalars():
        pedido.estado = "enviado"
        pedido.factura_id = None
        pedido.fecha_resolucion = None
        pedido.resuelto_por = None
    for detalle in detalles:
        db.delete(detalle)
    db.flush()
    db.delete(factura)
    db.commit()


@router.post("/api/facturas-compra/{factura_id}/anular", response_model=FacturaCompraResponse)
@limiter.limit(login_rate_limit())
def anular_factura_endpoint(
    request: Request,
    factura_id: int,
    payload: AnularRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> FacturaCompraResponse:
    """Anula una factura con motivo y autorizacion: devuelve el stock y deja de restar de la caja."""
    with db.begin():
        autorizada_por = quien_autoriza(db, current_user, payload.autorizador_usuario, payload.autorizador_password)
        factura = anular_factura(
            db,
            factura_id,
            solicitante=current_user.username,
            autorizada_por=autorizada_por,
            motivo=payload.motivo.strip(),
        )
        db.flush()
        proveedor = db.get(ProveedorModel, factura.proveedor_id)
        detalles = db.execute(
            select(FacturaCompraDetalleModel).where(FacturaCompraDetalleModel.factura_id == factura.id),
        ).scalars().all()
        return _to_factura_response(factura, proveedor_nombre=proveedor.nombre if proveedor else "Proveedor", items=detalles)
