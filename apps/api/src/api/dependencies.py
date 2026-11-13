"""Dependencias compartidas de autenticacion y autorizacion para la API."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.security import decode_access_token
from src.infrastructure.database.connection import get_db
from src.auth.sesiones import sesion_revocada
from src.infrastructure.database.models import UsuarioModel


class AuthenticatedUser(BaseModel):
    """Representa al usuario autenticado extraido del JWT."""

    username: str
    role: str


security_scheme = HTTPBearer(auto_error=False)


def _normalize_role(role_value: object) -> str:
    normalized = str(role_value or "").lower().strip()
    if normalized == "superadmin":
        return "superadmin"
    if normalized == "admin":
        return "admin"
    if normalized == "vendedor":
        return "vendedor"
    return ""


def _extract_token(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str | None:
    """Prioriza el header Bearer explicito; si no hay, usa la cookie httpOnly."""
    if credentials is not None and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    return request.cookies.get("access_token")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(security_scheme),
    # Sesion propia (use_cache=False): la consulta de identidad no debe abrir una
    # transaccion en la sesion del endpoint, que usa `with db.begin()`.
    auth_db: Session = Depends(get_db, use_cache=False),
) -> AuthenticatedUser:
    """Valida JWT Bearer o cookie httpOnly y retorna usuario autenticado."""
    token = _extract_token(request, credentials)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticacion requerido",
        )

    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado",
        )

    token_type = str(payload.get("type") or "").strip()
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de token invalido",
        )

    username = str(payload.get("sub") or "").strip()
    role = _normalize_role(payload.get("role"))

    if not username or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o incompleto",
        )

    # El token solo prueba identidad: usuario existente, activo y rol vigente salen de la BD,
    # para que desactivar, borrar o cambiar de rol a alguien surta efecto de inmediato.
    usuario = auth_db.execute(
        select(UsuarioModel.activo, UsuarioModel.rol, UsuarioModel.sesiones_desde).where(UsuarioModel.username == username),
    ).one_or_none()
    auth_db.rollback()  # termina la transaccion de lectura y libera la conexion
    current_role = _normalize_role(usuario.rol) if usuario is not None else ""
    if usuario is None or not usuario.activo or not current_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o inexistente",
        )
    if sesion_revocada(usuario.sesiones_desde, payload.get("iat")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion cerrada: vuelve a iniciar sesion",
        )

    return AuthenticatedUser(username=username, role=current_role)


def require_roles(*roles: str):
    """Crea dependencia para restringir acceso por rol."""
    allowed_roles = {_normalize_role(role) for role in roles if _normalize_role(role)}

    def _dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        if current_user.role == "superadmin":
            return current_user

        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para esta operacion",
            )
        return current_user

    return _dependency


