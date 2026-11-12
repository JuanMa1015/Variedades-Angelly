"""Venta de cartera: reglas, auditoria, plata fuera de la caja del vendedor y anulacion."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from src.infrastructure.database.models import (
    AbonoCarteraModel,
    AuditoriaModel,
    ClienteModel,
    MovimientoStockModel,
    ProductoModel,
    VentaModel,
)
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from tests.test_clientes_cartera_reglas import _admin, _cliente


def _producto(sf, precio=1000.0, stock=50, catalogo="cartera", activo=True, nombre="Arroz") -> int:
    with sf() as db:
        producto = ProductoModel(
            nombre=nombre, precio_costo=precio / 2, precio_venta=precio, stock_actual=stock, stock_minimo=1, catalogo=catalogo, activo=activo,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _vender(client, cliente, producto, cantidad=3, abono=0, metodo="efectivo", **extra):
    cuerpo = {"cliente_id": cliente, "items": [{"producto_id": producto, "cantidad": cantidad}], "abono_inicial": abono, "metodo_pago": metodo, **extra}
    return client.post("/api/cartera/ventas", headers=_admin(client), json=cuerpo)


def _deuda(sf, cliente) -> float:
    with sf() as db:
        return float(db.get(ClienteModel, cliente).deuda_total)


def _stock(sf, producto) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto).stock_actual


def _auditoria(sf, accion) -> list[str]:
    with sf() as db:
        return list(
            db.execute(
                select(AuditoriaModel.detalle).where(
                    AuditoriaModel.modulo == "cartera", AuditoriaModel.entidad == "venta", AuditoriaModel.accion == accion,
                ),
            ).scalars(),
        )


# -- Reglas al vender --


def test_no_se_vende_a_un_cliente_desactivado(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, activo=False), _producto(sf)

    respuesta = _vender(client, cliente, producto)

    assert respuesta.status_code == 400 and "desactivado" in respuesta.json()["detail"]
    assert _stock(sf, producto) == 50


def test_no_se_vende_un_producto_desactivado_ni_uno_de_tienda(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)
    inactivo = _producto(sf, activo=False, nombre="Inactivo")
    de_tienda = _producto(sf, catalogo="tienda", nombre="De tienda")

    assert "desactivado" in _vender(client, cliente, inactivo).json()["detail"]
    respuesta = _vender(client, cliente, de_tienda)
    assert respuesta.status_code == 400 and "no es un producto de cartera" in respuesta.json()["detail"]
    assert _stock(sf, de_tienda) == 50 and _deuda(sf, cliente) == 0


def test_un_abono_inicial_exige_decir_como_se_pago(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)

    respuesta = client.post(
        "/api/cartera/ventas",
        headers=_admin(client),
        json={"cliente_id": cliente, "items": [{"producto_id": producto, "cantidad": 3}], "abono_inicial": 500},
    )

    assert respuesta.status_code == 400 and "metodo de pago" in respuesta.json()["detail"]
    assert _deuda(sf, cliente) == 0 and _stock(sf, producto) == 50


def test_se_puede_registrar_una_venta_con_fecha_pasada_pero_no_futura(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    pasada = (datetime.now(UTC) - timedelta(days=20)).isoformat()
    futura = (datetime.now(UTC) + timedelta(days=2)).isoformat()

    assert _vender(client, cliente, producto, cantidad=1, fecha_venta=pasada).status_code == 201
    respuesta = _vender(client, cliente, producto, cantidad=1, fecha_venta=futura)

    assert respuesta.status_code == 400 and "futura" in respuesta.json()["detail"]
    assert _deuda(sf, cliente) == 1000  # solo cuenta la primera


def test_la_venta_guarda_quien_la_hizo_queda_en_auditoria_y_fuera_de_caja(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)

    respuesta = _vender(client, cliente, producto, cantidad=3, abono=1000)

    assert respuesta.status_code == 201, respuesta.text
    venta_id = respuesta.json()["venta_id"]
    with sf() as db:
        venta = db.get(VentaModel, venta_id)
        assert venta.creado_por == "angelly_admin" and venta.fuera_de_caja is True
        abono = db.execute(select(AbonoCarteraModel)).scalar_one()
        assert abono.venta_id == venta_id and abono.fuera_de_caja is True
    detalle = _auditoria(sf, "crear")
    assert len(detalle) == 1 and "total 3000.0" in detalle[0] and "abono inicial 1000.0" in detalle[0]


def test_la_plata_de_cartera_no_entra_a_la_caja_del_vendedor(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    superadmin = {"Authorization": f"Bearer {_login_token(client, 'angelly_superadmin', 'supersecure123')}"}

    assert _vender(client, cliente, producto, cantidad=3, abono=3000).status_code == 201  # contado: 3000 en efectivo

    turno = client.get("/api/caja/estado", headers=superadmin).json()["caja_actual"]
    assert turno is not None and turno["monto_ventas_efectivo"] == 0
    assert client.get(f"/api/caja/{turno['id']}/movimientos", headers=superadmin).json() == []


# -- Anular --


def _anular(client, venta_id, motivo="Se digito mal"):
    return client.post(f"/api/cartera/ventas/{venta_id}/anular", headers=_admin(client), json={"motivo": motivo})


def test_anular_devuelve_el_stock_la_deuda_y_el_abono_inicial_y_deja_rastro(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    venta_id = _vender(client, cliente, producto, cantidad=5, abono=1000).json()["venta_id"]  # debe 4.000
    assert _deuda(sf, cliente) == 4000 and _stock(sf, producto) == 45

    respuesta = _anular(client, venta_id)

    assert respuesta.status_code == 200, respuesta.text
    assert _deuda(sf, cliente) == 0 and _stock(sf, producto) == 50
    with sf() as db:
        venta = db.get(VentaModel, venta_id)
        assert venta.anulada and venta.anulada_por == "angelly_admin" and venta.motivo_anulacion == "Se digito mal"
        assert db.execute(select(AbonoCarteraModel)).scalars().all() == []
        devueltos = db.execute(select(MovimientoStockModel).where(MovimientoStockModel.tipo == "anulacion_venta")).scalars().all()
        assert [m.delta for m in devueltos] == [5]
    detalle = _auditoria(sf, "anular")
    assert len(detalle) == 1 and "Se digito mal" in detalle[0]


def test_anular_una_venta_de_contado_no_toca_la_deuda_de_otras_ventas(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    _vender(client, cliente, producto, cantidad=2)  # debe 2.000
    contado = _vender(client, cliente, producto, cantidad=3, abono=3000).json()["venta_id"]

    assert _anular(client, contado).status_code == 200

    assert _deuda(sf, cliente) == 2000 and _stock(sf, producto) == 48


def test_no_se_anula_si_el_cliente_ya_abono_lo_que_esa_venta_dejo(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    venta_id = _vender(client, cliente, producto, cantidad=5).json()["venta_id"]  # debe 5.000
    abono = client.post(f"/api/cartera/clientes/{cliente}/abonos", headers=_admin(client), json={"monto": 3000, "metodo_pago": "efectivo"})
    assert abono.status_code == 201

    respuesta = _anular(client, venta_id)

    assert respuesta.status_code == 409 and "ya abono" in respuesta.json()["detail"]
    assert _deuda(sf, cliente) == 2000 and _stock(sf, producto) == 45


def test_una_venta_anulada_no_se_anula_dos_veces_ni_cuenta_en_las_compras(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    venta_id = _vender(client, cliente, producto, cantidad=2).json()["venta_id"]
    assert _anular(client, venta_id).status_code == 200

    assert _anular(client, venta_id).status_code == 409
    lista = client.get("/api/cartera/clientes/paginados", headers=_admin(client)).json()["data"]
    assert lista[0]["compras_cantidad"] == 0 and lista[0]["compras_total"] == 0
    historial = client.get("/api/cartera/ventas/historial", headers=_admin(client)).json()
    assert historial[0]["anulada"] is True and historial[0]["motivo_anulacion"] == "Se digito mal"


def test_anular_pide_motivo_y_solo_lo_hace_cartera(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    venta_id = _vender(client, cliente, producto, cantidad=1).json()["venta_id"]
    vendedor = {"Authorization": f"Bearer {_login_token(client, 'vendedor1', 'ventas123')}"}

    assert _anular(client, venta_id, motivo="x").status_code == 422
    assert client.post(f"/api/cartera/ventas/{venta_id}/anular", headers=vendedor, json={"motivo": "Intento"}).status_code == 403
    assert _anular(client, 99999).status_code == 404


def test_una_venta_hecha_en_el_punto_de_venta_no_se_anula_desde_cartera(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)
    with sf() as db:
        venta = VentaModel(cliente_id=cliente, total=1000, saldo_pendiente=0, creado_por="vendedor1", fuera_de_caja=False)
        db.add(venta)
        db.commit()
        venta_id = venta.id

    respuesta = _anular(client, venta_id)

    assert respuesta.status_code == 409 and "punto de venta" in respuesta.json()["detail"]


def test_una_venta_vieja_sin_enlace_se_anula_con_su_abono_reconocido_por_fecha(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, deuda=3000.0), _producto(sf)
    fecha = datetime(2026, 5, 1, 10, 0, 0)
    with sf() as db:
        venta = VentaModel(cliente_id=cliente, total=4000, saldo_pendiente=3000, es_fiado=True, tipo_fiado="cartera", fecha=fecha, fuera_de_caja=True)
        db.add(venta)
        db.flush()
        db.add(AbonoCarteraModel(cliente_id=cliente, monto=1000, metodo_pago="efectivo", saldo_cliente=3000, fecha=fecha))
        db.commit()
        venta_id = venta.id

    assert _anular(client, venta_id).status_code == 200

    assert _deuda(sf, cliente) == 0
    with sf() as db:
        assert db.execute(select(AbonoCarteraModel)).scalars().all() == []
    assert _stock(sf, producto) == 50
