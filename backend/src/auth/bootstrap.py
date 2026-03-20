"""Semillas de usuarios por defecto para autenticacion."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.security import hash_password
from src.infrastructure.database.models import UsuarioModel

DEFAULT_AUTH_USERS: tuple[dict[str, str], ...] = (
    {
        "username": "angelly_admin",
        "password": "cambiame123",
        "rol": "admin",
    },
    {
        "username": "vendedor1",
        "password": "ventas123",
        "rol": "vendedor",
    },
)


def ensure_default_auth_users(db: Session) -> None:
    """Crea usuarios base de autenticacion si no existen."""
    inserted_any = False

    for seed_user in DEFAULT_AUTH_USERS:
        existing = db.execute(
            select(UsuarioModel).where(UsuarioModel.username == seed_user["username"]),
        ).scalar_one_or_none()

        if existing is not None:
            continue

        db.add(
            UsuarioModel(
                username=seed_user["username"],
                password_hash=hash_password(seed_user["password"]),
                rol=seed_user["rol"],
            ),
        )
        inserted_any = True

    if inserted_any:
        db.commit()
