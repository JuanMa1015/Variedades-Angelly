"""Router de autenticacion de usuarios."""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from src.auth.sesiones import sesion_revocada
from src.auth.token_blacklist import blacklist_jti, claim_jti, is_jti_blacklisted
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import UsuarioModel
from src.api.limiter import limiter, login_rate_limit

router = APIRouter(tags=["auth"])

_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing-equalization")


def _is_production() -> bool:
    return os.getenv("APP_ENV", "development").strip().lower() == "production"


def _cookie_samesite() -> str:
    """SameSite de las cookies de sesion.

    Por defecto ``none`` en produccion (front en otro dominio, p. ej. Vercel) y ``lax`` en
    desarrollo. Si front y API comparten dominio (nginx) conviene fijar ``COOKIE_SAMESITE=lax``:
    evita depender de cookies de terceros, que Safari y Chrome bloquean.
    """
    configured = os.getenv("COOKIE_SAMESITE", "").strip().lower()
    if configured in {"lax", "strict", "none"}:
        return configured
    return "none" if _is_production() else "lax"


def _session_cookie_options() -> dict[str, object]:
    samesite = _cookie_samesite()
    return {"httponly": True, "samesite": samesite, "secure": _is_production() or samesite == "none"}


def _set_access_token_cookie(response: Response, token: str, expires_in: int) -> None:
    response.set_cookie(key="access_token", value=token, max_age=expires_in, path="/", **_session_cookie_options())


class LoginRequest(BaseModel):
    """Credenciales de acceso para autenticacion de usuarios."""

    username: Annotated[str, Field(min_length=3, max_length=50)]
    password: Annotated[str, Field(min_length=6, max_length=128)]


class LoginResponse(BaseModel):
    """Respuesta de autenticacion con token JWT."""

    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    expires_in: int


class RefreshResponse(BaseModel):
    """Respuesta con nuevo access token e identidad del usuario (restaura sesion al recargar)."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str
    username: str


@router.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit(login_rate_limit())
def auth_login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """Autentica credenciales y retorna JWT firmado con rol."""
    usuario = db.execute(
        select(UsuarioModel).where(UsuarioModel.username == payload.username),
    ).scalar_one_or_none()

    # Siempre se ejecuta bcrypt (hash falso si el usuario no existe) para que el tiempo de
    # respuesta no revele si el username existe.
    password_hash = usuario.password_hash if usuario is not None else _DUMMY_PASSWORD_HASH
    password_ok = verify_password(payload.password, password_hash)
    if usuario is None or not password_ok or not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales invalidas",
        )

    normalized_role = str(usuario.rol or "").lower().strip()
    if normalized_role not in {"superadmin", "admin", "vendedor"}:
        normalized_role = "vendedor"

    role = normalized_role
    token, expires_in = create_access_token(username=usuario.username, role=role)
    refresh_token, refresh_expires = create_refresh_token(username=usuario.username, role=role)

    _set_access_token_cookie(response, token, expires_in)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=refresh_expires,
        path="/api/auth",
        **_session_cookie_options(),
    )

    return LoginResponse(
        access_token=token,
        role=role,
        username=usuario.username,
        expires_in=expires_in,
    )


@router.post("/api/auth/refresh", response_model=RefreshResponse)
@limiter.limit("20/minute")
def auth_refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> RefreshResponse:
    """Valida refresh token (desde httpOnly cookie) y emite un nuevo access token.

    Rota el refresh token: el JTI usado queda en blacklist (deteccion de reuso).
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token no encontrado",
        )

    decoded = decode_access_token(refresh_token)
    if decoded is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido o expirado",
        )

    token_type = str(decoded.get("type", "")).strip()
    if token_type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de token incorrecto",
        )

    jti = str(decoded.get("jti", "")).strip()
    expires_at = decoded.get("exp")
    username = str(decoded.get("sub", ""))
    if not jti or not isinstance(expires_at, int) or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido",
        )

    if is_jti_blacklisted(db, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revocado",
        )

    # El refresh dura 30 dias: el usuario y su rol se revalidan contra la BD, no contra el token.
    usuario = db.execute(
        select(UsuarioModel).where(UsuarioModel.username == username),
    ).scalar_one_or_none()
    role = str(usuario.rol or "").lower().strip() if usuario is not None else ""
    if usuario is None or not usuario.activo or role not in {"superadmin", "admin", "vendedor"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o inexistente",
        )
    if sesion_revocada(usuario.sesiones_desde, decoded.get("iat")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion cerrada: vuelve a iniciar sesion",
        )

    # Consumo atomico del JTI: si dos requests llegan a la vez solo uno continua.
    if not claim_jti(db, jti, expires_at):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revocado",
        )

    new_token, expires_in = create_access_token(username=username, role=role)
    new_refresh_token, refresh_expires = create_refresh_token(username=username, role=role)

    _set_access_token_cookie(response, new_token, expires_in)
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        max_age=refresh_expires,
        path="/api/auth",
        **_session_cookie_options(),
    )
    return RefreshResponse(
        access_token=new_token,
        expires_in=expires_in,
        role=role,
        username=username,
    )


@router.post("/api/auth/logout")
@limiter.limit("20/minute")
def auth_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Revoca el refresh token actual (blacklist por JTI) y limpia cookies."""
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        decoded = decode_access_token(refresh_token)
        if decoded is not None and str(decoded.get("type", "")).strip() == "refresh":
            jti = str(decoded.get("jti", "")).strip()
            expires_at = decoded.get("exp")
            if jti and isinstance(expires_at, int):
                blacklist_jti(db, jti, expires_at)

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth")
    return {"detail": "Sesion cerrada"}
