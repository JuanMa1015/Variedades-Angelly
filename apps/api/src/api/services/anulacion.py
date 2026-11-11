"""Anulacion de ventas: autorizacion del administrador y reversion de stock, deuda y puntos."""

from __future__ import annotations

import logging
import threading
import time
from datetime import UTC, datetime
from functools import cache

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser
from src.api.services.auditoria import registrar_auditoria
from src.api.services.compras import revertir_stock_de_factura
from src.api.services.deuda import SIN_DEUDA, deuda_pendiente_tienda, mover_deuda_tienda
from src.api.services.fidelizacion import revertir_puntos_de_venta
from src.api.services.stock import mover_stock
from src.api.services.venta_reglas import caja_abierta_id
from src.auth.security import hash_password, verify_password
from src.infrastructure.database.models import (
    AbonoTiendaModel,
    ClienteFiadoTiendaModel,
    DetalleVentaModel,
    FacturaCompraDetalleModel,
    FacturaCompraModel,
    GastoModel,
    PedidoProveedorModel,
    ProductoModel,
    UsuarioModel,
    VentaModel,
)

logger = logging.getLogger(__name__)
ROLES_AUTORIZADORES = {"admin", "superadmin"}
_SIN_AUTORIZACION = "Una anulacion necesita la autorizacion de un administrador"
_AUTORIZACION_INVALIDA = "Autorizacion invalida"


MAX_INTENTOS_FALLIDOS = 5
VENTANA_BLOQUEO_SEGUNDOS = 900
_fallos: dict[str, list[float]] = {}
_candado = threading.Lock()


def reiniciar_intentos() -> None:
    with _candado:
        _fallos.clear()


def _recientes(clave: str, ahora: float) -> list[float]:
    vigentes = [t for t in _fallos.get(clave, []) if ahora - t < VENTANA_BLOQUEO_SEGUNDOS]
    if vigentes:
        _fallos[clave] = vigentes
    else:
        _fallos.pop(clave, None)
    return vigentes


def _exigir_sin_bloqueo(claves: list[str]) -> None:
    ahora = time.monotonic()
    with _candado:
        if any(len(_recientes(c, ahora)) >= MAX_INTENTOS_FALLIDOS for c in claves):
            raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Espera unos minutos")


def _registrar_fallo(claves: list[str]) -> None:
    ahora = time.monotonic()
    with _candado:
        for clave in claves:
            _fallos.setdefault(clave, []).append(ahora)
        if len(_fallos) > 1000:  # no crece sin limite con nombres inventados
            for clave in list(_fallos):
                _recientes(clave, ahora)


@cache
def _hash_de_relleno() -> str:
    # Se calcula una sola vez; sirve para que verificar un usuario inexistente tarde lo mismo.
    return hash_password("relleno-para-igualar-tiempos")


def quien_autoriza(
    db: Session,
    solicitante: AuthenticatedUser,
    usuario: str | None,
    password: str | None,
) -> str:
    """Administrador que respalda la anulacion: el mismo solicitante si ya lo es, o quien dio su clave."""
    if solicitante.role in ROLES_AUTORIZADORES:
        return solicitante.username
    if not usuario or not password:
        raise HTTPException(status_code=403, detail=_SIN_AUTORIZACION)

    # Se limita por cuenta probada y por quien prueba: no sirve para adivinar la clave de un admin.
    claves = [f"destino:{usuario.strip().lower()}", f"origen:{solicitante.username}"]
    _exigir_sin_bloqueo(claves)
    autorizador = db.execute(
        select(UsuarioModel).where(UsuarioModel.username == usuario.strip()),
    ).scalar_one_or_none()
    clave_ok = verify_password(password, autorizador.password_hash if autorizador else _hash_de_relleno())
    rol = str(autorizador.rol if autorizador else "").lower().strip()
    if autorizador is None or not clave_ok or not autorizador.activo or rol not in ROLES_AUTORIZADORES:
        _registrar_fallo(claves)
        logger.warning("Autorizacion de anulacion fallida: solicita=%s, cuenta=%s", solicitante.username, usuario.strip())
        raise HTTPException(status_code=403, detail=_AUTORIZACION_INVALIDA)
    with _candado:
        _fallos.pop(claves[0], None)
    return autorizador.username


