"""Dashboard de cartera: ventas y cobros del modulo, por cobrar por antiguedad y rankings; y el dashboard de ventas sin cartera."""

from __future__ import annotations

from sqlalchemy import select

from src.infrastructure.database.models import AbonoCarteraModel, ClienteModel, ProductoModel, VentaModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from tests.test_cartera_ventas_reglas import _anular, _producto, _vender
from tests.test_clientes_cartera_reglas import _admin, _cliente, _venta_fiada


def _dashboard(client):
    return client.get("/api/cartera/dashboard", headers=_admin(client))


def _token(client, usuario: str) -> dict[str, str]:
    credenciales = {"vendedor": ("vendedor1", "ventas123"), "super": ("angelly_superadmin", "supersecure123")}[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def test_solo_cartera_y_con_autenticacion(auth_client) -> None:
    client, _ = auth_client
    client.cookies.clear()
    assert client.get("/api/cartera/dashboard").status_code == 401
    assert client.get("/api/cartera/dashboard", headers=_token(client, "vendedor")).status_code == 403
    assert client.get("/api/cartera/dashboard", headers=_token(client, "super")).status_code == 200


def test_sin_datos_todo_es_cero_y_las_listas_vacias(auth_client) -> None:
    client, _ = auth_client

    cuerpo = _dashboard(client).json()

    assert cuerpo["clientes_activos"] == 0
    assert cuerpo["ventas"]["hoy"] == {"total": 0, "transacciones": 0, "a_credito": 0, "de_contado": 0}
    assert cuerpo["cobrado"]["mes"]["total"] == 0
    assert cuerpo["por_cobrar"]["deuda_total"] == 0 and cuerpo["por_cobrar"]["clientes_con_deuda"] == 0
    assert cuerpo["mayores_deudores"] == [] and cuerpo["mejores_clientes"] == []


def test_las_ventas_son_las_de_cartera_separando_credito_y_contado_y_sin_anuladas(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf, precio=1000.0)
    assert _vender(client, cliente, producto, cantidad=4).status_code == 201  # 4.000 a credito
    assert _vender(client, cliente, producto, cantidad=2, abono=2000).status_code == 201  # 2.000 de contado
    anulada = _vender(client, cliente, producto, cantidad=9).json()["venta_id"]
    assert _anular(client, anulada).status_code == 200

    ventas = _dashboard(client).json()["ventas"]

    for periodo in ("hoy", "semana", "mes"):
        assert ventas[periodo] == {"total": 6000, "transacciones": 2, "a_credito": 4000, "de_contado": 2000}


def test_las_ventas_del_punto_de_venta_no_cuentan_en_cartera_ni_las_de_cartera_en_el_dashboard_del_vendedor(auth_client) -> None:
    client, sf = auth_client
    cliente, producto_cartera = _cliente(sf), _producto(sf, precio=1000.0)
    _vender(client, cliente, producto_cartera, cantidad=3)  # 3.000 de cartera
    with sf() as db:
        tienda = ProductoModel(nombre="Arroz tienda", precio_costo=500, precio_venta=700, stock_actual=20, stock_minimo=1, catalogo="tienda")
        db.add(tienda)
        db.commit()
        tienda_id = tienda.id
    vendedor = _token(client, "vendedor")
    venta = client.post(
        "/api/ventas", headers=vendedor,
        json={"items": [{"producto_id": tienda_id, "cantidad": 2}], "es_fiado": False, "metodo_pago": "efectivo"},
    )
    assert venta.status_code == 201, venta.text  # 1.400 de la tienda

    cartera = _dashboard(client).json()["ventas"]["hoy"]
    negocio = client.get("/api/dashboard/vendedor", headers=vendedor).json()["ventas"]["hoy"]

    assert cartera["total"] == 3000 and cartera["transacciones"] == 1
    assert negocio["total"] == 1400 and negocio["transacciones"] == 1


def test_el_dashboard_de_la_tienda_es_del_vendedor_y_el_superadmin_no_del_admin(auth_client) -> None:
    client, _ = auth_client

    assert client.get("/api/dashboard/vendedor", headers=_token(client, "vendedor")).status_code == 200
    assert client.get("/api/dashboard/vendedor", headers=_token(client, "super")).status_code == 200
    assert client.get("/api/dashboard/vendedor", headers=_admin(client)).status_code == 403


def test_lo_cobrado_es_lo_que_cartera_recibio(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, deuda=10000.0), _producto(sf)
    client.post(f"/api/cartera/clientes/{cliente}/abonos", headers=_admin(client), json={"monto": 3000, "metodo_pago": "transferencia"})
    _vender(client, cliente, producto, cantidad=2, abono=2000, metodo="efectivo")

    hoy = _dashboard(client).json()["cobrado"]["hoy"]

    assert hoy["total"] == 5000 and hoy["efectivo"] == 2000 and hoy["transferencia"] == 3000


def test_por_cobrar_reparte_la_deuda_por_antiguedad(auth_client) -> None:
    client, sf = auth_client
    reciente = _cliente(sf, nombre="Reciente", documento="10001", deuda=900000.0)
    _venta_fiada(sf, reciente, 900000.0, dias=2)
    alerta = _cliente(sf, nombre="En Alerta", documento="20002", deuda=40000.0)
    _venta_fiada(sf, alerta, 40000.0, dias=40)
    moroso = _cliente(sf, nombre="Moroso", documento="30003", deuda=10000.0)
    _venta_fiada(sf, moroso, 10000.0, dias=90)
    _cliente(sf, nombre="Sin deuda", documento="40004")

    por_cobrar = _dashboard(client).json()["por_cobrar"]

    assert por_cobrar["deuda_total"] == 950000 and por_cobrar["clientes_con_deuda"] == 3
    assert por_cobrar["al_dia"] == {"clientes": 1, "monto": 900000}
    assert por_cobrar["alerta"] == {"clientes": 1, "monto": 40000}
    assert por_cobrar["moroso"] == {"clientes": 1, "monto": 10000}
    assert por_cobrar["saldo_promedio"] == round(950000 / 3, 2)


def test_los_mayores_deudores_salen_de_mayor_a_menor_con_sus_dias_y_solo_cinco(auth_client) -> None:
    client, sf = auth_client
    for n in range(7):
        c = _cliente(sf, nombre=f"Deudor {n}", documento=f"9000{n}", deuda=1000.0 * (n + 1))
        _venta_fiada(sf, c, 1000.0 * (n + 1), dias=n)
    _cliente(sf, nombre="Desactivado", documento="99999", deuda=0.0, activo=False)

    deudores = _dashboard(client).json()["mayores_deudores"]

    assert [d["nombre"] for d in deudores] == ["Deudor 6", "Deudor 5", "Deudor 4", "Deudor 3", "Deudor 2"]
    assert deudores[0]["deuda_total"] == 7000 and deudores[0]["dias_deuda"] == 6 and deudores[0]["estado_deuda"] == "al_dia"


def test_los_mejores_clientes_se_ordenan_por_monto_y_desempatan_por_cantidad(auth_client) -> None:
    client, sf = auth_client
    grande, muchas, anulada = _cliente(sf, nombre="Grande", documento="10001"), _cliente(sf, nombre="Muchas", documento="20002"), _cliente(sf, nombre="Solo anulada", documento="30003")
    producto = _producto(sf, precio=1000.0)
    _vender(client, grande, producto, cantidad=10)  # 1 compra de 10.000
    for _ in range(3):
        _vender(client, muchas, producto, cantidad=1)  # 3 compras de 1.000 = 3.000
    venta = _vender(client, anulada, producto, cantidad=20).json()["venta_id"]
    _anular(client, venta)

    mejores = _dashboard(client).json()["mejores_clientes"]

    assert [(m["nombre"], m["compras_cantidad"], m["compras_total"]) for m in mejores] == [("Grande", 1, 10000), ("Muchas", 3, 3000)]
