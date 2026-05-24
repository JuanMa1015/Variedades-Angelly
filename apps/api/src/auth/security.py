"""Utilidades de seguridad para autenticacion con JWT y hashing de contrasenas."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import bcrypt  # type: ignore[import-not-found]
import jwt  # type: ignore[import-not-found]
from jwt import InvalidTokenError  # type: ignore[import-not-found]

JWT_ALGORITHM = "HS256"
DEFAULT_JWT_EXPIRE_MINUTES = 60 * 8
DEFAULT_REFRESH_EXPIRE_DAYS = 30


def _jwt_secret_key() -> str:
    """Retorna la llave JWT desde entorno y falla si no existe."""
    secret = os.getenv("JWT_SECRET_KEY", "").strip()
    if not secret:
        raise RuntimeError(
            "JWT_SECRET_KEY no esta definido. Configuralo antes de iniciar la API.",
        )
    return secret


def token_expire_minutes() -> int:
    """Obtiene minutos de expiracion del token desde entorno."""
    raw_value = os.getenv("JWT_EXPIRE_MINUTES")
    if not raw_value:
        return DEFAULT_JWT_EXPIRE_MINUTES

    try:
        parsed = int(raw_value)
    except ValueError:
        return DEFAULT_JWT_EXPIRE_MINUTES

    return max(15, parsed)


def refresh_expire_days() -> int:
    """Obtiene dias de expiracion del refresh token desde entorno."""
    raw_value = os.getenv("JWT_REFRESH_EXPIRE_DAYS")
    if not raw_value:
        return DEFAULT_REFRESH_EXPIRE_DAYS

    try:
        parsed = int(raw_value)
    except ValueError:
        return DEFAULT_REFRESH_EXPIRE_DAYS

    return max(1, parsed)


def hash_password(plain_password: str) -> str:
    """Genera hash bcrypt para contrasena en texto plano."""
    encoded = plain_password.encode("utf-8")
    hashed = bcrypt.hashpw(encoded, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verifica contrasena con hash bcrypt persistido."""
    if not password_hash:
        return False

    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False


def create_access_token(username: str, role: str) -> tuple[str, int]:
    """Crea un JWT firmado y retorna token junto a su expiracion en segundos."""
    now = datetime.now(timezone.utc)
    expire_delta = timedelta(minutes=token_expire_minutes())
    expires_at = now + expire_delta

    payload = {
        "sub": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "type": "access",
    }

    token = jwt.encode(payload, _jwt_secret_key(), algorithm=JWT_ALGORITHM)
    return token, int(expire_delta.total_seconds())


def create_refresh_token(username: str, role: str) -> tuple[str, int]:
    """Crea un refresh token de larga duracion."""
    now = datetime.now(timezone.utc)
    expire_delta = timedelta(days=refresh_expire_days())
    expires_at = now + expire_delta

    payload = {
        "sub": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "type": "refresh",
    }

    token = jwt.encode(payload, _jwt_secret_key(), algorithm=JWT_ALGORITHM)
    return token, int(expire_delta.total_seconds())


def decode_access_token(token: str) -> dict[str, object] | None:
    """Decodifica un JWT y retorna payload; None si es invalido."""
    try:
        return jwt.decode(token, _jwt_secret_key(), algorithms=[JWT_ALGORITHM])
    except InvalidTokenError:
        return None
