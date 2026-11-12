"""Usuarios del sistema (admins y vendedores): crear, editar, desactivar, reactivar y cerrar sesiones.

Un usuario no se borra: se desactiva, y todo lo que hizo sigue a su nombre en las auditorias. Cambiar su clave o
su nombre, o desactivarlo, cierra las sesiones que tuviera abiertas. Todo queda en la auditoria con el detalle.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.services.auditoria import registrar_auditoria
from src.auth.password_policy import ensure_password_not_pwned
from src.auth.security import hash_password
from src.auth.sesiones import ahora_sin_zona
from src.infrastructure.database.models import UsuarioModel

ROLES = {"vendedor": "Vendedor", "admin": "Admin"}


def _como_dict(usuario: UsuarioModel) -> dict[str, Any]:
    return {"id": usuario.id, "username": usuario.username, "rol": usuario.rol, "activo": bool(usuario.activo)}


def _buscar(db: Session, rol: str, usuario_id: int) -> UsuarioModel:
    usuario = db.execute(
        select(UsuarioModel).where(UsuarioModel.id == usuario_id, UsuarioModel.rol == rol).with_for_update(),
    ).scalar_one_or_none()
    if usuario is None:
        raise HTTPException(status_code=404, detail=f"{ROLES[rol]} no encontrado")
    return usuario


def _username_limpio(valor: str) -> str:
    username = valor.strip()
    if len(username) < 3 or any(c.isspace() for c in username):
        raise HTTPException(status_code=400, detail="El usuario debe tener al menos 3 caracteres y no llevar espacios")
    return username


def _exigir_username_libre(db: Session, username: str, excluir_id: int | None = None) -> None:
    """Dos usuarios no pueden llamarse igual aunque cambien mayusculas ('Ana' y 'ana')."""
    consulta = select(UsuarioModel.id).where(func.lower(UsuarioModel.username) == username.lower())
    if excluir_id is not None:
        consulta = consulta.where(UsuarioModel.id != excluir_id)
    if db.execute(consulta.limit(1)).first() is not None:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese username")


def _auditar(db: Session, actor: str, rol: str, usuario: UsuarioModel, accion: str, detalle: str) -> None:
    registrar_auditoria(db, usuario=actor, modulo="usuarios", entidad=rol, accion=accion, entidad_id=usuario.id, detalle=detalle)


def listar(db: Session, rol: str) -> list[dict[str, Any]]:
    usuarios = db.execute(select(UsuarioModel).where(UsuarioModel.rol == rol).order_by(UsuarioModel.username.asc())).scalars().all()
    return [_como_dict(u) for u in usuarios]


def crear(db: Session, rol: str, username: str, password: str, actor: str) -> dict[str, Any]:
    nombre = _username_limpio(username)
    ensure_password_not_pwned(password)
    _exigir_username_libre(db, nombre)
    usuario = UsuarioModel(username=nombre, password_hash=hash_password(password), rol=rol)
    db.add(usuario)
    db.flush()
    _auditar(db, actor, rol, usuario, "crear", f"Creado {rol} {usuario.username}")
    db.commit()
    db.refresh(usuario)
    return _como_dict(usuario)


def editar(db: Session, rol: str, usuario_id: int, username: str | None, password: str | None, actor: str) -> dict[str, Any]:
    usuario = _buscar(db, rol, usuario_id)
    cambios: list[str] = []

    if username is not None and username.strip() != usuario.username:
        nuevo = _username_limpio(username)
        _exigir_username_libre(db, nuevo, excluir_id=usuario_id)
        cambios.append(f"usuario '{usuario.username}' -> '{nuevo}'")
        usuario.username = nuevo
    if password is not None:
        ensure_password_not_pwned(password)
        usuario.password_hash = hash_password(password)
        cambios.append("clave cambiada")

    if cambios:
        usuario.sesiones_desde = ahora_sin_zona()  # sus sesiones abiertas se cierran
        cambios.append("sesiones cerradas")
        _auditar(db, actor, rol, usuario, "editar", f"{usuario.username}: " + "; ".join(cambios))
        db.commit()
        db.refresh(usuario)
    return _como_dict(usuario)


def desactivar(db: Session, rol: str, usuario_id: int, actor: str) -> dict[str, Any]:
    usuario = _buscar(db, rol, usuario_id)
    if usuario.username == actor:
        raise HTTPException(status_code=409, detail="No puedes desactivar tu propia cuenta")
    if usuario.activo:
        usuario.activo = False
        usuario.sesiones_desde = ahora_sin_zona()
        _auditar(db, actor, rol, usuario, "desactivar", f"Desactivado {rol} {usuario.username}; sesiones cerradas")
        db.commit()
        db.refresh(usuario)
    return _como_dict(usuario)


def reactivar(db: Session, rol: str, usuario_id: int, actor: str) -> dict[str, Any]:
    usuario = _buscar(db, rol, usuario_id)
    if not usuario.activo:
        usuario.activo = True
        _auditar(db, actor, rol, usuario, "reactivar", f"Reactivado {rol} {usuario.username}")
        db.commit()
        db.refresh(usuario)
    return _como_dict(usuario)


def cerrar_sesiones(db: Session, rol: str, usuario_id: int, actor: str) -> dict[str, Any]:
    """Saca al usuario de todos sus dispositivos sin tocar su clave."""
    usuario = _buscar(db, rol, usuario_id)
    usuario.sesiones_desde = ahora_sin_zona()
    _auditar(db, actor, rol, usuario, "cerrar_sesiones", f"Sesiones cerradas de {usuario.username}")
    db.commit()
    db.refresh(usuario)
    return _como_dict(usuario)
