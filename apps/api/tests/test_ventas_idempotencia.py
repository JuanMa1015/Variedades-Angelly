"""Repetir el cobro (reintento tras perder la conexion, doble clic) no duplica la venta ni el descuento de stock."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select

from src.api.routers import ventas_fidelizacion as ventas_router
from src.infrastructure.database.models import CierreCajaModel, ProductoModel, VentaModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

CLAVE = "cobro-0001-aaaa-bbbb"


def _h(client, usuario: str = "vendedor") -> dict[str, str]:
    credenciales = {"vendedor": ("vendedor1", "ventas123"), "super": ("angelly_superadmin", "supersecure123")}[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def _producto(sf, stock=10, precio=1000.0) -> int:
    with sf() as db:
        producto = ProductoModel(nombre="Arroz", precio_costo=500, precio_venta=precio, stock_actual=stock, stock_minimo=1, catalogo="tienda")
        db.add(producto)
        db.commit()
        return producto.id


def _cobrar(client, producto, cantidad=2, clave=CLAVE, usuario="vendedor"):
    cuerpo = {"items": [{"producto_id": producto, "cantidad": cantidad}], "es_fiado": False, "metodo_pago": "efectivo"}
    if clave is not None:
        cuerpo["clave_idempotencia"] = clave
    return client.post("/api/ventas", headers=_h(client, usuario), json=cuerpo)


def _ventas(sf) -> int:
    with sf() as db:
        return db.execute(select(func.count(VentaModel.id))).scalar_one()


def _stock(sf, producto) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto).stock_actual


def test_el_mismo_cobro_repetido_devuelve_la_misma_venta_sin_duplicar(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)

    primero = _cobrar(client, arroz)
    segundo = _cobrar(client, arroz)

    assert primero.status_code == 201 and segundo.status_code == 200
    assert segundo.headers["Idempotent-Replay"] == "true" and "Idempotent-Replay" not in primero.headers
    assert segundo.json()["venta_id"] == primero.json()["venta_id"] and segundo.json()["total"] == 2000.0
    assert _ventas(sf) == 1
    assert _stock(sf, arroz) == 8  # se descontó una sola vez


def test_el_reintento_funciona_aunque_la_caja_ya_se_haya_cerrado(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    primero = _cobrar(client, arroz)
    with sf() as db:
        for caja in db.execute(select(CierreCajaModel)).scalars():
            caja.fecha_cierre = datetime.now(UTC).replace(tzinfo=None)
        db.commit()

    repetido = _cobrar(client, arroz)

    assert repetido.status_code == 200 and repetido.json()["venta_id"] == primero.json()["venta_id"]
    assert _cobrar(client, arroz, clave="otra-clave-0002").status_code == 409  # una venta nueva sí exige caja abierta


def test_la_misma_clave_con_otro_contenido_es_un_error_y_no_vende(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    _cobrar(client, arroz, cantidad=2)

    distinto = _cobrar(client, arroz, cantidad=5)

    assert distinto.status_code == 409 and "clave de cobro" in distinto.json()["detail"]
    assert _ventas(sf) == 1 and _stock(sf, arroz) == 8


def test_claves_distintas_o_sin_clave_son_ventas_distintas(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)

    _cobrar(client, arroz, clave="cobro-aaaaaaaa-1")
    _cobrar(client, arroz, clave="cobro-aaaaaaaa-2")
    _cobrar(client, arroz, clave=None)
    _cobrar(client, arroz, clave=None)

    assert _ventas(sf) == 4 and _stock(sf, arroz) == 2


def test_la_clave_es_de_cada_vendedor(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)

    mia = _cobrar(client, arroz, usuario="vendedor")
    de_otro = _cobrar(client, arroz, usuario="super")

    assert mia.status_code == 201 and de_otro.status_code == 201
    assert mia.json()["venta_id"] != de_otro.json()["venta_id"]


def test_un_cobro_que_fallo_no_deja_la_clave_gastada(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, stock=3)

    sin_stock = _cobrar(client, arroz, cantidad=5)
    arreglado = _cobrar(client, arroz, cantidad=2)  # mismo cobro, ya con una cantidad que alcanza

    assert sin_stock.status_code == 400
    assert arreglado.status_code == 201 and _ventas(sf) == 1 and _stock(sf, arroz) == 1


def test_dos_envios_simultaneos_del_mismo_cobro_dejan_una_sola_venta(auth_client, monkeypatch) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    primero = _cobrar(client, arroz)
    real = ventas_router._venta_de_la_clave
    llamadas = []

    def ciega_la_primera_vez(db, usuario, clave):  # el segundo envio no veia todavia la venta del primero
        llamadas.append(1)
        return None if len(llamadas) == 1 else real(db, usuario, clave)

    monkeypatch.setattr(ventas_router, "_venta_de_la_clave", ciega_la_primera_vez)

    segundo = _cobrar(client, arroz)

    assert segundo.status_code == 200 and segundo.json()["venta_id"] == primero.json()["venta_id"]
    assert _ventas(sf) == 1 and _stock(sf, arroz) == 8  # el intento perdedor no descontó nada


def test_la_clave_debe_tener_un_formato_valido(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)

    assert _cobrar(client, arroz, clave="corta").status_code == 422
    assert _cobrar(client, arroz, clave="con espacios y ñ ño").status_code == 422
    assert _cobrar(client, arroz, clave="x" * 65).status_code == 422
    assert _ventas(sf) == 0