def _exigir_anulable(db: Session, venta: VentaModel) -> None:
    if venta.anulada:
        raise HTTPException(status_code=409, detail="La venta ya esta anulada")
    if venta.cliente_id is not None or venta.tipo_fiado == "cartera":
        raise HTTPException(status_code=409, detail="Las ventas de cartera se gestionan desde el modulo de cartera")
    _exigir_sin_abonos_posteriores(db, venta)
    caja_abierta = caja_abierta_id(db)
    if caja_abierta is None or venta.caja_id != caja_abierta:
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden anular ventas del turno de caja abierto: ese turno ya se cerro",
        )


def _exigir_sin_abonos_posteriores(db: Session, venta: VentaModel) -> None:
    """Un fiado con abonos hechos despues dejaria ese dinero sin venta que lo respalde."""
    if venta.cliente_tienda_id is None:
        return
    hay_abonos = db.execute(
        select(AbonoTiendaModel.id)
        .where(AbonoTiendaModel.cliente_id == venta.cliente_tienda_id, AbonoTiendaModel.fecha >= venta.fecha)
        .limit(1),
    ).first()
    if hay_abonos is not None:
        raise HTTPException(
            status_code=409,
            detail="El cliente ya hizo abonos despues de esta venta: ajusta la deuda desde su cuenta de fiado",
        )


def _devolver_stock(db: Session, venta_id: int, usuario: str) -> None:
    detalles = db.execute(
        select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta_id),
    ).scalars().all()
    # Productos siempre en el mismo orden para no cruzarse con otra venta en curso.
    for detalle in sorted(detalles, key=lambda d: d.producto_id):
        producto = db.execute(
            select(ProductoModel).where(ProductoModel.id == detalle.producto_id).with_for_update(),
        ).scalar_one_or_none()
        if producto is not None:
            mover_stock(
                db, producto, detalle.cantidad, tipo="anulacion_venta", usuario=usuario,
                motivo="Venta anulada", referencia_tipo="venta", referencia_id=venta_id,
            )


def anular_venta(
    db: Session,
    venta_id: int,
    *,
    solicitante: str,
    autorizada_por: str,
    motivo: str,
) -> VentaModel:
    """Marca la venta como anulada y devuelve stock, deuda de tienda y puntos. No borra nada."""
    venta = db.execute(
        select(VentaModel).where(VentaModel.id == venta_id).with_for_update(),
    ).scalar_one_or_none()
    if venta is None:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    _exigir_anulable(db, venta)

    mover_deuda_tienda(db, deuda_pendiente_tienda(venta), SIN_DEUDA)
    revertir_puntos_de_venta(db, venta)
    _devolver_stock(db, venta.id, solicitante)

    venta.anulada = True
    venta.anulada_en = datetime.now(UTC).replace(tzinfo=None)
    venta.anulada_por = solicitante
    venta.autorizada_por = autorizada_por
    venta.motivo_anulacion = motivo
    registrar_auditoria(
        db,
        usuario=solicitante,
        modulo="ventas",
        entidad="venta",
        accion="anular",
        entidad_id=venta.id,
        detalle=f"Total {venta.total}. Autorizo: {autorizada_por}. Motivo: {motivo}",
    )
    return venta


def anular_abono_tienda(
    db: Session,
    abono_id: int,
    *,
    solicitante: str,
    autorizado_por: str,
    motivo: str,
) -> AbonoTiendaModel:
    """Marca el abono como anulado y le devuelve su monto a la deuda del cliente. No borra nada."""
    abono = db.execute(
        select(AbonoTiendaModel).where(AbonoTiendaModel.id == abono_id).with_for_update(),
    ).scalar_one_or_none()
    if abono is None:
        raise HTTPException(status_code=404, detail="Abono no encontrado")
    if abono.anulado:
        raise HTTPException(status_code=409, detail="El abono ya esta anulado")
    caja_abierta = caja_abierta_id(db)
    if caja_abierta is None or abono.caja_id != caja_abierta:
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden anular abonos del turno de caja abierto: ese turno ya se cerro",
        )

    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == abono.cliente_id).with_for_update(),
    ).scalar_one()
    deuda_antes = float(cliente.deuda_total)
    cliente.deuda_total = round(deuda_antes + float(abono.monto), 2)

    abono.anulado = True
    abono.anulado_en = datetime.now(UTC).replace(tzinfo=None)
    abono.anulado_por = solicitante
    abono.autorizado_por = autorizado_por
    abono.motivo_anulacion = motivo
    registrar_auditoria(
        db,
        usuario=solicitante,
        modulo="clientes_tienda",
        entidad="abono_tienda",
        accion="anular_abono",
        entidad_id=abono.id,
        detalle=(
            f"{cliente.nombre}: abono {float(abono.monto)}. Deuda {deuda_antes} -> {float(cliente.deuda_total)}. "
            f"Autorizo: {autorizado_por}. Motivo: {motivo}"
        ),
    )
    return abono


