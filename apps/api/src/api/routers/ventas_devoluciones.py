"""Devolucion parcial de productos de una venta de la tienda (la autoriza un administrador)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.limiter import limiter, login_rate_limit
from src.api.routers.ventas_fidelizacion import _build_venta_responses
from src.api.schemas.anulacion import AnularRequest
from src.api.schemas.cartera import VentaResponse
from src.api.services.anulacion import quien_autoriza
from src.api.services.devoluciones import devolver_productos
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import VentaModel

router = APIRouter(tags=["ventas-devoluciones"])


class DevolucionItemRequest(BaseModel):
    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0, le=100000)]


class DevolverRequest(AnularRequest):
    """Productos y cantidades a devolver, con el motivo y la autorizacion de un administrador."""

    items: Annotated[list[DevolucionItemRequest], Field(min_length=1, max_length=200)]


@router.post("/api/ventas/{venta_id}/devoluciones", response_model=VentaResponse, status_code=201)
@limiter.limit(login_rate_limit())
def devolver_productos_endpoint(
    request: Request,
    venta_id: int,
    payload: DevolverRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> VentaResponse:
    """Devuelve productos de una venta: vuelven al stock y se devuelve el dinero por el mismo medio de pago."""
    with db.begin():
        autorizado_por = quien_autoriza(
            db, current_user, payload.autorizador_usuario, payload.autorizador_password, accion="Una devolucion",
        )
        devolver_productos(
            db,
            venta_id,
            payload.items,
            solicitante=current_user.username,
            autorizado_por=autorizado_por,
            motivo=payload.motivo.strip(),
        )
        db.flush()
        venta = db.get(VentaModel, venta_id)
        return _build_venta_responses([venta], db)[0]
