"""Reglas del programa de fidelizacion: acumulacion de puntos por compras."""

from __future__ import annotations

import os

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import ClienteFidelizacionModel

UMBRAL_BONO_DEFECTO = 100
PESOS_POR_PUNTO_DEFECTO = 1000
# 1 punto = $20: con 1 punto por cada $1.000 gastados, la devolucion es del 2%.
VALOR_PUNTO_DEFECTO = 20


def _entero_desde_entorno(nombre: str, defecto: int) -> int:
    try:
        valor = int(os.getenv(nombre, "").strip() or defecto)
    except ValueError:
        return defecto
    return valor if valor > 0 else defecto


def umbral_bono() -> int:
    return _entero_desde_entorno("FIDELIZACION_UMBRAL_BONO", UMBRAL_BONO_DEFECTO)


def pesos_por_punto() -> int:
    return _entero_desde_entorno("FIDELIZACION_PESOS_POR_PUNTO", PESOS_POR_PUNTO_DEFECTO)


def valor_punto() -> int:
    """Pesos de descuento que vale cada punto al canjearlo."""
    return _entero_desde_entorno("FIDELIZACION_VALOR_PUNTO", VALOR_PUNTO_DEFECTO)


def puntos_por_monto(monto_cobrado: float) -> int:
    """Un punto por cada ``pesos_por_punto`` realmente cobrados (se redondea hacia abajo)."""
    return max(0, int(monto_cobrado // pesos_por_punto()))


def _cliente_bloqueado(db: Session, cliente_id: int) -> ClienteFidelizacionModel | None:
    return db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id).with_for_update(),
    ).scalar_one_or_none()


def acumular_puntos(db: Session, cliente_id: int, monto_cobrado: float) -> int:
    """Suma los puntos de una compra al cliente y retorna los puntos otorgados."""
    cliente = _cliente_bloqueado(db, cliente_id)
    if cliente is None or not cliente.activo:
        raise HTTPException(status_code=400, detail="El cliente de fidelizacion no existe o esta desactivado")
    puntos = puntos_por_monto(monto_cobrado)
    cliente.puntos_acumulados = int(cliente.puntos_acumulados) + puntos
    return puntos


def revertir_puntos(db: Session, cliente_id: int | None, puntos: int) -> None:
    """Quita los puntos otorgados por una venta que se elimina (sin bajar de cero)."""
    if cliente_id is None or puntos <= 0:
        return
    cliente = _cliente_bloqueado(db, cliente_id)
    if cliente is not None:
        cliente.puntos_acumulados = max(0, int(cliente.puntos_acumulados) - puntos)


def canjear_puntos(db: Session, cliente_id: int, puntos: int) -> float:
    """Descuenta puntos del cliente y retorna el descuento en pesos que valen."""
    cliente = _cliente_bloqueado(db, cliente_id)
    if cliente is None or not cliente.activo:
        raise HTTPException(status_code=400, detail="El cliente de fidelizacion no existe o esta desactivado")
    if int(cliente.puntos_acumulados) < umbral_bono():
        raise HTTPException(status_code=400, detail="El cliente aun no alcanza los puntos minimos para canjear")
    if puntos > int(cliente.puntos_acumulados):
        raise HTTPException(status_code=400, detail="El cliente no tiene tantos puntos")
    cliente.puntos_acumulados = int(cliente.puntos_acumulados) - puntos
    return float(puntos * valor_punto())


def revertir_puntos_de_venta(db: Session, venta) -> None:
    """Deshace los puntos de una venta: quita los ganados y devuelve los canjeados (sin bajar de cero)."""
    if venta.cliente_fidelizacion_id is None:
        return
    delta = int(venta.puntos_canjeados or 0) - int(venta.puntos_otorgados or 0)
    if delta == 0:
        return
    cliente = _cliente_bloqueado(db, venta.cliente_fidelizacion_id)
    if cliente is not None:
        cliente.puntos_acumulados = max(0, int(cliente.puntos_acumulados) + delta)
