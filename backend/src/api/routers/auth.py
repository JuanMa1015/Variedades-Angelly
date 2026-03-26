"""Router de autenticacion de usuarios."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.bootstrap import ensure_default_auth_users
from src.auth.security import create_access_token, verify_password
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import UsuarioModel

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


@router.post("/api/auth/login", response_model=LoginResponse)
def auth_login(
    payload: LoginRequest,
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

    role = "admin" if str(usuario.rol).lower() == "admin" else "vendedor"
    token, expires_in = create_access_token(username=usuario.username, role=role)

    return LoginResponse(
        access_token=token,
        role=role,
        username=usuario.username,
        expires_in=expires_in,
    )
