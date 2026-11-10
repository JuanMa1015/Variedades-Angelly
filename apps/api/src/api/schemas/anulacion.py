"""Entrada compartida para anular ventas y abonos."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class AnularRequest(BaseModel):
    """Motivo obligatorio; quien no es administrador ademas necesita la clave de uno."""

    motivo: Annotated[str, Field(min_length=3, max_length=200)]
    autorizador_usuario: Annotated[str | None, Field(max_length=50)] = None
    autorizador_password: Annotated[str | None, Field(max_length=128)] = None
