"""Reglas del programa de fidelizacion: acumulacion de puntos por compras."""

from __future__ import annotations

import os

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import ClienteFidelizacionModel

UMBRAL_BONO_DEFECTO = 100
PESOS_POR_PUNTO_DEFECTO = 1000


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
