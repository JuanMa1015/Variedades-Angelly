"""Router de autenticacion de usuarios."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.auth.bootstrap import ensure_default_auth_users
from src.auth.security import create_access_token, hash_password, verify_password
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

    normalized_role = str(usuario.rol or "").lower().strip()
    if normalized_role not in {"superadmin", "admin", "vendedor"}:
        normalized_role = "vendedor"

    role = normalized_role
    token, expires_in = create_access_token(username=usuario.username, role=role)

    return LoginResponse(
        access_token=token,
        role=role,
        username=usuario.username,
        expires_in=expires_in,
    )


@router.get("/api/usuarios/vendedores", response_model=list[VendedorUsuarioResponse])
def list_vendedores(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> list[VendedorUsuarioResponse]:
    usuarios = db.execute(
        select(UsuarioModel)
        .where(UsuarioModel.rol == "vendedor")
        .order_by(UsuarioModel.username.asc()),
    ).scalars().all()

    return [
        VendedorUsuarioResponse(
            id=user.id,
            username=user.username,
            rol=user.rol,
        )
        for user in usuarios
    ]


@router.post("/api/usuarios/vendedores", response_model=VendedorUsuarioResponse, status_code=201)
def create_vendedor(
    payload: VendedorUsuarioCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> VendedorUsuarioResponse:
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username requerido")

    existente = db.execute(
        select(UsuarioModel).where(UsuarioModel.username == username),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese username")

    usuario = UsuarioModel(
        username=username,
        password_hash=hash_password(payload.password),
        rol="vendedor",
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)

    return VendedorUsuarioResponse(id=usuario.id, username=usuario.username, rol=usuario.rol)


@router.patch("/api/usuarios/vendedores/{usuario_id}", response_model=VendedorUsuarioResponse)
def update_vendedor(
    usuario_id: int,
    payload: VendedorUsuarioUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> VendedorUsuarioResponse:
    usuario = db.execute(
        select(UsuarioModel).where(
            UsuarioModel.id == usuario_id,
            UsuarioModel.rol == "vendedor",
        ),
    ).scalar_one_or_none()
    if usuario is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")

    if payload.username is not None:
        next_username = payload.username.strip()
        if not next_username:
            raise HTTPException(status_code=400, detail="Username invalido")

        existe_username = db.execute(
            select(UsuarioModel).where(
                UsuarioModel.username == next_username,
                UsuarioModel.id != usuario_id,
            ),
        ).scalar_one_or_none()
        if existe_username is not None:
            raise HTTPException(status_code=409, detail="Ya existe un usuario con ese username")

        usuario.username = next_username

    if payload.password is not None:
        usuario.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(usuario)
    return VendedorUsuarioResponse(id=usuario.id, username=usuario.username, rol=usuario.rol)


@router.delete("/api/usuarios/vendedores/{usuario_id}", status_code=204)
def delete_vendedor(
    usuario_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> None:
    usuario = db.execute(
        select(UsuarioModel).where(
            UsuarioModel.id == usuario_id,
            UsuarioModel.rol == "vendedor",
        ),
    ).scalar_one_or_none()
    if usuario is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")

    db.delete(usuario)
    db.commit()
