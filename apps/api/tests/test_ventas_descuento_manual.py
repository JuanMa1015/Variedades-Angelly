"""Descuento manual del vendedor: hasta un limite lo aplica solo, mas arriba lo autoriza un admin, nunca bajo el costo."""

from __future__ import annotations

from sqlalchemy import select

from src.infrastructure.database.models import AuditoriaModel, ProductoModel, VentaModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

ADMIN = {"autorizador_usuario": "angelly_admin", "autorizador_password": "cambiame123"}


def _h(client, usuario: str = "vendedor") -> dict[str, str]:
    credenciales = {"vendedor": ("vendedor1", "ventas123"), "super": ("angelly_superadmin", "supersecure123")}[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def _producto(sf, stock=100, precio=1000.0, costo=500.0) -> int:
    with sf() as db:
        producto = ProductoModel(nombre="Arroz", precio_costo=costo, precio_venta=precio, stock_actual=stock, stock_minimo=1, catalogo="tienda")
        db.add(producto)
        db.commit()
        return producto.id


def _vender(client, producto, cantidad=10, descuento=None, usuario="vendedor", **extra):
    cuerpo = {"items": [{"producto_id": producto, "cantidad": cantidad}], "es_fiado": False, "metodo_pago": "efectivo", **extra}
    if descuento is not None:
        cuerpo["descuento_manual"] = descuento
    return client.post("/api/ventas", headers=_h(client, usuario), json=cuerpo)


def _pct(valor, motivo="Cliente frecuente"):
    return {"tipo": "porcentaje", "valor": valor, "motivo": motivo}


def _pesos(valor, motivo="Cliente frecuente"):
    return {"tipo": "monto", "valor": valor, "motivo": motivo}


def test_hasta_el_limite_el_vendedor_lo_aplica_solo_y_queda_registrado(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)  # 10 x 1.000 = 10.000

    en_porcentaje = _vender(client, arroz, descuento=_pct(5))
    en_pesos = _vender(client, arroz, descuento=_pesos(500, "Producto con empaque roto"))

    assert en_porcentaje.status_code == 201 and en_pesos.status_code == 201
    cuerpo = en_porcentaje.json()
    assert cuerpo["total"] == 9500.0 and cuerpo["descuento_manual"] == 500.0
    assert cuerpo["descuento_manual_motivo"] == "Cliente frecuente" and cuerpo["descuento_autorizado_por"] is None
    assert en_pesos.json()["total"] == 9500.0
    with sf() as db:
        venta = db.get(VentaModel, cuerpo["venta_id"])
        auditoria = db.execute(select(AuditoriaModel).where(AuditoriaModel.accion == "descuento_manual")).scalars().first()
    assert float(venta.descuento_manual) == 500.0
    assert "Cliente frecuente" in auditoria.detalle and "vendedor1" == auditoria.usuario


def test_pasado_el_limite_pide_la_clave_de_un_admin(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)

    sin = _vender(client, arroz, descuento=_pct(10))
    mala = _vender(client, arroz, descuento=_pct(10), autorizador_usuario="angelly_admin", autorizador_password="mala")
    con = _vender(client, arroz, descuento=_pct(10), **ADMIN)
    propio = _vender(client, arroz, descuento=_pct(10), usuario="super")  # el superadmin se autoriza solo

    assert sin.status_code == 403 and "descuento de mas de 5 %" in sin.json()["detail"]
    assert mala.status_code == 403
    assert con.status_code == 201 and con.json()["total"] == 9000.0 and con.json()["descuento_autorizado_por"] == "angelly_admin"
    assert propio.status_code == 201 and propio.json()["descuento_autorizado_por"] == "angelly_superadmin"
    with sf() as db:
        stock = db.execute(select(ProductoModel.stock_actual)).scalar_one()
    assert stock == 100 - 20  # solo se vendio lo autorizado


def test_el_limite_se_puede_cambiar_con_una_variable_de_entorno(auth_client, monkeypatch) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    monkeypatch.setenv("DESCUENTO_MAX_SIN_AUTORIZACION_PCT", "20")

    diez = _vender(client, arroz, descuento=_pct(10))
    treinta = _vender(client, arroz, descuento=_pct(30))
    config = client.get("/api/ventas/config", headers=_h(client)).json()

    assert diez.status_code == 201 and treinta.status_code == 403
    assert config == {"descuento_max_sin_autorizacion_pct": 20.0}


def test_la_configuracion_por_defecto_es_5_por_ciento(auth_client) -> None:
    client, _ = auth_client

    assert client.get("/api/ventas/config", headers=_h(client)).json() == {"descuento_max_sin_autorizacion_pct": 5.0}


def test_nunca_por_debajo_del_costo_ni_con_autorizacion(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf, precio=1000.0, costo=900.0)  # 10 x 1.000 = 10.000; costo 9.000

    bajo_el_costo = _vender(client, arroz, descuento=_pct(15), **ADMIN)
    justo_el_costo = _vender(client, arroz, descuento=_pct(10), **ADMIN)

    assert bajo_el_costo.status_code == 400 and "por debajo del costo" in bajo_el_costo.json()["detail"]
    assert justo_el_costo.status_code == 201 and justo_el_costo.json()["total"] == 9000.0


def test_descuentos_invalidos_se_rechazan(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)

    entero = _vender(client, arroz, descuento=_pct(100), **ADMIN)
    mas_que_el_total = _vender(client, arroz, descuento=_pesos(20000), **ADMIN)
    en_cero = _vender(client, arroz, descuento=_pct(0))
    sin_motivo = _vender(client, arroz, descuento=_pct(2, motivo="a"))
    tipo_raro = _vender(client, arroz, descuento={"tipo": "regalo", "valor": 2, "motivo": "xxx"})

    assert entero.status_code == 400 and mas_que_el_total.status_code == 400
    assert en_cero.status_code == 422 and sin_motivo.status_code == 422 and tipo_raro.status_code == 422


def test_el_efectivo_recibido_se_compara_con_el_total_ya_con_descuento(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)

    corto = _vender(client, arroz, descuento=_pct(5), monto_recibido=9000)
    justo = _vender(client, arroz, descuento=_pct(5), monto_recibido=9500)

    assert corto.status_code == 400 and justo.status_code == 201


def test_la_devolucion_reparte_el_descuento_manual(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    venta = _vender(client, arroz, descuento=_pct(5)).json()  # 10.000 -> 9.500

    devuelta = client.post(
        f"/api/ventas/{venta['venta_id']}/devoluciones", headers=_h(client),
        json={"items": [{"producto_id": arroz, "cantidad": 1}], "motivo": "No le gusto", **ADMIN},
    )

    assert devuelta.status_code == 201 and devuelta.json()["devoluciones"][0]["total_devuelto"] == 950.0  # 1.000 x 0,95


def test_cambiar_la_clave_del_admin_no_hace_pasar_por_otra_venta_el_mismo_cobro(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    clave = "cobro-descuento-0001"

    primero = _vender(client, arroz, descuento=_pct(10), clave_idempotencia=clave, **ADMIN)
    repetido = _vender(client, arroz, descuento=_pct(10), clave_idempotencia=clave, **ADMIN)

    assert primero.status_code == 201 and repetido.status_code == 200
    assert repetido.json()["venta_id"] == primero.json()["venta_id"]
