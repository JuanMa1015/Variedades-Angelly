"""Politica de contrasenas: deteccion de credenciales filtradas (HIBP k-anonymity)."""

from __future__ import annotations

import hashlib
import os

import httpx

_HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/"
_REQUEST_TIMEOUT_SECONDS = 2.0

_TRUTHY = {"1", "true", "yes", "on", "si"}


def _check_enabled() -> bool:
    env = os.getenv("APP_ENV", "development").strip().lower()
    if env == "test":
        return False

    raw_toggle = os.getenv("PWNED_PASSWORD_CHECK", "").strip().lower()
    if not raw_toggle:
        return True
    return raw_toggle in _TRUTHY


def ensure_password_not_pwned(password: str) -> None:
    """Valida contra HIBP usando k-anonymity (solo se envian 5 chars del SHA-1).

    Fail-open: si el servicio no esta disponible, permite continuar.
    Lanza ValueError si la contrasena aparece en filtraciones conocidas.
    """
    if not _check_enabled():
        return

    digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]

    try:
        response = httpx.get(
            f"{_HIBP_RANGE_URL}{prefix}",
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        pwned = any(
            line.strip().split(":", 1)[0] == suffix
            for line in response.text.splitlines()
            if ":" in line
        )
    except Exception:
        return

    if pwned:
        raise ValueError(
            "La contrasena aparece en filtraciones conocidas. Por favor elige otra.",
        )
