"""Dashboard del vendedor: solo la tienda (nada de cartera), con lo vendido, cobrado, gastado, la caja, el fiado y el stock."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from src.infrastructure.database.models import (
    AbonoCarteraModel,
    ClienteFiadoTiendaModel,
    GastoModel,
    ProductoModel,
    VentaModel,
)
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from tests.test_cartera_ventas_reglas import _producto as _producto_cartera
from tests.test_cartera_ventas_reglas import _vender as _vender_cartera
from tests.test_clientes_cartera_reglas import _admin, _cliente


def _h(client, usuario: str) -> dict[str, str]:
    credenciales = {
        "vendedor": ("vendedor1", "ventas123"),
        "super": ("angelly_superadmin", "supersecure123"),
    }[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def _tablero(client):
    return client.get("/api/dashboard/vendedor", headers=_h(client, "vendedor"))


def _producto(sf, nombre="Arroz tienda", precio=1000.0, stock=50, minimo=2, activo=True) -> int:
    with sf() as db:
        producto = ProductoModel(nombre=nombre, precio_costo=precio / 2, precio_venta=precio, stock_actual=stock, stock_minimo=minimo, catalogo="tienda", activo=activo)
        db.add(producto)
        db.commit()
        return producto.id


def _vender(client, producto, cantidad=1, metodo="efectivo", **extra):
    cuerpo = {"items": [{"producto_id": producto, "cantidad": cantidad}], "es_fiado": False, "metodo_pago": metodo, **extra}
    respuesta = client.post("/api/ventas", headers=_h(client, "vendedor"), json=cuerpo)
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()["venta_id"]


def test_es_del_vendedor_y_el_superadmin_no_del_admin(auth_client) -> None:
    client, _ = auth_client
    client.cookies.clear()
    assert client.get("/api/dashboard/vendedor").status_code == 401
    assert client.get("/api/dashboard/vendedor", headers=_h(client, "vendedor")).status_code == 200
    assert client.get("/api/dashboard/vendedor", headers=_h(client, "super")).status_code == 200
    assert client.get("/api/dashboard/vendedor", headers=_admin(client)).status_code == 403


def test_sin_movimiento_todo_es_cero(auth_client) -> None:
    client, _ = auth_client

    cuerpo = _tablero(client).json()

    assert cuerpo["ventas"]["hoy"] == {"total": 0, "transacciones": 0, "de_contado": 0, "a_credito": 0}
    assert cuerpo["cobrado"]["mes"]["total"] == 0
    assert cuerpo["gastos"] == {"hoy": 0, "mes": 0}
    assert cuerpo["fiado_tienda"] == {"deuda_total": 0, "clientes_con_deuda": 0, "en_alerta": 0, "morosos": 0}
    assert cuerpo["productos_mas_vendidos"] == [] and cuerpo["stock"]["urgentes"] == []


def test_las_ventas_son_las_de_la_tienda_separando_contado_y_credito_sin_anuladas_ni_cartera(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    _vender(client, producto, cantidad=3)  # 3.000 de contado
    with sf() as db:
        tienda = ClienteFiadoTiendaModel(nombre="Don Pedro", telefono_whatsapp="573001112233")
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id
    _vender(client, producto, cantidad=2, es_fiado=True, fiado_origen="tienda", cliente_tienda_id=tienda_id, abono_inicial=500)  # 2.000, a credito
    anulada = _vender(client, producto, cantidad=9)
    with sf() as db:
        db.get(VentaModel, anulada).anulada = True
        db.commit()
    cliente, producto_cartera = _cliente(sf), _producto_cartera(sf, precio=1000.0)
    _vender_cartera(client, cliente, producto_cartera, cantidad=7)  # 7.000 de cartera: no es de la tienda

    ventas = _tablero(client).json()["ventas"]

    assert ventas["hoy"] == {"total": 5000, "transacciones": 2, "de_contado": 3000, "a_credito": 2000}
    assert ventas["semana"] == ventas["mes"] == ventas["hoy"]


def test_lo_cobrado_hoy_es_lo_que_entro_por_metodo_y_no_cuenta_cartera(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    _vender(client, producto, cantidad=2, metodo="efectivo")  # 2.000
    _vender(client, producto, cantidad=3, metodo="tarjeta")  # 3.000
    with sf() as db:
        tienda = ClienteFiadoTiendaModel(nombre="Don Pedro", deuda_total=5000.0)
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id
    client.post(f"/api/clientes/tienda/{tienda_id}/abonos", headers=_h(client, "vendedor"), json={"monto": 1500, "metodo_pago": "transferencia"})
    cliente = _cliente(sf, deuda=9000.0)
    client.post(f"/api/cartera/clientes/{cliente}/abonos", headers=_admin(client), json={"monto": 4000, "metodo_pago": "efectivo"})  # cartera: aparte

    hoy = _tablero(client).json()["cobrado"]["hoy"]

    assert hoy == {"total": 6500, "efectivo": 2000, "transferencia": 1500, "tarjeta": 3000}


def test_lo_cobrado_respeta_el_periodo(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        antiguo = ClienteFiadoTiendaModel(nombre="Antiguo")
        db.add(antiguo)
        db.flush()
        db.add(VentaModel(cliente_tienda_id=antiguo.id, es_fiado=False, total=8000, saldo_pendiente=0, metodo_pago="efectivo", fecha=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=60)))
        db.commit()

    cobrado = _tablero(client).json()["cobrado"]

    assert cobrado["hoy"]["total"] == 0 and cobrado["semana"]["total"] == 0 and cobrado["mes"]["total"] == 0


def test_los_gastos_cuentan_hoy_y_el_mes_sin_los_anulados(auth_client) -> None:
    client, sf = auth_client
    assert client.post("/api/gastos", headers=_h(client, "vendedor"), json={"categoria": "servicios", "descripcion": "pago de luz", "monto": 500}).status_code == 201
    with sf() as db:
        db.add(GastoModel(categoria="otros", descripcion="anulado", monto=9999, registrado_por="vendedor1", anulado=True))
        db.commit()

    gastos = _tablero(client).json()["gastos"]

    assert gastos == {"hoy": 500, "mes": 500}


def test_el_fiado_de_tienda_se_reparte_por_antiguedad(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        for nombre, deuda, dias in (("Reciente", 3000.0, 2), ("En alerta", 4000.0, 40), ("Moroso", 5000.0, 90)):
            cliente = ClienteFiadoTiendaModel(nombre=nombre, deuda_total=deuda)
            db.add(cliente)
            db.flush()
            db.add(VentaModel(
                cliente_tienda_id=cliente.id, tipo_fiado="tienda", es_fiado=True, total=deuda, saldo_pendiente=deuda,
                fecha=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=dias),
            ))
        db.add(ClienteFiadoTiendaModel(nombre="Sin deuda"))
        db.commit()

    fiado = _tablero(client).json()["fiado_tienda"]

    assert fiado == {"deuda_total": 12000, "clientes_con_deuda": 3, "en_alerta": 1, "morosos": 1}


def test_la_caja_actual_coincide_con_el_efectivo_esperado_de_la_caja(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    _vender(client, producto, cantidad=4, metodo="efectivo")
    client.post("/api/gastos", headers=_h(client, "vendedor"), json={"categoria": "servicios", "descripcion": "pago de luz", "monto": 500})

    caja = _tablero(client).json()["caja"]
    oficial = client.get("/api/caja/estado", headers=_h(client, "super")).json()["caja_actual"]

    assert caja["abierta"] is True
    assert caja["efectivo_esperado"] == oficial["saldo_esperado"]
    assert caja["efectivo"] == oficial["monto_ventas_efectivo"] and caja["gastos"] == oficial["monto_gastos"]


def test_sin_caja_abierta_lo_dice(auth_client) -> None:
    client, _ = auth_client
    client.post("/api/caja/cierre", headers=_h(client, "vendedor"), json={"monto_cierre": 0})

    caja = _tablero(client).json()["caja"]

    assert caja["abierta"] is False and caja["efectivo_esperado"] == 0


def test_los_mas_vendidos_son_de_la_tienda_por_unidades(auth_client) -> None:
    client, sf = auth_client
    arroz, aceite = _producto(sf, "Arroz tienda"), _producto(sf, "Aceite tienda", precio=5000.0)
    _vender(client, arroz, cantidad=5)
    _vender(client, aceite, cantidad=2)
    cliente, bolso = _cliente(sf), _producto_cartera(sf, precio=1000.0, nombre="Bolso cartera")
    _vender_cartera(client, cliente, bolso, cantidad=30)  # muchas unidades de cartera: no deben salir

    vendidos = _tablero(client).json()["productos_mas_vendidos"]

    assert [(p["nombre"], p["unidades"], p["total"]) for p in vendidos] == [("Arroz tienda", 5, 5000), ("Aceite tienda", 2, 10000)]


def test_el_stock_es_el_de_la_tienda(auth_client) -> None:
    client, sf = auth_client
    _producto(sf, "Agotado", stock=0, minimo=3)
    _producto(sf, "Bajo", stock=2, minimo=5)
    _producto(sf, "Bien", stock=50, minimo=5)
    _producto(sf, "Desactivado", stock=0, minimo=3, activo=False)
    _producto_cartera(sf, nombre="Agotado de cartera", stock=0)

    stock = _tablero(client).json()["stock"]

    assert stock["agotados"] == 1 and stock["bajo_stock"] == 1
    assert [p["nombre"] for p in stock["urgentes"]] == ["Agotado", "Bajo"]


def test_las_listas_de_ventas_son_de_cada_rol(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    de_tienda = _vender(client, producto, cantidad=1)
    cliente, producto_cartera = _cliente(sf), _producto_cartera(sf)
    de_cartera = _vender_cartera(client, cliente, producto_cartera, cantidad=1).json()["venta_id"]

    def ids(ruta, usuario):
        encabezado = _admin(client) if usuario == "admin" else _h(client, usuario)
        cuerpo = client.get(ruta, headers=encabezado).json()
        return {v["venta_id"] for v in (cuerpo["data"] if isinstance(cuerpo, dict) else cuerpo)}

    for ruta in ("/api/ventas", "/api/ventas/paginadas"):
        assert ids(ruta, "vendedor") == {de_tienda}
        assert ids(ruta, "super") == {de_tienda, de_cartera}
        assert client.get(ruta, headers=_admin(client)).status_code == 403  # el admin no entra a las ventas de la tienda
    assert ids("/api/cartera/ventas/paginadas", "admin") == {de_cartera}


def test_un_abono_de_cartera_no_mueve_nada_del_vendedor(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    client.post(f"/api/cartera/clientes/{cliente}/abonos", headers=_admin(client), json={"monto": 2000, "metodo_pago": "efectivo"})

    tablero = _tablero(client).json()

    assert tablero["cobrado"]["hoy"]["total"] == 0 and tablero["fiado_tienda"]["deuda_total"] == 0
    with sf() as db:
        assert db.query(AbonoCarteraModel).count() == 1