def anular_gasto(
    db: Session,
    gasto_id: int,
    *,
    solicitante: str,
    autorizado_por: str,
    motivo: str,
) -> GastoModel:
    """Marca el gasto como anulado: deja de restar del efectivo de la caja. No borra nada.

    Un gasto en efectivo solo se anula mientras su turno siga abierto (el cierre ya quedo guardado);
    uno pagado por transferencia o tarjeta no toca el cajon y se puede anular siempre.
    """
    gasto = db.execute(
        select(GastoModel).where(GastoModel.id == gasto_id).with_for_update(),
    ).scalar_one_or_none()
    if gasto is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    if gasto.anulado:
        raise HTTPException(status_code=409, detail="El gasto ya esta anulado")
    if gasto.medio_pago == "efectivo" and gasto.caja_id is not None and gasto.caja_id != caja_abierta_id(db):
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden anular gastos en efectivo del turno de caja abierto: ese turno ya se cerro",
        )

    gasto.anulado = True
    gasto.anulado_en = datetime.now(UTC).replace(tzinfo=None)
    gasto.anulado_por = solicitante
    gasto.autorizado_por = autorizado_por
    gasto.motivo_anulacion = motivo
    registrar_auditoria(
        db,
        usuario=solicitante,
        modulo="gastos",
        entidad="gasto",
        accion="anular",
        entidad_id=gasto.id,
        detalle=f"{gasto.categoria}: {float(gasto.monto)} por {gasto.medio_pago}. Autorizo: {autorizado_por}. Motivo: {motivo}",
    )
    return gasto


def anular_factura(
    db: Session,
    factura_id: int,
    *,
    solicitante: str,
    autorizada_por: str,
    motivo: str,
) -> FacturaCompraModel:
    """Marca la factura como anulada y le quita al stock lo que sumo. No borra nada.

    No devuelve el costo ni el precio de venta que dejo la factura (no se sabe cual era el anterior: se
    corrigen desde Inventario). Una compra en efectivo solo se anula con su turno abierto (el cierre ya
    quedo guardado); si parte de la mercancia ya se vendio, no se puede (el stock quedaria negativo).
    """
    factura = db.execute(
        select(FacturaCompraModel).where(FacturaCompraModel.id == factura_id).with_for_update(),
    ).scalar_one_or_none()
    if factura is None:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if factura.anulada:
        raise HTTPException(status_code=409, detail="La factura ya esta anulada")
    if factura.medio_pago == "efectivo" and factura.caja_id is not None and factura.caja_id != caja_abierta_id(db):
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden anular compras en efectivo del turno de caja abierto: ese turno ya se cerro",
        )

    detalles = db.execute(
        select(FacturaCompraDetalleModel).where(FacturaCompraDetalleModel.factura_id == factura.id),
    ).scalars().all()
    productos = db.execute(
        select(ProductoModel)
        .where(ProductoModel.id.in_({d.producto_id for d in detalles}))
        .order_by(ProductoModel.id)
        .with_for_update(),
    ).scalars().all()
    revertir_stock_de_factura(
        db, detalles, {p.id: p for p in productos}, usuario=solicitante, factura_id=factura.id,
        motivo="Factura de compra anulada",
    )
    # El pedido que esta factura cumplia vuelve a quedar pendiente.
    for pedido in db.execute(select(PedidoProveedorModel).where(PedidoProveedorModel.factura_id == factura.id)).scalars():
        pedido.estado = "enviado"
        pedido.factura_id = None
        pedido.fecha_resolucion = None
        pedido.resuelto_por = None

    factura.anulada = True
    factura.anulada_en = datetime.now(UTC).replace(tzinfo=None)
    factura.anulada_por = solicitante
    factura.autorizada_por = autorizada_por
    factura.motivo_anulacion = motivo
    registrar_auditoria(
        db,
        usuario=solicitante,
        modulo="facturas",
        entidad="factura_compra",
        accion="anular",
        entidad_id=factura.id,
        detalle=f"Total {float(factura.total_factura)}. Autorizo: {autorizada_por}. Motivo: {motivo}",
    )
    return factura
