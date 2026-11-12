"""Cada rol maneja su propio catalogo: el vendedor la tienda y el admin la cartera. El superadmin ve los dos."""

from __future__ import annotations

from fastapi import HTTPException

from src.api.dependencies import AuthenticatedUser

CATALOGO_POR_ROL = {"vendedor": "tienda", "admin": "cartera"}


def catalogo_del_rol(usuario: AuthenticatedUser) -> str | None:
    """Catalogo al que esta limitado el usuario; None si puede ver los dos (superadmin)."""
    return CATALOGO_POR_ROL.get(str(usuario.role).lower().strip())


def resolver_catalogo(usuario: AuthenticatedUser, pedido: str | None, defecto: str = "todos") -> str:
    """Catalogo con el que se consulta: el propio del rol; pedir el ajeno es un 403, no una lista vacia."""
    propio = catalogo_del_rol(usuario)
    if propio is None:
        return pedido or defecto
    if pedido in (None, "todos", propio):
        return propio
    raise HTTPException(status_code=403, detail=f"Tu rol solo maneja el catalogo de {propio}")


def exigir_catalogo_propio(usuario: AuthenticatedUser, catalogo: str) -> None:
    """No se crea, edita, ajusta ni consulta un producto del catalogo del otro rol."""
    propio = catalogo_del_rol(usuario)
    if propio is not None and catalogo != propio:
        raise HTTPException(status_code=403, detail=f"Este producto es del catalogo de {catalogo}: tu rol solo maneja el de {propio}")
