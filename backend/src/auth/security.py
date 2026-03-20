"""Utilidades de seguridad para autenticacion con JWT y hashing de contrasenas."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import bcrypt  # type: ignore[import-not-found]
import jwt  # type: ignore[import-not-found]
from jwt import InvalidTokenError  # type: ignore[import-not-found]

JWT_ALGORITHM = "HS256"
DEFAULT_JWT_EXPIRE_MINUTES = 60 * 8


def _jwt_secret_key() -> str:
    """Retorna la llave JWT desde entorno con fallback de desarrollo."""
    return os.getenv("JWT_SECRET_KEY", "angelly-dev-secret-change-me")


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
    }

    token = jwt.encode(payload, _jwt_secret_key(), algorithm=JWT_ALGORITHM)
    return token, int(expire_delta.total_seconds())


def decode_access_token(token: str) -> dict[str, object] | None:
    """Decodifica un JWT y retorna payload; None si es invalido."""
    try:
        return jwt.decode(token, _jwt_secret_key(), algorithms=[JWT_ALGORITHM])
    except InvalidTokenError:
        return None
