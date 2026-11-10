"""Anulacion de ventas: autorizacion del administrador y reversion de stock, deuda y puntos."""

from __future__ import annotations

from datetime import UTC, datetime
from functools import cache

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser
from src.api.services.auditoria import registrar_auditoria
from src.api.services.deuda import SIN_DEUDA, deuda_pendiente_tienda, mover_deuda_tienda
from src.api.services.fidelizacion import revertir_puntos
from src.auth.security import hash_password, verify_password
from src.infrastructure.database.models import (
    CierreCajaModel,
    DetalleVentaModel,
    ProductoModel,
    UsuarioModel,
    VentaModel,
)

ROLES_AUTORIZADORES = {"admin", "superadmin"}
_SIN_AUTORIZACION = "Una anulacion necesita la autorizacion de un administrador"
_AUTORIZACION_INVALIDA = "Autorizacion invalida"


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

    autorizador = db.execute(
        select(UsuarioModel).where(UsuarioModel.username == usuario.strip()),
    ).scalar_one_or_none()
    clave_ok = verify_password(password, autorizador.password_hash if autorizador else _hash_de_relleno())
    rol = str(autorizador.rol if autorizador else "").lower().strip()
    if autorizador is None or not clave_ok or not autorizador.activo or rol not in ROLES_AUTORIZADORES:
        raise HTTPException(status_code=403, detail=_AUTORIZACION_INVALIDA)
    return autorizador.username


def _exigir_anulable(db: Session, venta: VentaModel) -> None:
    if venta.anulada:
        raise HTTPException(status_code=409, detail="La venta ya esta anulada")
    if venta.cliente_id is not None or venta.tipo_fiado == "cartera":
        raise HTTPException(status_code=409, detail="Las ventas de cartera se gestionan desde el modulo de cartera")
    caja_abierta = db.execute(
        select(CierreCajaModel.id).where(CierreCajaModel.fecha_cierre.is_(None)).limit(1),
    ).scalar_one_or_none()
    if caja_abierta is None or venta.caja_id != caja_abierta:
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden anular ventas del turno de caja abierto: ese turno ya se cerro",
        )


def _devolver_stock(db: Session, venta_id: int) -> None:
    detalles = db.execute(
        select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta_id),
    ).scalars().all()
    # Productos siempre en el mismo orden para no cruzarse con otra venta en curso.
    for detalle in sorted(detalles, key=lambda d: d.producto_id):
        producto = db.execute(
            select(ProductoModel).where(ProductoModel.id == detalle.producto_id).with_for_update(),
        ).scalar_one_or_none()
        if producto is not None:
            producto.stock_actual = int(producto.stock_actual + detalle.cantidad)


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
    revertir_puntos(db, venta.cliente_fidelizacion_id, venta.puntos_otorgados)
    _devolver_stock(db, venta.id)

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
