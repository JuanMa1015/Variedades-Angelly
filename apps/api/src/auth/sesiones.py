"""Cerrar sesiones abiertas: un token emitido antes de ``sesiones_desde`` ya no sirve."""

from __future__ import annotations

from datetime import UTC, datetime


def ahora_sin_zona() -> datetime:
    """Como se guardan las fechas: UTC sin zona."""
    return datetime.now(UTC).replace(tzinfo=None)


def sesion_revocada(sesiones_desde: datetime | None, emitido_en: object) -> bool:
    """True si el token (``iat`` en segundos) se emitio antes o en el mismo segundo en que se cerraron las sesiones.

    El mismo segundo cuenta como revocado: un token de ese instante no se distingue de uno anterior. Quien vuelve a
    entrar un segundo despues de que le cambiaron la clave ya recibe un token valido.
    """
    if sesiones_desde is None:
        return False
    if not isinstance(emitido_en, (int, float)):
        return True  # un token sin fecha de emision no se puede comparar: se rechaza
    limite = int(sesiones_desde.replace(tzinfo=UTC).timestamp())
    return int(emitido_en) <= limite
