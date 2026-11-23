"""Devolucion parcial: el producto vuelve al stock, el dinero sale del turno abierto y nada se descuadra."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from src.infrastructure.database.models import (
    AuditoriaModel,
    CierreCajaModel,
    ClienteFiadoTiendaModel,
    ClienteFidelizacionModel,
    DetalleVentaModel,
    MovimientoStockModel,
    ProductoModel,
    VentaModel,
)
from src.infrastructure.repositories.ingresos import cobros_por_metodo
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

ADMIN = {"autorizador_usuario": "angelly_admin", "autorizador_password": "cambiame123"}


def _h(client, usuario: str = "vendedor") -> dict[str, str]:
    credenciales = {
        "vendedor": ("vendedor1", "ventas123"),
        "super": ("angelly_superadmin", "supersecure123"),
    }[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def _producto(sf, nombre="Arroz", stock=10, precio=1000.0) -> int:
    with sf() as db:
        producto = ProductoModel(nombre=nombre, precio_costo=500, precio_venta=precio, stock_actual=stock, stock_minimo=1, catalogo="tienda")
        db.add(producto)
        db.commit()
        return producto.id


def _vender(client, items, **extra) -> dict:
    cuerpo = {"items": [{"producto_id": p, "cantidad": c} for p, c in items], "es_fiado": False, "metodo_pago": "efectivo", **extra}
    respuesta = client.post("/api/ventas", headers=_h(client), json=cuerpo)
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _devolver(client, venta_id, items, motivo="Producto en mal estado", autorizacion=None, usuario="vendedor"):
    cuerpo = {"items": [{"producto_id": p, "cantidad": c} for p, c in items], "motivo": motivo, **(ADMIN if autorizacion is None else autorizacion)}
    return client.post(f"/api/ventas/{venta_id}/devoluciones", headers=_h(client, usuario), json=cuerpo)


def _stock(sf, producto_id: int) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto_id).stock_actual


def _efectivo_del_turno(sf) -> float:
    with sf() as db:
        caja_id = db.execute(select(CierreCajaModel.id).where(CierreCajaModel.fecha_cierre.is_(None))).scalar_one()
        return cobros_por_metodo(db, caja_id=caja_id).get("efectivo", 0.0)


# -- Contado --


def test_devolver_una_parte_regresa_el_stock_y_devuelve_el_dinero(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    venta = _vender(client, [(arroz, 5)])

    respuesta = _devolver(client, venta["venta_id"], [(arroz, 2)])

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["total"] == 5000.0 and cuerpo["total_devuelto"] == 2000.0
    assert cuerpo["detalles"][0]["cantidad_devuelta"] == 2
    [devolucion] = cuerpo["devoluciones"]
    assert (devolucion["total_devuelto"], devolucion["monto_reembolsado"], devolucion["metodo_pago"]) == (2000.0, 2000.0, "efectivo")
    assert devolucion["autorizado_por"] == "angelly_admin" and devolucion["registrado_por"] == "vendedor1"
    assert [(linea["nombre_producto"], linea["cantidad"], linea["valor"]) for linea in devolucion["lineas"]] == [("Arroz", 2, 2000.0)]
    assert _stock(sf, arroz) == 10 - 5 + 2
    assert _efectivo_del_turno(sf) == 3000.0  # lo cobrado menos lo devuelto


def test_la_devolucion_baja_las_ventas_netas_del_dashboard_y_queda_en_los_movimientos_de_caja(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    venta = _vender(client, [(arroz, 5)])
    _devolver(client, venta["venta_id"], [(arroz, 2)])

    tablero = client.get("/api/dashboard/vendedor", headers=_h(client)).json()
    with sf() as db:
        caja_id = db.execute(select(CierreCajaModel.id)).scalars().first()
    movimientos = client.get(f"/api/caja/{caja_id}/movimientos", headers=_h(client)).json()

    assert tablero["ventas"]["hoy"]["total"] == 3000.0
    assert tablero["cobrado"]["hoy"]["efectivo"] == 3000.0
    assert [m["tipo"] for m in movimientos if m["tipo"] == "devolucion"] == ["devolucion"]
    assert next(m for m in movimientos if m["tipo"] == "devolucion")["monto"] == 2000.0
    assert tablero["productos_mas_vendidos"][0]["unidades"] == 3


def test_queda_el_movimiento_de_stock_y_la_auditoria(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    venta = _vender(client, [(arroz, 4)])
    _devolver(client, venta["venta_id"], [(arroz, 1)], motivo="No le gusto")

    with sf() as db:
        movimiento = db.execute(select(MovimientoStockModel).where(MovimientoStockModel.tipo == "devolucion_venta")).scalar_one()
        auditoria = db.execute(select(AuditoriaModel).where(AuditoriaModel.modulo == "ventas", AuditoriaModel.accion == "devolucion")).scalar_one()

    assert (movimiento.delta, movimiento.referencia_id, movimiento.motivo) == (1, venta["venta_id"], "No le gusto")
    assert "No le gusto" in auditoria.detalle and "angelly_admin" in auditoria.detalle


def test_devoluciones_sucesivas_respetan_lo_que_queda_y_devolver_todo_suma_el_total_exacto(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, precio=1000.0)
    venta = _vender(client, [(arroz, 3)])

    primera = _devolver(client, venta["venta_id"], [(arroz, 1)])
    de_mas = _devolver(client, venta["venta_id"], [(arroz, 3)])
    resto = _devolver(client, venta["venta_id"], [(arroz, 2)])
    otra = _devolver(client, venta["venta_id"], [(arroz, 1)])

    assert primera.status_code == 201 and resto.status_code == 201
    assert de_mas.status_code == 400 and "solo quedan 2" in de_mas.json()["detail"]
    assert otra.status_code == 400 and "solo quedan 0" in otra.json()["detail"]
    assert resto.json()["total_devuelto"] == 3000.0 and len(resto.json()["devoluciones"]) == 2
    assert _stock(sf, arroz) == 10 and _efectivo_del_turno(sf) == 0.0


def test_el_valor_devuelto_reparte_los_descuentos_de_la_venta(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, precio=1000.0)
    with sf() as db:
        venta = VentaModel(creado_por="vendedor1", total=4500, saldo_pendiente=0, es_fiado=False, metodo_pago="efectivo")  # 5 x 1000 con $500 de descuento
        db.add(venta)
        db.flush()
        db.add(DetalleVentaModel(venta_id=venta.id, producto_id=arroz, nombre_producto="Arroz", cantidad=5, precio_unitario=1000, subtotal=5000))
        caja = db.execute(select(CierreCajaModel).where(CierreCajaModel.fecha_cierre.is_(None))).scalar_one()
        venta.caja_id = caja.id
        db.commit()
        venta_id = venta.id

    dos = _devolver(client, venta_id, [(arroz, 2)])
    resto = _devolver(client, venta_id, [(arroz, 3)])

    assert dos.json()["devoluciones"][0]["total_devuelto"] == 1800.0  # 2 x 1.000 x 0,9: nunca mas de lo que pago
    assert resto.json()["total_devuelto"] == 4500.0  # al devolver todo suma exactamente lo cobrado


# -- Autorizacion y reglas --


def test_sin_admin_o_con_clave_mala_no_se_devuelve_nada(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    venta = _vender(client, [(arroz, 2)])

    sin = _devolver(client, venta["venta_id"], [(arroz, 1)], autorizacion={})
    mala = _devolver(client, venta["venta_id"], [(arroz, 1)], autorizacion={"autorizador_usuario": "angelly_admin", "autorizador_password": "mala"})
    propio = _devolver(client, venta["venta_id"], [(arroz, 1)], autorizacion={}, usuario="super")  # el superadmin se autoriza solo

    assert sin.status_code == 403 and "devolucion necesita la autorizacion" in sin.json()["detail"]
    assert mala.status_code == 403
    assert propio.status_code == 201 and propio.json()["devoluciones"][0]["autorizado_por"] == "angelly_superadmin"
    assert _stock(sf, arroz) == 10 - 2 + 1


def test_un_producto_que_no_es_de_la_venta_o_cantidades_invalidas_se_rechazan(auth_client) -> None:
    client, sf = auth_client
    arroz, sal = _producto(sf, "Arroz"), _producto(sf, "Sal")
    venta = _vender(client, [(arroz, 2)])

    ajeno = _devolver(client, venta["venta_id"], [(sal, 1)])
    cero = _devolver(client, venta["venta_id"], [(arroz, 0)])
    vacia = client.post(f"/api/ventas/{venta['venta_id']}/devoluciones", headers=_h(client), json={"items": [], "motivo": "x" * 5, **ADMIN})
    sin_motivo = _devolver(client, venta["venta_id"], [(arroz, 1)], motivo="a")

    assert ajeno.status_code == 400 and cero.status_code == 422 and vacia.status_code == 422 and sin_motivo.status_code == 422
    assert _stock(sf, arroz) == 8 and _stock(sf, sal) == 10


def test_sin_caja_abierta_no_se_devuelve_dinero(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    venta = _vender(client, [(arroz, 2)])
    with sf() as db:
        for caja in db.execute(select(CierreCajaModel)).scalars():
            caja.fecha_cierre = datetime.now(UTC).replace(tzinfo=None)
        db.commit()

    respuesta = _devolver(client, venta["venta_id"], [(arroz, 1)])

    assert respuesta.status_code == 409 and "Abre la caja" in respuesta.json()["detail"]
    assert _stock(sf, arroz) == 8


def test_una_venta_anulada_o_de_cartera_no_admite_devoluciones(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    anulada = _vender(client, [(arroz, 2)])
    client.post(f"/api/ventas/{anulada['venta_id']}/anular", headers=_h(client), json={"motivo": "Error al digitar", **ADMIN})
    with sf() as db:
        cartera = VentaModel(creado_por="admin1", total=900, saldo_pendiente=0, es_fiado=False, fuera_de_caja=True)
        db.add(cartera)
        db.flush()
        db.add(DetalleVentaModel(venta_id=cartera.id, producto_id=arroz, nombre_producto="Arroz", cantidad=1, precio_unitario=900, subtotal=900))
        db.commit()
        cartera_id = cartera.id

    assert _devolver(client, anulada["venta_id"], [(arroz, 1)]).status_code == 409
    assert _devolver(client, cartera_id, [(arroz, 1)]).status_code == 409
    assert _devolver(client, 999999, [(arroz, 1)]).status_code == 404


def test_una_venta_con_devoluciones_ya_no_se_anula_ni_se_edita_ni_se_elimina(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    venta = _vender(client, [(arroz, 3)])
    _devolver(client, venta["venta_id"], [(arroz, 1)])

    anular = client.post(f"/api/ventas/{venta['venta_id']}/anular", headers=_h(client), json={"motivo": "Error al digitar", **ADMIN})
    editar = client.patch(f"/api/ventas/{venta['venta_id']}", headers=_h(client, "super"), json={"total": 1})
    borrar = client.delete(f"/api/ventas/{venta['venta_id']}", headers=_h(client, "super"))

    assert (anular.status_code, editar.status_code, borrar.status_code) == (409, 409, 409)
    assert "devoluciones" in anular.json()["detail"]
    assert _stock(sf, arroz) == 10 - 3 + 1


# -- Fiado y puntos --


def test_en_un_fiado_la_devolucion_baja_primero_la_deuda_y_solo_el_resto_es_dinero(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, precio=1000.0)
    with sf() as db:
        cliente = ClienteFiadoTiendaModel(nombre="Marta", telefono_whatsapp="3001112233", deuda_total=0)
        db.add(cliente)
        db.commit()
        cliente_id = cliente.id
    venta = _vender(client, [(arroz, 5)], es_fiado=True, fiado_origen="tienda", cliente_tienda_id=cliente_id, abono_inicial=1000)  # debe 4.000, pago 1.000

    def deuda() -> float:
        with sf() as db:
            return float(db.get(ClienteFiadoTiendaModel, cliente_id).deuda_total)

    primera = _devolver(client, venta["venta_id"], [(arroz, 2)])  # 2.000: todo baja la deuda
    segunda = _devolver(client, venta["venta_id"], [(arroz, 3)])  # 3.000: 2.000 de deuda y 1.000 en dinero

    assert primera.status_code == 201 and segunda.status_code == 201
    uno, dos = segunda.json()["devoluciones"]
    assert (uno["deuda_reducida"], uno["monto_reembolsado"], uno["metodo_pago"]) == (2000.0, 0.0, None)
    assert (dos["deuda_reducida"], dos["monto_reembolsado"], dos["metodo_pago"]) == (2000.0, 1000.0, "efectivo")
    assert deuda() == 0.0
    assert _efectivo_del_turno(sf) == 0.0  # cobro 1.000 y devolvio 1.000: la caja queda en cero
    assert _stock(sf, arroz) == 10


def test_los_puntos_ganados_se_quitan_en_la_misma_proporcion(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, precio=1000.0)
    creado = client.post("/api/fidelizacion/clientes", headers=_h(client, "super"), json={"nombre": "Ana", "telefono_whatsapp": "3009998877", "acepta_datos": True})
    assert creado.status_code == 201, creado.text
    cliente_id = creado.json()["id"]
    venta = _vender(client, [(arroz, 5)], cliente_fidelizacion_id=cliente_id)  # 5.000 -> 5 puntos

    def puntos() -> int:
        with sf() as db:
            return db.get(ClienteFidelizacionModel, cliente_id).puntos_acumulados

    assert puntos() == 5
    _devolver(client, venta["venta_id"], [(arroz, 2)])  # 40 %: 2 puntos
    assert puntos() == 3
    _devolver(client, venta["venta_id"], [(arroz, 3)])  # el resto: los 3 que faltan
    assert puntos() == 0
