"""Pruebas de integridad del dinero: deuda, caja, cupo de credito y reglas de venta."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    ClienteFiadoTiendaModel,
    ClienteModel,
    ProductoModel,
)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _producto(session_factory, precio: float = 1000.0, stock: int = 50, activo: bool = True) -> int:
    with session_factory() as db:
        producto = ProductoModel(
            nombre=f"Prod {precio}-{activo}",
            precio_costo=precio / 2,
            precio_venta=precio,
            stock_actual=stock,
            stock_minimo=1,
            activo=activo,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _cliente_tienda(session_factory, activo: bool = True) -> int:
    with session_factory() as db:
        cliente = ClienteFiadoTiendaModel(nombre="Fiado Tienda", telefono_whatsapp="3000000000", activo=activo)
        db.add(cliente)
        db.commit()
        return cliente.id


def _cliente_cartera(session_factory, limite: float = 100000.0, deuda: float = 0.0, activo: bool = True) -> int:
    with session_factory() as db:
        cliente = ClienteModel(
            nombre="Cartera Cliente",
            documento=f"D{limite}{deuda}{activo}",
            limite_credito=limite,
            deuda_total=deuda,
            activo=activo,
        )
        db.add(cliente)
        db.commit()
        return cliente.id


def _deuda_tienda(session_factory, cliente_id: int) -> float:
    with session_factory() as db:
        return float(db.get(ClienteFiadoTiendaModel, cliente_id).deuda_total)


def _deuda_cartera(session_factory, cliente_id: int) -> float:
    with session_factory() as db:
        return float(db.get(ClienteModel, cliente_id).deuda_total)


def _vender_fiado_tienda(client, token, producto_id, cliente_id, cantidad=3, abono=1000.0):
    return client.post(
        "/api/ventas",
        headers=_h(token),
        json={
            "cliente_tienda_id": cliente_id,
            "items": [{"producto_id": producto_id, "cantidad": cantidad}],
            "es_fiado": True,
            "fiado_origen": "tienda",
            "abono_inicial": abono,
            "metodo_pago": "efectivo",
        },
    )


# ── Deuda de ventas fiadas de tienda ──


def test_fiado_tienda_guarda_el_saldo_de_la_venta_y_suma_la_deuda(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_tienda(sf)
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _vender_fiado_tienda(client, token, producto, cliente)

    assert respuesta.status_code == 201
    assert respuesta.json()["saldo_pendiente"] == 2000  # 3000 de total - 1000 de abono
    assert _deuda_tienda(sf, cliente) == 2000


def test_eliminar_venta_fiada_de_tienda_revierte_la_deuda(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_tienda(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    venta_id = _vender_fiado_tienda(client, vendedor, producto, cliente).json()["venta_id"]

    assert client.delete(f"/api/ventas/{venta_id}", headers=_h(admin)).status_code == 204

    assert _deuda_tienda(sf, cliente) == 0


def test_editar_total_de_venta_fiada_ajusta_la_deuda_por_la_diferencia(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_tienda(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    venta_id = _vender_fiado_tienda(client, vendedor, producto, cliente).json()["venta_id"]

    respuesta = client.patch(
        f"/api/ventas/{venta_id}",
        headers=_h(admin),
        json={"total": 3000, "saldo_pendiente": 500},
    )

    assert respuesta.status_code == 200
    assert _deuda_tienda(sf, cliente) == 500


def test_pasar_una_venta_fiada_a_contado_libera_la_deuda(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_tienda(sf)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    venta_id = _vender_fiado_tienda(client, vendedor, producto, cliente).json()["venta_id"]

    client.patch(f"/api/ventas/{venta_id}", headers=_h(admin), json={"es_fiado": False})

    assert _deuda_tienda(sf, cliente) == 0


def test_cambiar_el_cliente_de_una_venta_fiada_mueve_la_deuda(auth_client) -> None:
    client, sf = auth_client
    producto, cliente_a = _producto(sf), _cliente_tienda(sf)
    with sf() as db:
        otro = ClienteFiadoTiendaModel(nombre="Otro Fiado")
        db.add(otro)
        db.commit()
        cliente_b = otro.id
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    venta_id = _vender_fiado_tienda(client, vendedor, producto, cliente_a).json()["venta_id"]

    client.patch(f"/api/ventas/{venta_id}", headers=_h(admin), json={"cliente_tienda_id": cliente_b})

    assert _deuda_tienda(sf, cliente_a) == 0
    assert _deuda_tienda(sf, cliente_b) == 2000


# ── Abonos de cartera ──


def _abono(sf, cliente_id: int, monto: float) -> int:
    with sf() as db:
        abono = AbonoCarteraModel(cliente_id=cliente_id, monto=monto, metodo_pago="efectivo", saldo_cliente=0)
        db.add(abono)
        db.commit()
        return abono.id


def test_eliminar_un_abono_restituye_la_deuda(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente_cartera(sf, deuda=4000)
    abono = _abono(sf, cliente, 1500)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    assert client.delete(f"/api/cartera/abonos/{abono}", headers=_h(admin)).status_code == 204

    assert _deuda_cartera(sf, cliente) == 5500


def test_editar_el_monto_de_un_abono_reajusta_la_deuda(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente_cartera(sf, deuda=4000)
    abono = _abono(sf, cliente, 1500)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    # Abono baja de 1500 a 1000: el cliente debe 500 mas.
    respuesta = client.patch(f"/api/cartera/abonos/{abono}", headers=_h(admin), json={"monto": 1000})

    assert respuesta.status_code == 200
    assert _deuda_cartera(sf, cliente) == 4500


def test_no_se_puede_subir_un_abono_por_encima_de_la_deuda(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente_cartera(sf, deuda=100)
    abono = _abono(sf, cliente, 500)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    respuesta = client.patch(f"/api/cartera/abonos/{abono}", headers=_h(admin), json={"monto": 900})

    assert respuesta.status_code == 400
    assert _deuda_cartera(sf, cliente) == 100


# ── Cupo de credito y estados activos ──


def _fiado_cartera(client, token, producto_id, cliente_id, abono=0.0, cantidad=3):
    return client.post(
        "/api/ventas",
        headers=_h(token),
        json={
            "cliente_id": cliente_id,
            "items": [{"producto_id": producto_id, "cantidad": cantidad}],
            "es_fiado": True,
            "fiado_origen": "cartera",
            "abono_inicial": abono,
            "metodo_pago": "efectivo",
        },
    )


def test_fiado_de_cartera_no_puede_superar_el_cupo(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_cartera(sf, limite=2000)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    respuesta = _fiado_cartera(client, admin, producto, cliente)

    assert respuesta.status_code == 400
    assert "cupo" in respuesta.json()["detail"]
    assert _deuda_cartera(sf, cliente) == 0


def test_fiado_de_cartera_dentro_del_cupo_registra_el_abono_inicial(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_cartera(sf, limite=5000)
    admin = _login_token(client, "angelly_admin", "cambiame123")

    respuesta = _fiado_cartera(client, admin, producto, cliente, abono=1000)

    assert respuesta.status_code == 201
    assert _deuda_cartera(sf, cliente) == 2000
    with sf() as db:
        abonos = db.execute(select(AbonoCarteraModel).where(AbonoCarteraModel.cliente_id == cliente)).scalars().all()
        assert [a.monto for a in abonos] == [1000]


def test_no_se_vende_un_producto_desactivado(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf, activo=False)
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = client.post(
        "/api/ventas",
        headers=_h(token),
        json={"items": [{"producto_id": producto, "cantidad": 1}], "es_fiado": False, "metodo_pago": "efectivo"},
    )

    assert respuesta.status_code == 400
    assert "desactivado" in respuesta.json()["detail"]


def test_no_se_fia_a_un_cliente_desactivado(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_tienda(sf, activo=False)
    token = _login_token(client, "vendedor1", "ventas123")

    assert _vender_fiado_tienda(client, token, producto, cliente).status_code == 400


def test_venta_con_cobro_exige_metodo_de_pago(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = client.post(
        "/api/ventas",
        headers=_h(token),
        json={"items": [{"producto_id": producto, "cantidad": 1}], "es_fiado": False},
    )

    assert respuesta.status_code == 400


# ── Caja ──


def _abrir_caja(client, token, monto):
    return client.post("/api/caja/apertura", headers=_h(token), json={"monto_inicial": monto})


def _vender_contado(client, token, producto, metodo, cantidad=2):
    return client.post(
        "/api/ventas",
        headers=_h(token),
        json={"items": [{"producto_id": producto, "cantidad": cantidad}], "es_fiado": False, "metodo_pago": metodo},
    )


@pytest.mark.sin_turno
def test_se_puede_abrir_caja_con_base_cero(auth_client) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")

    assert _abrir_caja(client, token, 0).status_code == 201


@pytest.mark.sin_turno
def test_caja_solo_cuenta_el_dinero_cobrado_y_el_efectivo_esperado(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_tienda(sf)
    token = _login_token(client, "vendedor1", "ventas123")
    _abrir_caja(client, token, 10000)

    _vender_contado(client, token, producto, "efectivo")  # +2000 efectivo
    _vender_contado(client, token, producto, "transferencia")  # +2000 transferencia
    _vender_fiado_tienda(client, token, producto, cliente)  # total 3000, solo 1000 cobrado en efectivo

    # El vendedor cuenta a ciegas: el efectivo esperado lo ve el superadmin.
    superadmin = _login_token(client, "angelly_superadmin", "supersecure123")
    caja = client.get("/api/caja/estado", headers=_h(superadmin)).json()["caja_actual"]

    assert caja["monto_ventas_efectivo"] == 3000
    assert caja["monto_ventas_transferencia"] == 2000
    # Efectivo en el cajon: base + efectivo. Las transferencias no estan fisicamente en caja.
    assert caja["saldo_esperado"] == 13000


def test_cobrar_abono_inicial_de_cartera_entra_a_caja_una_sola_vez(auth_client) -> None:
    client, sf = auth_client
    producto, cliente = _producto(sf), _cliente_cartera(sf, limite=50000)
    vendedor = _login_token(client, "vendedor1", "ventas123")
    admin = _login_token(client, "angelly_admin", "cambiame123")
    _abrir_caja(client, vendedor, 0)

    _fiado_cartera(client, admin, producto, cliente, abono=1000)

    caja = client.get("/api/caja/estado", headers=_h(vendedor)).json()["caja_actual"]
    assert caja["monto_ventas_efectivo"] == 1000
