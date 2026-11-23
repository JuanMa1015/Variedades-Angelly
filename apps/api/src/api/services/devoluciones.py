"""Devolucion parcial de una venta: el producto vuelve al stock y al cliente se le devuelve lo que corresponde.

Reglas:
- La autoriza un administrador (igual que anular) y deja motivo y auditoria; nada se borra.
- Se devuelve por el mismo medio con que se pago. El dinero sale del turno de caja ABIERTO (no del de la venta original).
- Si la venta fue fiado, la devolucion baja primero la deuda de ese cliente; solo el resto se devuelve en dinero.
- El valor de cada producto reparte los descuentos de la venta (puntos y descuento manual), asi nunca se devuelve de mas.
- Los puntos ganados se quitan en la misma proporcion.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.services.auditoria import registrar_auditoria
from src.api.services.deuda import deuda_pendiente_tienda, mover_deuda_tienda
from src.api.services.fidelizacion import cliente_bloqueado, mover_puntos
from src.api.services.stock import mover_stock
from src.api.services.venta_reglas import caja_abierta_id
from src.infrastructure.database.models import (
    DetalleVentaModel,
    DevolucionVentaDetalleModel,
    DevolucionVentaModel,
    ProductoModel,
    VentaModel,
)

FIADO_TIENDA = "tienda"


def _exigir_devolvible(venta: VentaModel | None) -> VentaModel:
    if venta is None:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if venta.anulada:
        raise HTTPException(status_code=409, detail="La venta esta anulada: no tiene productos que devolver")
    if venta.fuera_de_caja or venta.cliente_id is not None or venta.tipo_fiado == "cartera":
        raise HTTPException(status_code=409, detail="Las ventas de cartera se gestionan desde el modulo de cartera")
    return venta


def _agrupar(items: Sequence) -> dict[int, int]:
    pedidos: dict[int, int] = defaultdict(int)
    for item in items:
        pedidos[int(item.producto_id)] += int(item.cantidad)
    return dict(pedidos)


def _puntos_a_quitar(db: Session, venta: VentaModel, nuevo_total_devuelto: float) -> int:
    """Puntos ganados que corresponden a lo devuelto hasta ahora, menos los que ya se quitaron antes."""
    otorgados = int(venta.puntos_otorgados or 0)
    if venta.cliente_fidelizacion_id is None or otorgados <= 0 or float(venta.total) <= 0:
        return 0
    proporcion = min(1.0, nuevo_total_devuelto / float(venta.total))
    objetivo = int(otorgados * proporcion)
    ya_quitados = db.execute(
        select(func.coalesce(func.sum(DevolucionVentaModel.puntos_revertidos), 0)).where(DevolucionVentaModel.venta_id == venta.id),
    ).scalar_one()
    return max(0, objetivo - int(ya_quitados or 0))


def devolver_productos(
    db: Session,
    venta_id: int,
    items: Sequence,
    *,
    solicitante: str,
    autorizado_por: str,
    motivo: str,
) -> DevolucionVentaModel:
    venta = _exigir_devolvible(
        db.execute(select(VentaModel).where(VentaModel.id == venta_id).with_for_update()).scalar_one_or_none(),
    )
    caja_id = caja_abierta_id(db)
    if caja_id is None:
        raise HTTPException(
            status_code=409,
            detail="Abre la caja para registrar la devolucion: el dinero que se devuelve sale del turno abierto",
        )

    detalles = db.execute(
        select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta.id).order_by(DetalleVentaModel.id).with_for_update(),
    ).scalars().all()
    por_producto: dict[int, list[DetalleVentaModel]] = defaultdict(list)
    for detalle in detalles:
        por_producto[detalle.producto_id].append(detalle)

    pedidos = _agrupar(items)
    for producto_id, cantidad in pedidos.items():
        lineas = por_producto.get(producto_id)
        if not lineas:
            raise HTTPException(status_code=400, detail=f"El producto {producto_id} no es de esta venta")
        disponible = sum(d.cantidad - d.cantidad_devuelta for d in lineas)
        if cantidad > disponible:
            raise HTTPException(
                status_code=400,
                detail=f"De '{lineas[0].nombre_producto}' solo quedan {max(disponible, 0)} por devolver",
            )

    # El valor de lo devuelto reparte los descuentos de la venta: total cobrado / suma de lineas.
    suma_lineas = sum(float(d.subtotal) for d in detalles)
    factor = min(1.0, float(venta.total) / suma_lineas) if suma_lineas > 0 else 1.0

    movidas: list[tuple[DetalleVentaModel, int, float]] = []
    for producto_id in sorted(pedidos):  # siempre en el mismo orden de bloqueo
        producto = db.execute(select(ProductoModel).where(ProductoModel.id == producto_id).with_for_update()).scalar_one()
        restante = pedidos[producto_id]
        for detalle in por_producto[producto_id]:
            tomar = min(detalle.cantidad - detalle.cantidad_devuelta, restante)
            if tomar <= 0:
                continue
            detalle.cantidad_devuelta += tomar
            movidas.append((detalle, tomar, round(tomar * float(detalle.precio_unitario) * factor, 2)))
            restante -= tomar
        mover_stock(
            db, producto, pedidos[producto_id], tipo="devolucion_venta", usuario=solicitante, motivo=motivo,
            referencia_tipo="venta", referencia_id=venta.id,
        )

    valor_total = round(sum(valor for _, _, valor in movidas), 2)
    if all(d.cantidad_devuelta >= d.cantidad for d in detalles):
        # Se devolvio todo: lo devuelto suma exactamente el total de la venta, sin centavos de redondeo.
        ajuste = round(float(venta.total) - float(venta.total_devuelto) - valor_total, 2)
        if ajuste and movidas:
            detalle, cantidad, valor = movidas[-1]
            movidas[-1] = (detalle, cantidad, round(valor + ajuste, 2))
            valor_total = round(valor_total + ajuste, 2)

    reembolso, deuda_reducida = valor_total, 0.0
    if venta.es_fiado and venta.tipo_fiado == FIADO_TIENDA and venta.cliente_tienda_id is not None:
        antes = deuda_pendiente_tienda(venta)
        deuda_reducida = round(min(valor_total, float(venta.saldo_pendiente), float(venta.total)), 2)
        reembolso = round(valor_total - deuda_reducida, 2)
        venta.saldo_pendiente = round(float(venta.saldo_pendiente) - deuda_reducida, 2)
        venta.deuda_reducida = round(float(venta.deuda_reducida) + deuda_reducida, 2)
        mover_deuda_tienda(db, antes, deuda_pendiente_tienda(venta))

    nuevo_total_devuelto = round(float(venta.total_devuelto) + valor_total, 2)
    puntos = _puntos_a_quitar(db, venta, nuevo_total_devuelto)
    if puntos:
        cliente = cliente_bloqueado(db, venta.cliente_fidelizacion_id)
        if cliente is not None:
            mover_puntos(
                db, cliente, -puntos, tipo="devolucion_venta", usuario=solicitante,
                motivo=f"Devolucion de la venta #{venta.id}: se quitan los puntos ganados", referencia_tipo="venta", referencia_id=venta.id,
            )
    venta.total_devuelto = nuevo_total_devuelto

    devolucion = DevolucionVentaModel(
        venta_id=venta.id,
        registrado_por=solicitante,
        autorizado_por=autorizado_por,
        motivo=motivo,
        total_devuelto=valor_total,
        monto_reembolsado=reembolso,
        deuda_reducida=deuda_reducida,
        metodo_pago=(venta.metodo_pago or "efectivo") if reembolso > 0 else None,
        caja_id=caja_id,
        puntos_revertidos=puntos,
    )
    db.add(devolucion)
    db.flush()
    for detalle, cantidad, valor in movidas:
        db.add(
            DevolucionVentaDetalleModel(
                devolucion_id=devolucion.id,
                detalle_venta_id=detalle.id,
                producto_id=detalle.producto_id,
                nombre_producto=detalle.nombre_producto,
                cantidad=cantidad,
                valor=valor,
            ),
        )

    unidades = sum(cantidad for _, cantidad, _ in movidas)
    registrar_auditoria(
        db,
        usuario=solicitante,
        modulo="ventas",
        entidad="venta",
        accion="devolucion",
        entidad_id=venta.id,
        detalle=(
            f"Venta #{venta.id}: {unidades} unidades, valor {valor_total}, devuelto en dinero {reembolso}"
            f"{f' ({devolucion.metodo_pago})' if devolucion.metodo_pago else ''}, deuda reducida {deuda_reducida}. "
            f"Autorizo: {autorizado_por}. Motivo: {motivo}"
        ),
    )
    return devolucion
