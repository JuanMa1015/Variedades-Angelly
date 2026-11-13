"""Anulacion de ventas con autorizacion y caja obligatoria para vender."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from src.auth.security import hash_password
from src.infrastructure.database.models import (
    AuditoriaModel,
    CierreCajaModel,
    ClienteFiadoTiendaModel,
    ClienteFidelizacionModel,
    ClienteModel,
    ProductoModel,
    UsuarioModel,
    VentaModel,
)
from src.infrastructure.repositories.ingresos import cobros_por_metodo
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _admin(client) -> str:
    return _login_token(client, "angelly_superadmin", "supersecure123")


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _producto(sf, stock: int = 10) -> int:
    with sf() as db:
        producto = ProductoModel(
            nombre="Arroz", precio_costo=500.0, precio_venta=1000.0, stock_actual=stock, stock_minimo=1,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _vender(client, token, producto_id, cantidad=2, **extra):
    cuerpo = {
        "items": [{"producto_id": producto_id, "cantidad": cantidad}],
        "es_fiado": False,
        "metodo_pago": "efectivo",
        **extra,
    }
    respuesta = client.post("/api/ventas", headers=_h(token), json=cuerpo)
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()["venta_id"]


def _anular(client, token, venta_id, **extra):
    return client.post(
        f"/api/ventas/{venta_id}/anular",
        headers=_h(token),
        json={"motivo": "Error al digitar", **extra},
    )


def _stock(sf, producto_id: int) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto_id).stock_actual


def _cerrar_todas_las_cajas(sf) -> None:
    with sf() as db:
        for caja in db.execute(select(CierreCajaModel)).scalars():
            db.delete(caja)
        db.commit()


# -- Caja obligatoria --


def test_no_se_puede_vender_con_la_caja_cerrada(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    _cerrar_todas_las_cajas(sf)

    respuesta = client.post(
        "/api/ventas",
        headers=_h(_admin(client)),
        json={"items": [{"producto_id": producto, "cantidad": 1}], "es_fiado": False, "metodo_pago": "efectivo"},
    )

    assert respuesta.status_code == 409
    assert "caja" in respuesta.json()["detail"].lower()
    assert _stock(sf, producto) == 10


def test_el_vendedor_y_el_admin_pueden_abrir_la_caja(auth_client) -> None:
    client, sf = auth_client
    _cerrar_todas_las_cajas(sf)

    estado = client.get("/api/caja/estado", headers=_h(_admin(client)))
    assert estado.status_code == 200 and estado.json()["abierta"] is False
    apertura = client.post("/api/caja/apertura", headers=_h(_admin(client)), json={"monto_inicial": 5000})
    assert apertura.status_code == 201

    assert _vender(client, _vendedor(client), _producto(sf)) > 0


# -- Anulacion --


def test_el_admin_anula_una_venta_y_se_devuelve_el_stock(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    venta = _vender(client, _admin(client), producto, cantidad=3)
    assert _stock(sf, producto) == 7

    respuesta = _anular(client, _admin(client), venta)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["anulada"] is True
    assert cuerpo["motivo_anulacion"] == "Error al digitar"
    assert cuerpo["anulada_por"] == "angelly_superadmin"
    assert cuerpo["autorizada_por"] == "angelly_superadmin"
    assert _stock(sf, producto) == 10
    with sf() as db:
        assert db.get(VentaModel, venta) is not None  # no se borra
        acciones = db.execute(select(AuditoriaModel.accion)).scalars().all()
    assert "anular" in acciones


def test_la_venta_anulada_no_cuenta_en_la_caja(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    _vender(client, _admin(client), producto, cantidad=1)
    anulada = _vender(client, _admin(client), producto, cantidad=2)
    _anular(client, _admin(client), anulada)

    with sf() as db:
        assert cobros_por_metodo(db) == {"efectivo": 1000.0}


def test_no_se_puede_anular_dos_veces(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    venta = _vender(client, _admin(client), producto)
    assert _anular(client, _admin(client), venta).status_code == 200

    segunda = _anular(client, _admin(client), venta)

    assert segunda.status_code == 409
    assert _stock(sf, producto) == 10


def test_el_vendedor_sin_autorizacion_no_puede_anular(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    venta = _vender(client, _vendedor(client), producto)

    respuesta = _anular(client, _vendedor(client), venta)

    assert respuesta.status_code == 403
    assert _stock(sf, producto) == 8


def test_el_vendedor_anula_con_la_clave_de_un_admin(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    venta = _vender(client, _vendedor(client), producto)

    respuesta = _anular(
        client,
        _vendedor(client),
        venta,
        autorizador_usuario="angelly_admin",
        autorizador_password="cambiame123",
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["anulada_por"] == "vendedor1"
    assert respuesta.json()["autorizada_por"] == "angelly_admin"
    assert _stock(sf, producto) == 10


def test_la_clave_del_autorizador_debe_ser_correcta_y_de_un_admin(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    venta = _vender(client, _vendedor(client), producto)
    token = _vendedor(client)

    casos = [
        {"autorizador_usuario": "angelly_admin", "autorizador_password": "incorrecta"},
        {"autorizador_usuario": "vendedor1", "autorizador_password": "ventas123"},  # no es admin
        {"autorizador_usuario": "no_existe", "autorizador_password": "cambiame123"},
    ]
    for caso in casos:
        assert _anular(client, token, venta, **caso).status_code == 403
    assert _stock(sf, producto) == 8


def test_un_admin_desactivado_no_puede_autorizar(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    venta = _vender(client, _vendedor(client), producto)
    with sf() as db:
        db.add(UsuarioModel(username="jefe", password_hash=hash_password("clave-jefe-123"), rol="admin", activo=False))
        db.commit()

    respuesta = _anular(
        client, _vendedor(client), venta, autorizador_usuario="jefe", autorizador_password="clave-jefe-123",
    )

    assert respuesta.status_code == 403


def test_el_motivo_es_obligatorio(auth_client) -> None:
    client, sf = auth_client
    venta = _vender(client, _admin(client), _producto(sf))

    respuesta = client.post(f"/api/ventas/{venta}/anular", headers=_h(_admin(client)), json={"motivo": "  "})

    assert respuesta.status_code == 422


def test_anular_sin_sesion_o_venta_inexistente(auth_client) -> None:
    client, _ = auth_client

    assert client.post("/api/ventas/1/anular", json={"motivo": "abc"}).status_code == 401
    assert _anular(client, _admin(client), 9999).status_code == 404


def test_no_se_anula_una_venta_de_un_turno_cerrado(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    venta = _vender(client, _admin(client), producto)
    with sf() as db:
        caja = db.execute(select(CierreCajaModel)).scalars().first()
        caja.fecha_cierre = datetime(2020, 1, 2)
        db.commit()

    respuesta = _anular(client, _admin(client), venta)

    assert respuesta.status_code == 409
    assert "turno" in respuesta.json()["detail"].lower()


def test_anular_un_fiado_de_tienda_devuelve_la_deuda(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    with sf() as db:
        cliente = ClienteFiadoTiendaModel(nombre="Don Pedro", telefono_whatsapp="3000000000")
        db.add(cliente)
        db.commit()
        cliente_id = cliente.id
    venta = _vender(
        client, _admin(client), producto, cantidad=3,
        es_fiado=True, fiado_origen="tienda", cliente_tienda_id=cliente_id, abono_inicial=1000,
    )
    with sf() as db:
        assert float(db.get(ClienteFiadoTiendaModel, cliente_id).deuda_total) == 2000.0

    assert _anular(client, _admin(client), venta).status_code == 200

    with sf() as db:
        assert float(db.get(ClienteFiadoTiendaModel, cliente_id).deuda_total) == 0.0


def test_anular_revierte_los_puntos_de_fidelizacion(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    with sf() as db:
        cliente = ClienteFidelizacionModel(nombre="Ana", telefono_whatsapp="3001112233", puntos_acumulados=0)
        db.add(cliente)
        db.commit()
        cliente_id = cliente.id
    venta = _vender(client, _admin(client), producto, cantidad=5, cliente_fidelizacion_id=cliente_id)
    with sf() as db:
        assert db.get(ClienteFidelizacionModel, cliente_id).puntos_acumulados == 5

    assert _anular(client, _admin(client), venta).status_code == 200

    with sf() as db:
        assert db.get(ClienteFidelizacionModel, cliente_id).puntos_acumulados == 0


def test_las_ventas_de_cartera_no_se_anulan_aqui(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    with sf() as db:
        cliente = ClienteModel(nombre="Cartera", documento="C1", limite_credito=100000.0, deuda_total=0.0)
        db.add(cliente)
        db.commit()
        cliente_id = cliente.id
    venta = _vender(
        client, _admin(client), producto, es_fiado=True, fiado_origen="cartera", cliente_id=cliente_id,
    )

    assert _anular(client, _admin(client), venta).status_code == 409


def test_el_listado_muestra_las_anuladas_y_el_dashboard_no_las_suma(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    _vender(client, _admin(client), producto, cantidad=1)
    anulada = _vender(client, _admin(client), producto, cantidad=4)
    _anular(client, _admin(client), anulada)

    listado = client.get("/api/ventas/paginadas", headers=_h(_login_token(client, "vendedor1", "ventas123"))).json()["data"]
    por_id = {v["venta_id"]: v for v in listado}
    assert por_id[anulada]["anulada"] is True
    assert sum(1 for v in listado if v["anulada"]) == 1

    hoy = client.get("/api/dashboard/vendedor", headers=_h(_admin(client))).json()["ventas"]["hoy"]
    assert hoy["total"] == 1000.0 and hoy["transacciones"] == 1


def test_una_venta_anulada_no_se_borra_ni_se_edita(auth_client) -> None:
    client, sf = auth_client
    producto = _producto(sf)
    venta = _vender(client, _admin(client), producto, cantidad=3)
    _anular(client, _admin(client), venta)
    assert _stock(sf, producto) == 10

    borrar = client.delete(f"/api/ventas/{venta}", headers=_h(_admin(client)))
    editar = client.patch(f"/api/ventas/{venta}", headers=_h(_admin(client)), json={"total": 1})

    assert borrar.status_code == 409 and editar.status_code == 409
    assert _stock(sf, producto) == 10  # no se devolvio el stock una segunda vez
