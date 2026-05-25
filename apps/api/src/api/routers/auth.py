"""Router de autenticacion de usuarios."""

from __future__ import annotations

import os
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.services.vendedor import (
    create_vendedor as _create_vendedor,
    delete_vendedor as _delete_vendedor,
    list_vendedores as _list_vendedores,
    update_vendedor as _update_vendedor,
)
from src.auth.bootstrap import ensure_default_auth_users
from src.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    refresh_expire_days,
    verify_password,
)
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import UsuarioModel
from src.api.limiter import limiter, login_rate_limit

router = APIRouter(tags=["auth"])


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
    """Respuesta con nuevo access token."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class VendedorUsuarioResponse(BaseModel):
    """Salida administrativa para cuentas de vendedores."""

    id: int
    username: str
    rol: str


class VendedorUsuarioCreateRequest(BaseModel):
    """Entrada para crear trabajador/vendedor con credenciales."""

    username: Annotated[str, Field(min_length=3, max_length=50)]
    password: Annotated[str, Field(min_length=6, max_length=128)]
    rol: Literal["vendedor"] = "vendedor"


class VendedorUsuarioUpdateRequest(BaseModel):
    """Entrada para actualizar credenciales de vendedor."""

    username: Annotated[str | None, Field(min_length=3, max_length=50)] = None
    password: Annotated[str | None, Field(min_length=6, max_length=128)] = None


@router.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit(login_rate_limit())
def auth_login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """Autentica credenciales y retorna JWT firmado con rol."""
    ensure_default_auth_users(db)

    usuario = db.execute(
        select(UsuarioModel).where(UsuarioModel.username == payload.username),
    ).scalar_one_or_none()

    if usuario is None or not verify_password(payload.password, usuario.password_hash):
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

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=os.getenv("APP_ENV") != "development",
        max_age=refresh_expires,
        path="/api/auth",
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
) -> RefreshResponse:
    """Valida refresh token (desde httpOnly cookie) y emite un nuevo access token."""
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

    username = str(decoded.get("sub", ""))
    role = str(decoded.get("role", ""))
    if not username or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido",
        )

    new_token, expires_in = create_access_token(username=username, role=role)
    return RefreshResponse(
        access_token=new_token,
        expires_in=expires_in,
    )


@router.get("/api/usuarios/vendedores", response_model=list[VendedorUsuarioResponse])
def list_vendedores(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> list[VendedorUsuarioResponse]:
    return [VendedorUsuarioResponse(**u) for u in _list_vendedores(db)]


@router.post("/api/usuarios/vendedores", response_model=VendedorUsuarioResponse, status_code=201)
def create_vendedor(
    payload: VendedorUsuarioCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> VendedorUsuarioResponse:
    return VendedorUsuarioResponse(**_create_vendedor(payload.username, payload.password, db))


@router.patch("/api/usuarios/vendedores/{usuario_id}", response_model=VendedorUsuarioResponse)
def update_vendedor(
    usuario_id: int,
    payload: VendedorUsuarioUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> VendedorUsuarioResponse:
    return VendedorUsuarioResponse(**_update_vendedor(usuario_id, payload.username, payload.password, db))


@router.delete("/api/usuarios/vendedores/{usuario_id}", status_code=204)
def delete_vendedor(
    usuario_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> None:
    _delete_vendedor(usuario_id, db)
