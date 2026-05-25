"""Shared vendedor CRUD logic used by both auth.py and superadmin.py routers."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.security import hash_password
from src.infrastructure.database.models import UsuarioModel


def _validate_and_find_vendedor(usuario_id: int, db: Session) -> UsuarioModel:
    usuario = db.execute(
        select(UsuarioModel).where(
            UsuarioModel.id == usuario_id,
            UsuarioModel.rol == "vendedor",
        ),
    ).scalar_one_or_none()
    if usuario is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    return usuario


def list_vendedores(db: Session) -> list[dict[str, Any]]:
    usuarios = db.execute(
        select(UsuarioModel)
        .where(UsuarioModel.rol == "vendedor")
        .order_by(UsuarioModel.username.asc()),
    ).scalars().all()
    return [{"id": u.id, "username": u.username, "rol": u.rol} for u in usuarios]


def create_vendedor(username: str, password: str, db: Session) -> dict[str, Any]:
    username = username.strip()
    existente = db.execute(
        select(UsuarioModel).where(UsuarioModel.username == username),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese username")

    usuario = UsuarioModel(
        username=username,
        password_hash=hash_password(password),
        rol="vendedor",
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return {"id": usuario.id, "username": usuario.username, "rol": usuario.rol}


def update_vendedor(
    usuario_id: int,
    username: str | None,
    password: str | None,
    db: Session,
) -> dict[str, Any]:
    usuario = _validate_and_find_vendedor(usuario_id, db)

    if username is not None:
        next_username = username.strip()
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

    if password is not None:
        usuario.password_hash = hash_password(password)

    db.commit()
    db.refresh(usuario)
    return {"id": usuario.id, "username": usuario.username, "rol": usuario.rol}


def delete_vendedor(usuario_id: int, db: Session) -> None:
    usuario = _validate_and_find_vendedor(usuario_id, db)
    db.delete(usuario)
    db.commit()
