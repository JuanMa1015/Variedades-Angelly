"""Utilidades para revocar refresh tokens (rotacion y logout)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import RefreshTokenBlacklistModel


def blacklist_jti(db: Session, jti: str, expires_at_epoch: int) -> None:
    """Registra el JTI de un refresh token hasta su expiracion original."""
    if not jti:
        return

    expires_naive = datetime.fromtimestamp(expires_at_epoch, tz=timezone.utc).replace(tzinfo=None)

    existing = db.get(RefreshTokenBlacklistModel, jti)
    if existing is not None:
        return

    db.add(RefreshTokenBlacklistModel(jti=jti, expires_at=expires_naive))
    db.commit()


def is_jti_blacklisted(db: Session, jti: str) -> bool:
    """Indica si el JTI ya fue utilizado o revocado."""
    if not jti:
        return False

    statement = select(RefreshTokenBlacklistModel.jti).where(
        RefreshTokenBlacklistModel.jti == jti,
    )
    return db.execute(statement).scalar_one_or_none() is not None
