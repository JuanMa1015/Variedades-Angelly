"""Dependencias compartidas de autenticacion y autorizacion para la API."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from src.auth.security import decode_access_token


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


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security_scheme),
) -> AuthenticatedUser:
    """Valida JWT Bearer y retorna usuario autenticado."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticacion requerido",
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado",
        )

    username = str(payload.get("sub") or "").strip()
    role = _normalize_role(payload.get("role"))

    if not username or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o incompleto",
        )

    return AuthenticatedUser(username=username, role=role)


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
