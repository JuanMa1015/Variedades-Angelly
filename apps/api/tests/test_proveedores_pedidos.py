"""Pedidos a proveedor: estados (enviado/recibido/cancelado), factura que los cumple y lista con busqueda y filtros."""

from __future__ import annotations

from src.infrastructure.database.models import PedidoProveedorModel, ProductoModel
from tests.test_proveedores_flujo import _admin, _auditoria, _crear, _h, _vendedor, auth_client  # noqa: F401  (fixture)


def _pedido(client, token, proveedor_id: int, descripcion="Pedido semanal", monto=1000) -> dict:
    respuesta = client.post(
        "/api/proveedores/pedidos", headers=_h(token),
        json={"proveedor_id": proveedor_id, "descripcion": descripcion, "monto_estimado": monto},
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _estado(client, token, pedido_id: int, estado: str, nota: str | None = None):
    return client.put(f"/api/proveedores/pedidos/{pedido_id}/estado", headers=_h(token), json={"estado": estado, "nota": nota})


def _proveedor(client, token, nombre="Bimbo", telefono="3001112233") -> int:
    return _crear(client, token, nombre=nombre, telefono=telefono).json()["id"]


# -- Estados --


def test_un_pedido_nace_enviado_y_se_puede_marcar_recibido(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    pedido = _pedido(client, token, _proveedor(client, token))

    respuesta = _estado(client, token, pedido["id"], "recibido")

    assert pedido["estado"] == "enviado"
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["estado"] == "recibido"
    assert cuerpo["resuelto_por"] == "vendedor1"
    assert cuerpo["fecha_resolucion"] is not None
    assert ("cambiar_estado", "enviado -> recibido") in _auditoria(sf, "pedido_proveedor")


def test_cancelar_guarda_la_nota_y_quien_lo_hizo(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    pedido = _pedido(client, token, _proveedor(client, token))

    cuerpo = _estado(client, token, pedido["id"], "cancelado", "  Lo pedi dos veces  ").json()

    assert cuerpo["estado"] == "cancelado"
    assert cuerpo["nota"] == "Lo pedi dos veces"
    assert cuerpo["resuelto_por"] == "vendedor1"


def test_no_se_pasa_de_recibido_a_cancelado_sin_reabrir(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    pedido = _pedido(client, token, _proveedor(client, token))
    _estado(client, token, pedido["id"], "recibido")

    respuesta = _estado(client, token, pedido["id"], "cancelado")

    assert respuesta.status_code == 409
    assert "reabrelo" in respuesta.json()["detail"]


def test_repetir_el_mismo_estado_se_rechaza(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    pedido = _pedido(client, token, _proveedor(client, token))

    assert _estado(client, token, pedido["id"], "enviado").status_code == 409


def test_un_pedido_cancelado_se_puede_reabrir(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    pedido = _pedido(client, token, _proveedor(client, token))
    _estado(client, token, pedido["id"], "cancelado", "error")

    cuerpo = _estado(client, token, pedido["id"], "enviado").json()

    assert cuerpo["estado"] == "enviado"
    assert cuerpo["nota"] is None
    assert cuerpo["resuelto_por"] is None
    assert cuerpo["fecha_resolucion"] is None


def test_estado_de_un_pedido_que_no_existe(auth_client) -> None:
    client, _ = auth_client

    assert _estado(client, _vendedor(client), 999, "recibido").status_code == 404


def test_estado_invalido_se_rechaza(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    pedido = _pedido(client, token, _proveedor(client, token))

    assert _estado(client, token, pedido["id"], "aprobado").status_code == 422


# -- Pedido cumplido por una factura --


def _producto(sf, nombre="Pan", costo=1000.0, stock=2) -> int:
    with sf() as db:
        producto = ProductoModel(nombre=nombre, precio_costo=costo, precio_venta=2000.0, stock_actual=stock, stock_minimo=1)
        db.add(producto)
        db.commit()
        return producto.id


def _factura(client, token, proveedor_id: int, producto_id: int, pedido_id: int | None = None):
    cuerpo = {"proveedor_id": proveedor_id, "items": [{"producto_id": producto_id, "cantidad": 5, "precio_unitario": 1000}]}
    if pedido_id is not None:
        cuerpo["pedido_id"] = pedido_id
    return client.post("/api/facturas-compra", headers=_h(token), json=cuerpo)


def test_la_factura_marca_el_pedido_como_recibido_y_lo_enlaza(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _proveedor(client, token)
    pedido = _pedido(client, token, proveedor)

    respuesta = _factura(client, token, proveedor, _producto(sf), pedido["id"])

    assert respuesta.status_code == 201
    with sf() as db:
        guardado = db.get(PedidoProveedorModel, pedido["id"])
        assert guardado.estado == "recibido"
        assert guardado.factura_id == respuesta.json()["id"]
        assert guardado.resuelto_por == "vendedor1"
    assert any("factura #" in detalle for _, detalle in _auditoria(sf, "pedido_proveedor"))


def test_la_factura_de_otro_proveedor_no_puede_cumplir_el_pedido(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _proveedor(client, token, "Bimbo", "3001112233")
    otro = _proveedor(client, token, "Coca-Cola", "3109998877")
    pedido = _pedido(client, token, proveedor)
    producto = _producto(sf)

    respuesta = _factura(client, token, otro, producto, pedido["id"])

    assert respuesta.status_code == 400
    with sf() as db:
        assert db.get(PedidoProveedorModel, pedido["id"]).estado == "enviado"
        assert db.get(ProductoModel, producto).stock_actual == 2  # la factura no se registro


def test_una_factura_no_cumple_un_pedido_ya_cerrado(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _proveedor(client, token)
    pedido = _pedido(client, token, proveedor)
    _estado(client, token, pedido["id"], "cancelado")

    respuesta = _factura(client, token, proveedor, _producto(sf), pedido["id"])

    assert respuesta.status_code == 409
    assert "cancelado" in respuesta.json()["detail"]


def test_una_factura_con_un_pedido_inexistente_se_rechaza(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)

    assert _factura(client, token, _proveedor(client, token), _producto(sf), 999).status_code == 404


def test_un_pedido_con_factura_no_se_reabre_a_mano(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _proveedor(client, token)
    pedido = _pedido(client, token, proveedor)
    factura = _factura(client, token, proveedor, _producto(sf), pedido["id"]).json()

    respuesta = _estado(client, token, pedido["id"], "enviado")

    assert respuesta.status_code == 409
    assert f"#{factura['id']}" in respuesta.json()["detail"]


def test_eliminar_la_factura_deja_el_pedido_pendiente_otra_vez(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _proveedor(client, token)
    pedido = _pedido(client, token, proveedor)
    factura = _factura(client, token, proveedor, _producto(sf), pedido["id"]).json()

    assert client.delete(f"/api/facturas-compra/{factura['id']}", headers=_h(_admin(client))).status_code == 204

    with sf() as db:
        guardado = db.get(PedidoProveedorModel, pedido["id"])
        assert guardado.estado == "enviado"
        assert guardado.factura_id is None
        assert guardado.resuelto_por is None


# -- Lista de pedidos: busqueda y filtros --


def _tres_pedidos(client, token):
    bimbo = _proveedor(client, token, "Bimbo", "3001112233")
    coca = _proveedor(client, token, "Coca-Cola", "3109998877")
    p1 = _pedido(client, token, bimbo, "3× Pan tajado")
    p2 = _pedido(client, token, coca, "6× Gaseosa grande")
    p3 = _pedido(client, token, coca, "2× Agua")
    _estado(client, token, p2["id"], "recibido")
    _estado(client, token, p3["id"], "cancelado")
    return bimbo, coca, p1, p2, p3


def _ids(respuesta) -> list[int]:
    assert respuesta.status_code == 200, respuesta.text
    return [pedido["id"] for pedido in respuesta.json()["data"]]


def test_filtrar_pedidos_por_estado(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    _, _, p1, p2, p3 = _tres_pedidos(client, token)

    assert _ids(client.get("/api/proveedores/pedidos/paginados?estado=enviado", headers=_h(token))) == [p1["id"]]
    assert _ids(client.get("/api/proveedores/pedidos/paginados?estado=recibido", headers=_h(token))) == [p2["id"]]
    assert _ids(client.get("/api/proveedores/pedidos/paginados?estado=cancelado", headers=_h(token))) == [p3["id"]]
    assert len(_ids(client.get("/api/proveedores/pedidos/paginados", headers=_h(token)))) == 3


def test_buscar_pedidos_por_proveedor_o_por_detalle(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    _, _, p1, p2, p3 = _tres_pedidos(client, token)

    por_proveedor = _ids(client.get("/api/proveedores/pedidos/paginados?q=coca", headers=_h(token)))
    por_detalle = _ids(client.get("/api/proveedores/pedidos/paginados?q=PAN", headers=_h(token)))

    assert sorted(por_proveedor) == sorted([p2["id"], p3["id"]])
    assert por_detalle == [p1["id"]]


def test_filtrar_pedidos_por_proveedor_y_paginar(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    _, coca, _, p2, p3 = _tres_pedidos(client, token)

    pagina1 = client.get(f"/api/proveedores/pedidos/paginados?proveedor_id={coca}&limit=1&page=1", headers=_h(token)).json()
    pagina2 = client.get(f"/api/proveedores/pedidos/paginados?proveedor_id={coca}&limit=1&page=2", headers=_h(token)).json()

    assert pagina1["page"]["total"] == 2
    assert pagina1["page"]["total_pages"] == 2
    assert [p["id"] for p in pagina1["data"]] + [p["id"] for p in pagina2["data"]] == [p3["id"], p2["id"]]  # el mas nuevo primero


def test_un_filtro_de_estado_desconocido_se_rechaza(auth_client) -> None:
    client, _ = auth_client

    assert client.get("/api/proveedores/pedidos/paginados?estado=raro", headers=_h(_vendedor(client))).status_code == 422
