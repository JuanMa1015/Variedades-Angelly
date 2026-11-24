"""Cupo de credito opcional de los clientes de tienda: 0 = sin limite; con cupo, el fiado que lo pase se rechaza."""

from __future__ import annotations

from sqlalchemy import select

from src.infrastructure.database.models import AuditoriaModel, ClienteFiadoTiendaModel, ProductoModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(client) -> dict[str, str]:
    return {"Authorization": f"Bearer {_login_token(client, 'vendedor1', 'ventas123')}"}


def _producto(sf, stock=100) -> int:
    with sf() as db:
        producto = ProductoModel(nombre="Arroz", precio_costo=500, precio_venta=1000, stock_actual=stock, stock_minimo=1, catalogo="tienda")
        db.add(producto)
        db.commit()
        return producto.id


def _cliente(client, cupo=None, nombre="Marta Diaz") -> dict:
    cuerpo = {"nombre": nombre, "telefono_whatsapp": "3001112233"}
    if cupo is not None:
        cuerpo["limite_credito"] = cupo
    respuesta = client.post("/api/clientes/tienda-fiado", headers=_h(client), json=cuerpo)
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _fiar(client, producto, cliente_id, cantidad, abono=0):
    cuerpo = {
        "items": [{"producto_id": producto, "cantidad": cantidad}], "es_fiado": True, "fiado_origen": "tienda",
        "cliente_tienda_id": cliente_id, "abono_inicial": abono, "metodo_pago": "efectivo",
    }
    return client.post("/api/ventas", headers=_h(client), json=cuerpo)


def _stock(sf, producto_id: int) -> int:
    with sf() as db:
        return db.get(ProductoModel, producto_id).stock_actual


def test_sin_cupo_el_fiado_no_tiene_limite(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    cliente = _cliente(client)

    respuesta = _fiar(client, arroz, cliente["id"], 90)

    assert cliente["limite_credito"] == 0.0
    assert respuesta.status_code == 201


def test_con_cupo_el_fiado_que_lo_pasa_se_rechaza_sin_vender_nada(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    cliente = _cliente(client, cupo=50000)

    dentro = _fiar(client, arroz, cliente["id"], 40)  # 40.000
    pasado = _fiar(client, arroz, cliente["id"], 11)  # 11.000 mas: 51.000 > 50.000
    justo = _fiar(client, arroz, cliente["id"], 10)  # 10.000 mas: 50.000, justo en el cupo

    assert dentro.status_code == 201 and justo.status_code == 201
    assert pasado.status_code == 400
    assert "supera el cupo de credito de 'Marta Diaz'" in pasado.json()["detail"] and "Disponible: 10000" in pasado.json()["detail"]
    assert _stock(sf, arroz) == 100 - 40 - 10  # lo rechazado no descontó stock


def test_el_abono_inicial_cuenta_porque_solo_queda_fiado_lo_que_falta(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    cliente = _cliente(client, cupo=20000)

    sin_abono = _fiar(client, arroz, cliente["id"], 25)  # 25.000 fiados
    con_abono = _fiar(client, arroz, cliente["id"], 25, abono=6000)  # quedan 19.000 fiados

    assert sin_abono.status_code == 400
    assert con_abono.status_code == 201 and con_abono.json()["saldo_pendiente"] == 19000.0


def test_el_cupo_se_edita_se_audita_y_la_lista_lo_muestra(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    cliente = _cliente(client, cupo=10000)
    _fiar(client, arroz, cliente["id"], 10)  # debe 10.000: en el tope

    bloqueado = _fiar(client, arroz, cliente["id"], 1)
    editado = client.patch(f"/api/clientes/tienda-fiado/{cliente['id']}", headers=_h(client), json={"limite_credito": 30000})
    ya_puede = _fiar(client, arroz, cliente["id"], 1)
    lista = client.get("/api/clientes/tienda/lista", headers=_h(client)).json()["data"]
    quitado = client.patch(f"/api/clientes/tienda-fiado/{cliente['id']}", headers=_h(client), json={"limite_credito": 0})

    assert bloqueado.status_code == 400
    assert editado.status_code == 200 and editado.json()["limite_credito"] == 30000.0
    assert ya_puede.status_code == 201
    assert [c["limite_credito"] for c in lista] == [30000.0]
    assert quitado.json()["limite_credito"] == 0.0
    with sf() as db:
        detalles = [a.detalle for a in db.execute(select(AuditoriaModel).where(AuditoriaModel.modulo == "clientes_tienda")).scalars()]
    assert any("cupo 10000.0 -> 30000.0" in d for d in detalles) and any("30000.0 -> sin limite" in d for d in detalles)
    assert any("cupo 10000.0" in d for d in detalles)  # el alta tambien dejo su cupo


def test_bajar_el_cupo_por_debajo_de_la_deuda_no_la_toca_pero_bloquea_lo_nuevo(auth_client) -> None:
    client, sf = auth_client
    arroz = _producto(sf)
    cliente = _cliente(client)
    _fiar(client, arroz, cliente["id"], 30)  # debe 30.000 sin cupo

    client.patch(f"/api/clientes/tienda-fiado/{cliente['id']}", headers=_h(client), json={"limite_credito": 20000})
    nuevo = _fiar(client, arroz, cliente["id"], 1)

    assert nuevo.status_code == 400 and "Disponible: 0" in nuevo.json()["detail"]
    with sf() as db:
        assert float(db.execute(select(ClienteFiadoTiendaModel.deuda_total)).scalar_one()) == 30000.0


def test_el_cupo_no_puede_ser_negativo(auth_client) -> None:
    client, _ = auth_client
    cliente = _cliente(client)

    creado = client.post("/api/clientes/tienda-fiado", headers=_h(client), json={"nombre": "Otro Cliente", "limite_credito": -5})
    editado = client.patch(f"/api/clientes/tienda-fiado/{cliente['id']}", headers=_h(client), json={"limite_credito": -1})

    assert creado.status_code == 422 and editado.status_code == 422
