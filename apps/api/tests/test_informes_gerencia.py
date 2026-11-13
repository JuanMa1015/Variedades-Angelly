"""Informe de gerencia: por periodo, con tienda y cartera separadas, lo cobrado y los gastos."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from src.domain.zona_horaria import inicio_del_dia_local
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    ClienteFiadoTiendaModel,
    ClienteModel,
    DetalleVentaModel,
    GastoModel,
    ProductoModel,
    VentaModel,
)
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

DIA = datetime(2026, 3, 10, 15, 0)  # 10 a. m. en Colombia, dentro del 10 de marzo
RANGO = {"desde": "2026-03-01", "hasta": "2026-03-31"}


def _super(client) -> dict[str, str]:
    return {"Authorization": f"Bearer {_login_token(client, 'angelly_superadmin', 'supersecure123')}"}


def _informe(client, **params) -> dict:
    respuesta = client.get("/api/superadmin/informes", headers=_super(client), params=params or RANGO)
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _producto(db, nombre, catalogo="tienda", activo=True) -> int:
    producto = ProductoModel(nombre=nombre, precio_costo=500.0, precio_venta=1000.0, stock_actual=10, stock_minimo=1, catalogo=catalogo, activo=activo)
    db.add(producto)
    db.flush()
    return producto.id


def _venta(db, producto_id, nombre, cantidad, *, fecha=DIA, cartera=False, anulada=False, fiado=False, saldo=0.0, vendedor="vendedor1", cliente=None, metodo="efectivo") -> int:
    total = float(cantidad) * 1000
    venta = VentaModel(
        creado_por=vendedor, total=total, saldo_pendiente=saldo, es_fiado=fiado, fecha=fecha, fuera_de_caja=cartera,
        anulada=anulada, metodo_pago=metodo, cliente_id=cliente,
    )
    db.add(venta)
    db.flush()
    db.add(DetalleVentaModel(venta_id=venta.id, producto_id=producto_id, nombre_producto=nombre, cantidad=cantidad, precio_unitario=1000.0, subtotal=total))
    return venta.id


def test_tienda_y_cartera_se_cuentan_por_separado(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        a, b = _producto(db, "Arroz"), _producto(db, "Bolso", catalogo="cartera")
        _venta(db, a, "Arroz", 3)
        _venta(db, b, "Bolso", 2, cartera=True, vendedor="admin1")
        db.commit()

    informe = _informe(client)

    assert informe["tienda"]["ventas"] == {"total": 3000.0, "transacciones": 1, "a_credito": 0.0, "de_contado": 3000.0}
    assert informe["cartera"]["ventas"]["total"] == 2000.0 and informe["cartera"]["ventas"]["transacciones"] == 1
    assert [p["producto"] for p in informe["tienda"]["mas_vendidos"]] == ["Arroz"]
    assert [p["producto"] for p in informe["cartera"]["mas_vendidos"]] == ["Bolso"]
    assert [v["vendedor"] for v in informe["tienda"]["vendedores"]] == ["vendedor1"]  # el ranking es solo de la tienda


def test_solo_cuenta_lo_que_cae_dentro_del_periodo(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        a = _producto(db, "Arroz")
        _venta(db, a, "Arroz", 1, fecha=DIA)
        _venta(db, a, "Arroz", 5, fecha=datetime(2026, 2, 27, 15, 0))
        _venta(db, a, "Arroz", 7, fecha=datetime(2026, 4, 2, 15, 0))
        db.commit()

    marzo = _informe(client)
    febrero = _informe(client, desde="2026-02-01", hasta="2026-02-28")

    assert marzo["tienda"]["ventas"]["total"] == 1000.0
    assert febrero["tienda"]["ventas"]["total"] == 5000.0
    assert marzo["periodo"] == {"desde": "2026-03-01", "hasta": "2026-03-31"}


def test_el_dia_del_negocio_empieza_a_medianoche_local_no_en_utc(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        a = _producto(db, "Arroz")
        _venta(db, a, "Arroz", 1, fecha=datetime(2026, 3, 11, 2, 0))  # 9 p. m. del 10 de marzo en Colombia
        db.commit()

    assert _informe(client, desde="2026-03-10", hasta="2026-03-10")["tienda"]["ventas"]["total"] == 1000.0
    assert _informe(client, desde="2026-03-11", hasta="2026-03-11")["tienda"]["ventas"]["total"] == 0.0


def test_las_ventas_anuladas_no_cuentan_en_nada(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        a = _producto(db, "Arroz")
        _venta(db, a, "Arroz", 1)
        _venta(db, a, "Arroz", 4, anulada=True)
        db.commit()

    tienda = _informe(client)["tienda"]

    assert tienda["ventas"]["total"] == 1000.0 and tienda["ventas"]["transacciones"] == 1
    assert [(p["unidades_vendidas"], p["total_vendido"]) for p in tienda["mas_vendidos"]] == [(1, 1000.0)]
    assert tienda["vendedores"][0]["ventas"] == 1
    assert tienda["cobrado"]["total"] == 1000.0


def test_menos_vendidos_incluye_los_que_no_se_vendieron_y_solo_activos_de_su_catalogo(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        vendido = _producto(db, "Arroz")
        _producto(db, "Sal sin ventas")
        _producto(db, "Azucar descontinuada", activo=False)
        otro = _producto(db, "Bolso", catalogo="cartera")
        _venta(db, vendido, "Arroz", 3)
        _venta(db, otro, "Bolso", 1, cartera=True)
        db.commit()

    tienda = _informe(client)["tienda"]
    cartera = _informe(client)["cartera"]

    assert [(p["producto"], p["unidades_vendidas"]) for p in tienda["menos_vendidos"]] == [("Sal sin ventas", 0), ("Arroz", 3)]
    assert [p["producto"] for p in tienda["mas_vendidos"]] == ["Arroz"]  # los que no vendieron no son «mas vendidos»
    assert [p["producto"] for p in cartera["menos_vendidos"]] == ["Bolso"]


def test_lo_cobrado_cuenta_contado_y_abono_inicial_pero_no_el_fiado_sin_cobrar(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        a = _producto(db, "Arroz")
        _venta(db, a, "Arroz", 4, metodo="efectivo")  # contado: 4000
        _venta(db, a, "Arroz", 2, metodo="transferencia", fiado=True, saldo=1500.0)  # abono inicial 500
        _venta(db, a, "Arroz", 3, metodo="efectivo", fiado=True, saldo=3000.0)  # nada cobrado
        db.commit()

    tienda = _informe(client)["tienda"]

    assert tienda["ventas"]["total"] == 9000.0 and tienda["ventas"]["a_credito"] == 5000.0
    assert tienda["cobrado"] == {"total": 4500.0, "efectivo": 4000.0, "transferencia": 500.0, "tarjeta": 0.0}


def test_lo_cobrado_de_cartera_viene_de_sus_abonos_y_no_se_mezcla_con_la_tienda(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        cliente = ClienteModel(nombre="Maria", documento="1", limite_credito=100000, deuda_total=7000.0)
        db.add(cliente)
        db.flush()
        db.add_all([
            AbonoCarteraModel(cliente_id=cliente.id, monto=2000, metodo_pago="efectivo", saldo_cliente=5000, fecha=DIA, fuera_de_caja=True),
            AbonoCarteraModel(cliente_id=cliente.id, monto=900, metodo_pago="transferencia", saldo_cliente=4100, fecha=DIA, fuera_de_caja=True),
            AbonoCarteraModel(cliente_id=cliente.id, monto=999, metodo_pago="efectivo", saldo_cliente=0, fecha=DIA, fuera_de_caja=True, anulado=True),
            AbonoCarteraModel(cliente_id=cliente.id, monto=111, metodo_pago="efectivo", saldo_cliente=0, fecha=datetime(2026, 1, 5, 15, 0), fuera_de_caja=True),
        ])
        db.commit()

    informe = _informe(client)

    assert informe["cartera"]["cobrado"] == {"total": 2900.0, "efectivo": 2000.0, "transferencia": 900.0, "tarjeta": 0.0}
    assert informe["cartera"]["por_cobrar"] == 7000.0
    assert informe["tienda"]["cobrado"]["total"] == 0.0


def test_gastos_del_periodo_y_lo_que_queda_de_lo_cobrado(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        a = _producto(db, "Arroz")
        _venta(db, a, "Arroz", 10)
        db.add_all([
            GastoModel(categoria="servicios", descripcion="luz", monto=3000, fecha=DIA, registrado_por="vendedor1"),
            GastoModel(categoria="servicios", descripcion="error", monto=9999, fecha=DIA, registrado_por="vendedor1", anulado=True),
            GastoModel(categoria="servicios", descripcion="febrero", monto=500, fecha=datetime(2026, 2, 3, 15, 0), registrado_por="vendedor1"),
        ])
        db.add(ClienteFiadoTiendaModel(nombre="Marta", telefono_whatsapp="3001", deuda_total=1200.0))
        db.commit()

    tienda = _informe(client)["tienda"]

    assert tienda["gastos"] == 3000.0
    assert tienda["cobrado"]["total"] == 10000.0 and tienda["cobrado_menos_gastos"] == 7000.0
    assert tienda["por_cobrar"] == 1200.0


def test_sin_fechas_el_informe_es_del_mes_en_curso(auth_client) -> None:
    client, sf = auth_client
    hoy = inicio_del_dia_local(datetime.now(UTC)).date()
    with sf() as db:
        a = _producto(db, "Arroz")
        _venta(db, a, "Arroz", 2, fecha=datetime.now(UTC).replace(tzinfo=None))
        _venta(db, a, "Arroz", 9, fecha=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=70))
        db.commit()

    informe = client.get("/api/superadmin/informes", headers=_super(client)).json()

    assert informe["periodo"] == {"desde": hoy.replace(day=1).isoformat(), "hasta": hoy.isoformat()}
    assert informe["tienda"]["ventas"]["total"] == 2000.0


def test_fechas_invalidas_y_permisos(auth_client) -> None:
    client, _ = auth_client
    admin = {"Authorization": f"Bearer {_login_token(client, 'angelly_admin', 'cambiame123')}"}
    vendedor = {"Authorization": f"Bearer {_login_token(client, 'vendedor1', 'ventas123')}"}

    al_reves = client.get("/api/superadmin/informes", headers=_super(client), params={"desde": "2026-03-31", "hasta": "2026-03-01"})
    enorme = client.get("/api/superadmin/informes", headers=_super(client), params={"desde": "2020-01-01", "hasta": "2026-03-01"})
    mala = client.get("/api/superadmin/informes", headers=_super(client), params={"desde": "ayer"})

    assert al_reves.status_code == 400 and enorme.status_code == 400 and mala.status_code == 422
    assert client.get("/api/superadmin/informes", headers=admin).status_code == 403
    assert client.get("/api/superadmin/informes", headers=vendedor).status_code == 403
