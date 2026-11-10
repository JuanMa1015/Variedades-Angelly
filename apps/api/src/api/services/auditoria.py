"""Registro automatico de auditoria para acciones sensibles.

El usuario siempre sale del token validado (nunca del cuerpo de la peticion) y la fila
se agrega a la sesion del llamador: queda en la misma transaccion que el cambio.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from src.infrastructure.database.models import AuditoriaModel


def registrar_auditoria(
    db: Session,
    *,
    usuario: str,
    modulo: str,
    entidad: str,
    accion: str,
    entidad_id: int | None = None,
    detalle: str | None = None,
) -> None:
    db.add(
        AuditoriaModel(
            modulo=modulo[:50],
            entidad=entidad[:80],
            entidad_id=entidad_id,
            accion=accion[:30],
            detalle=detalle[:500] if detalle else None,
            usuario=usuario[:50],
        ),
    )
