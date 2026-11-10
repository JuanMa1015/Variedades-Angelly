"""Zona horaria del negocio.

La base guarda las fechas en UTC (sin zona). El dia del negocio, en cambio, empieza y termina
a medianoche *hora local*: una venta de las 8 p. m. en Colombia es del dia de hoy aunque en UTC
ya sea "manana". Colombia no tiene horario de verano, asi que basta un desfase fijo.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta, timezone

DESFASE_POR_DEFECTO_HORAS = -5  # Colombia (UTC-5)
DESFASE_MINIMO_HORAS = -12
DESFASE_MAXIMO_HORAS = 14


def zona_negocio() -> timezone:
    """Zona del negocio; se puede cambiar con ``APP_UTC_OFFSET_HOURS``."""
    crudo = os.getenv("APP_UTC_OFFSET_HOURS", "").strip()
    try:
        horas = int(crudo) if crudo else DESFASE_POR_DEFECTO_HORAS
    except ValueError:
        horas = DESFASE_POR_DEFECTO_HORAS
    horas = max(DESFASE_MINIMO_HORAS, min(DESFASE_MAXIMO_HORAS, horas))
    return timezone(timedelta(hours=horas))


def a_utc_naive(valor: datetime) -> datetime:
    """Convierte una fecha con zona a UTC sin zona (como se guarda en la base)."""
    if valor.tzinfo is None:
        return valor
    return valor.astimezone(UTC).replace(tzinfo=None)


def inicio_del_dia_local(ahora: datetime) -> datetime:
    """Medianoche (hora del negocio) del dia al que pertenece ``ahora``; con zona."""
    local = ahora.astimezone(zona_negocio())
    return local.replace(hour=0, minute=0, second=0, microsecond=0)
