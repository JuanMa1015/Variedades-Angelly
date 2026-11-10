"""Router del modulo de apertura y cierre de caja."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.services.auditoria import registrar_auditoria
from src.api.services.caja_calculos import calcular_metricas, efectivo_esperado
from src.api.services.caja_movimientos import movimientos_de_turno
from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.schemas.caja import (
    ActualizarCajaRequest,
    AperturaCajaRequest,
    CajaEstadoResponse,
    CajaHistorialItemResponse,
    CierreCajaRequest,
    CierreCajaResponse,
    MovimientoCajaResponse,
)
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    CierreCajaModel,
)

router = APIRouter(tags=["caja"])


def _to_cierre_caja_response(
    cierre: CierreCajaModel,
    db: Session | None = None,
) -> CierreCajaResponse:
    esta_abierta = cierre.fecha_cierre is None
    monto_inicial = float(cierre.monto_inicial)
    efectivo = float(cierre.monto_ventas_efectivo)
    transferencia = float(cierre.monto_ventas_transferencia)
    tarjeta = float(cierre.monto_ventas_tarjeta or 0.0)
    gastos = float(cierre.monto_gastos)

    if esta_abierta and db is not None:
        # Turno abierto: se suma lo que ya quedo asociado a esta caja.
        metricas = calcular_metricas(db, cierre.id)
        efectivo += metricas.efectivo
        transferencia += metricas.transferencia
        tarjeta += metricas.tarjeta
        gastos += metricas.gastos

    saldo_esperado = efectivo_esperado(monto_inicial, efectivo, gastos)

    return CierreCajaResponse(
        id=cierre.id,
        monto_inicial=monto_inicial,
        monto_ventas_efectivo=efectivo,
        monto_ventas_transferencia=transferencia,
        monto_ventas_tarjeta=tarjeta,
        monto_gastos=gastos,
        monto_cierre=float(cierre.monto_cierre) if cierre.monto_cierre is not None else None,
        fecha_apertura=cierre.fecha_apertura,
        fecha_cierre=cierre.fecha_cierre,
        abierto_por=cierre.abierto_por,
        cerrado_por=cierre.cerrado_por,
        saldo_esperado=saldo_esperado,
        total_ingresos=efectivo + transferencia + tarjeta,
        esta_abierta=esta_abierta,
        descuadre=cierre.esperado_vs_real if cierre.esperado_vs_real is not None
                  else (float(cierre.monto_cierre) - saldo_esperado if cierre.monto_cierre is not None else None),
        observaciones=cierre.observaciones,
    )


def _es_cierre_ciego(user: AuthenticatedUser, esta_abierta: bool) -> bool:
    """El vendedor no ve el efectivo esperado hasta cerrar: cuenta a ciegas y luego se compara."""
    return user.role == "vendedor" and esta_abierta


@router.get("/api/caja/estado", response_model=CajaEstadoResponse)
def caja_estado(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> CajaEstadoResponse:
    """Retorna estado actual de la caja y ultimo cierre."""
    caja_abierta = db.execute(
        select(CierreCajaModel)
        .where(CierreCajaModel.fecha_cierre.is_(None))
        .order_by(CierreCajaModel.id.desc())
        .limit(1),
    ).scalar_one_or_none()

    ultimo_cierre = db.execute(
        select(CierreCajaModel)
        .where(CierreCajaModel.fecha_cierre.is_not(None))
        .order_by(CierreCajaModel.fecha_cierre.desc())
        .limit(1),
    ).scalar_one_or_none()

    caja_actual = _to_cierre_caja_response(caja_abierta, db=db) if caja_abierta is not None else None
    if caja_actual is not None and _es_cierre_ciego(current_user, caja_actual.esta_abierta):
        caja_actual = caja_actual.model_copy(update={"saldo_esperado": None, "descuadre": None})

    return CajaEstadoResponse(
        abierta=caja_abierta is not None,
        caja_actual=caja_actual,
        ultimo_cierre=_to_cierre_caja_response(ultimo_cierre) if ultimo_cierre is not None else None,
    )


_CAJA_YA_ABIERTA = HTTPException(
    status_code=409,
    detail="Ya hay una caja abierta. Debes cerrarla antes de abrir una nueva.",
)


def _hay_caja_abierta(db: Session) -> bool:
    return db.execute(
        select(CierreCajaModel.id).where(CierreCajaModel.fecha_cierre.is_(None)).limit(1),
    ).first() is not None


@router.post("/api/caja/apertura", response_model=CierreCajaResponse, status_code=201)
def caja_apertura(
    payload: AperturaCajaRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> CierreCajaResponse:
    """Abre la caja con un monto inicial. Rechaza si ya hay una caja abierta."""
    if _hay_caja_abierta(db):
        raise _CAJA_YA_ABIERTA

    cierre = CierreCajaModel(
        usuario=current_user.username,
        fecha_apertura=datetime.now(UTC).replace(tzinfo=None),
        monto_inicial=payload.monto_inicial,
        monto_ventas_efectivo=0.0,
        monto_ventas_transferencia=0.0,
        monto_gastos=0.0,
        monto_cierre=None,
        estado="abierta",
        abierto_por=current_user.username,
        cerrado_por=None,
    )
    db.add(cierre)
    try:
        db.commit()
    except IntegrityError as exc:
        # Otra apertura gano la carrera: el indice unico de la base solo deja un turno abierto.
        db.rollback()
        raise _CAJA_YA_ABIERTA from exc
    db.refresh(cierre)

    return _to_cierre_caja_response(cierre)


@router.post("/api/caja/cierre", response_model=CierreCajaResponse)
def caja_cierre(
    payload: CierreCajaRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> CierreCajaResponse:
    """Cierra la caja abierta. Calcula ventas/gastos del turno."""
    caja = db.execute(
        select(CierreCajaModel)
        .where(CierreCajaModel.fecha_cierre.is_(None))
        .order_by(CierreCajaModel.id.desc())
        .limit(1)
        .with_for_update(),  # dos cierres a la vez no pueden cerrar el mismo turno dos veces
    ).scalar_one_or_none()

    if caja is None:
        raise HTTPException(
            status_code=409,
            detail="No hay una caja abierta. Debes abrirla antes de cerrar.",
        )

    metricas = calcular_metricas(db, caja.id)
    caja.monto_ventas_efectivo = float(caja.monto_ventas_efectivo + metricas.efectivo)
    caja.monto_ventas_transferencia = float(caja.monto_ventas_transferencia + metricas.transferencia)
    caja.monto_ventas_tarjeta = float(caja.monto_ventas_tarjeta + metricas.tarjeta)
    caja.monto_gastos = float(caja.monto_gastos + metricas.gastos)
    caja.monto_cierre = payload.monto_cierre
    caja.observaciones = (payload.observaciones or "").strip() or caja.observaciones
    caja.fecha_cierre = datetime.now(UTC).replace(tzinfo=None)
    caja.cerrado_por = current_user.username
    caja.estado = "cerrada"
    saldo_esperado = efectivo_esperado(caja.monto_inicial, caja.monto_ventas_efectivo, caja.monto_gastos)
    caja.esperado_vs_real = float(payload.monto_cierre) - saldo_esperado

    db.commit()
    db.refresh(caja)

    return _to_cierre_caja_response(caja)


def _item_historial(c: CierreCajaModel, user: AuthenticatedUser, db: Session) -> CajaHistorialItemResponse:
    # Reusa el calculo de la caja: el turno abierto suma lo vivo, no los ceros que aun no se guardaron.
    r = _to_cierre_caja_response(c, db=db)
    return CajaHistorialItemResponse(
        id=r.id,
        fecha_apertura=r.fecha_apertura,
        fecha_cierre=r.fecha_cierre,
        abierto_por=r.abierto_por,
        cerrado_por=r.cerrado_por,
        monto_inicial=r.monto_inicial,
        monto_ventas_efectivo=r.monto_ventas_efectivo,
        monto_ventas_transferencia=r.monto_ventas_transferencia,
        monto_ventas_tarjeta=r.monto_ventas_tarjeta,
        monto_gastos=r.monto_gastos,
        monto_cierre=r.monto_cierre,
        saldo_esperado=None if _es_cierre_ciego(user, r.esta_abierta) else r.saldo_esperado,
        esta_abierta=r.esta_abierta,
        descuadre=float(c.esperado_vs_real) if c.esperado_vs_real is not None else None,
        observaciones=c.observaciones,
    )


@router.get("/api/caja", response_model=list[CajaHistorialItemResponse])
def caja_listar(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[CajaHistorialItemResponse]:
    """Lista todas las aperturas y cierres de caja."""
    cierres = db.execute(
        select(CierreCajaModel).order_by(CierreCajaModel.fecha_apertura.desc()),
    ).scalars().all()
    return [_item_historial(c, current_user, db) for c in cierres]


@router.get("/api/caja/{caja_id}/movimientos", response_model=list[MovimientoCajaResponse])
def caja_movimientos(
    caja_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
) -> list[MovimientoCajaResponse]:
    """Ventas (lo cobrado), abonos y gastos de un turno: lo que explica su efectivo esperado."""
    caja = db.get(CierreCajaModel, caja_id)
    if caja is None:
        raise HTTPException(status_code=404, detail="Registro de caja no encontrado")
    return movimientos_de_turno(db, caja)


@router.patch("/api/caja/{caja_id}", response_model=CierreCajaResponse)
def caja_actualizar(
    caja_id: int,
    payload: ActualizarCajaRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> CierreCajaResponse:
    """Actualiza un registro de caja (solo superadmin)."""
    caja = db.get(CierreCajaModel, caja_id)
    if caja is None:
        raise HTTPException(status_code=404, detail="Registro de caja no encontrado")

    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="caja",
        entidad="cierre_caja",
        accion="editar",
        entidad_id=caja.id,
        detalle=f"Campos: {update_data}",
    )
    for key, value in update_data.items():
        setattr(caja, key, value)
    if caja.monto_cierre is not None and ("monto_inicial" in update_data or "monto_cierre" in update_data):
        # El descuadre guardado debe seguir al monto corregido, no quedarse con el del cierre original.
        caja.esperado_vs_real = float(caja.monto_cierre) - efectivo_esperado(
            caja.monto_inicial, caja.monto_ventas_efectivo, caja.monto_gastos,
        )

    db.commit()
    db.refresh(caja)
    return _to_cierre_caja_response(caja)


@router.delete("/api/caja/{caja_id}", status_code=204)
def caja_eliminar(
    caja_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> None:
    """Elimina un registro de caja (solo superadmin)."""
    caja = db.get(CierreCajaModel, caja_id)
    if caja is None:
        raise HTTPException(status_code=404, detail="Registro de caja no encontrado")

    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="caja",
        entidad="cierre_caja",
        accion="eliminar",
        entidad_id=caja.id,
        detalle=f"Eliminada caja de {caja.abierto_por}",
    )
    db.delete(caja)
    db.commit()
