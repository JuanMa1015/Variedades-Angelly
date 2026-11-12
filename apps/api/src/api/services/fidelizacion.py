"""Reglas del programa de fidelizacion: acumulacion de puntos por compras.

Los puntos de un cliente solo cambian a traves de ``mover_puntos``: cada cambio deja su movimiento
(cuanto, por que, quien y el saldo que quedo), igual que el stock de los productos.
"""

from __future__ import annotations

import os

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infrastructure.database.models import ClienteFidelizacionModel, MovimientoPuntosModel

UMBRAL_BONO_DEFECTO = 100
PESOS_POR_PUNTO_DEFECTO = 1000
# 1 punto = $20: con 1 punto por cada $1.000 gastados, la devolucion es del 2%.
VALOR_PUNTO_DEFECTO = 20

# inicial: puntos con que se inscribio | saldo_inicial: saldo que ya tenia al crearse el historial
# venta/canje: una venta suma o gasta puntos | anulacion_venta/eliminacion_venta: se deshace una venta | ajuste: correccion manual
TIPOS_MOVIMIENTO = ("inicial", "saldo_inicial", "venta", "canje", "anulacion_venta", "eliminacion_venta", "ajuste")


def _entero_desde_entorno(nombre: str, defecto: int) -> int:
    try:
        valor = int(os.getenv(nombre, "").strip() or defecto)
    except ValueError:
        return defecto
    return valor if valor > 0 else defecto


def umbral_bono() -> int:
    return _entero_desde_entorno("FIDELIZACION_UMBRAL_BONO", UMBRAL_BONO_DEFECTO)


def pesos_por_punto() -> int:
    return _entero_desde_entorno("FIDELIZACION_PESOS_POR_PUNTO", PESOS_POR_PUNTO_DEFECTO)


def valor_punto() -> int:
    """Pesos de descuento que vale cada punto al canjearlo."""
    return _entero_desde_entorno("FIDELIZACION_VALOR_PUNTO", VALOR_PUNTO_DEFECTO)


def puntos_por_monto(monto_cobrado: float) -> int:
    """Un punto por cada ``pesos_por_punto`` realmente cobrados (se redondea hacia abajo)."""
    return max(0, int(monto_cobrado // pesos_por_punto()))


def cliente_bloqueado(db: Session, cliente_id: int) -> ClienteFidelizacionModel | None:
    return db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id).with_for_update(),
    ).scalar_one_or_none()


def mover_puntos(
    db: Session,
    cliente: ClienteFidelizacionModel,
    delta: int,
    *,
    tipo: str,
    usuario: str,
    motivo: str | None = None,
    referencia_tipo: str | None = None,
    referencia_id: int | None = None,
) -> MovimientoPuntosModel | None:
    """Suma ``delta`` a los puntos del cliente (bloqueado por quien llama) y registra el movimiento.

    Los puntos nunca bajan de cero: si ``delta`` lo llevaria por debajo, solo se descuenta lo que hay y el
    movimiento guarda lo realmente aplicado. Si no cambia nada, no se registra (retorna None).
    """
    antes = int(cliente.puntos_acumulados)
    despues = max(0, antes + int(delta))
    if despues == antes:
        return None
    cliente.puntos_acumulados = despues
    movimiento = MovimientoPuntosModel(
        cliente_id=cliente.id,
        tipo=tipo,
        puntos=despues - antes,
        saldo=despues,
        motivo=(motivo or None) and motivo[:200],
        usuario=usuario,
        referencia_tipo=referencia_tipo,
        referencia_id=referencia_id,
    )
    db.add(movimiento)
    return movimiento


def _exigir_activo(cliente: ClienteFidelizacionModel | None) -> ClienteFidelizacionModel:
    if cliente is None or not cliente.activo:
        raise HTTPException(status_code=400, detail="El cliente de fidelizacion no existe o esta desactivado")
    return cliente


def acumular_puntos(
    db: Session,
    cliente_id: int,
    monto_cobrado: float,
    *,
    usuario: str,
    movimientos: list[MovimientoPuntosModel] | None = None,
) -> int:
    """Suma los puntos de una compra al cliente y retorna los puntos otorgados.

    Los movimientos creados se agregan a ``movimientos`` para que quien llama les ponga el id de la venta.
    """
    cliente = _exigir_activo(cliente_bloqueado(db, cliente_id))
    puntos = puntos_por_monto(monto_cobrado)
    movimiento = mover_puntos(db, cliente, puntos, tipo="venta", usuario=usuario, motivo="Compra", referencia_tipo="venta")
    if movimiento is not None and movimientos is not None:
        movimientos.append(movimiento)
    return puntos


def canjear_puntos(
    db: Session,
    cliente_id: int,
    puntos: int,
    *,
    usuario: str,
    movimientos: list[MovimientoPuntosModel] | None = None,
) -> float:
    """Descuenta puntos del cliente y retorna el descuento en pesos que valen."""
    cliente = _exigir_activo(cliente_bloqueado(db, cliente_id))
    if int(cliente.puntos_acumulados) < umbral_bono():
        raise HTTPException(status_code=400, detail="El cliente aun no alcanza los puntos minimos para canjear")
    if puntos > int(cliente.puntos_acumulados):
        raise HTTPException(status_code=400, detail="El cliente no tiene tantos puntos")
    movimiento = mover_puntos(db, cliente, -puntos, tipo="canje", usuario=usuario, motivo="Canje como descuento", referencia_tipo="venta")
    if movimiento is not None and movimientos is not None:
        movimientos.append(movimiento)
    return float(puntos * valor_punto())


def revertir_puntos_de_venta(db: Session, venta, *, usuario: str, tipo: str = "anulacion_venta") -> None:
    """Deshace los puntos de una venta: devuelve los canjeados y quita los ganados (sin bajar de cero)."""
    if venta.cliente_fidelizacion_id is None:
        return
    cliente = cliente_bloqueado(db, venta.cliente_fidelizacion_id)
    if cliente is None:
        return
    motivo = "Venta anulada" if tipo == "anulacion_venta" else "Venta eliminada"
    canjeados = int(venta.puntos_canjeados or 0)
    otorgados = int(venta.puntos_otorgados or 0)
    if canjeados:
        mover_puntos(db, cliente, canjeados, tipo=tipo, usuario=usuario, motivo=f"{motivo}: se devuelven los puntos canjeados", referencia_tipo="venta", referencia_id=venta.id)
    if otorgados:
        mover_puntos(db, cliente, -otorgados, tipo=tipo, usuario=usuario, motivo=f"{motivo}: se quitan los puntos ganados", referencia_tipo="venta", referencia_id=venta.id)
