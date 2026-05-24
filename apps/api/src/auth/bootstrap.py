"""Semillas de usuarios por defecto para autenticacion."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.security import hash_password
from src.infrastructure.database.models import UsuarioModel


def _is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on", "si"}


def _bootstrap_enabled() -> bool:
    """Controla bootstrap de usuarios via entorno para evitar seeds en produccion."""
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    raw_toggle = os.getenv("AUTH_BOOTSTRAP_ENABLED")

    if raw_toggle is None:
        return app_env in {"development", "dev", "test", "testing"}
    return _is_truthy(raw_toggle)


def _default_auth_users() -> tuple[dict[str, str], ...]:
    """Carga usuarios semilla desde variables de entorno."""
    current_file = Path(__file__).resolve()
    backend_root = current_file.parents[2]

    for parent in (backend_root, *backend_root.parents):
        candidate = parent / ".env"
        if candidate.exists():
            load_dotenv(dotenv_path=candidate, override=False)
            break

    superadmin_username = os.getenv("AUTH_SUPERADMIN_USERNAME", "").strip()
    superadmin_password = os.getenv("AUTH_SUPERADMIN_PASSWORD", "").strip()
    admin_username = os.getenv("AUTH_ADMIN_USERNAME", "").strip()
    admin_password = os.getenv("AUTH_ADMIN_PASSWORD", "").strip()
    seller_username = os.getenv("AUTH_SELLER_USERNAME", "").strip()
    seller_password = os.getenv("AUTH_SELLER_PASSWORD", "").strip()

    users: list[dict[str, str]] = []

    if superadmin_username and superadmin_password:
        users.append(
            {
                "username": superadmin_username,
                "password": superadmin_password,
                "rol": "superadmin",
            },
        )

    if admin_username and admin_password:
        users.append(
            {
                "username": admin_username,
                "password": admin_password,
                "rol": "admin",
            },
        )

    if seller_username and seller_password:
        users.append(
            {
                "username": seller_username,
                "password": seller_password,
                "rol": "vendedor",
            },
        )

    return tuple(users)


def ensure_default_auth_users(db: Session) -> None:
    """Crea usuarios base de autenticacion si no existen."""
    if not _bootstrap_enabled():
        return

    seed_users = _default_auth_users()
    if not seed_users:
        return

    inserted_any = False

    for seed_user in seed_users:
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
