"""Facturas de compra: historial paginado con busqueda y filtros (proveedor, medio de pago, estado, fechas)."""

from __future__ import annotations

from datetime import datetime

from src.infrastructure.database.models import FacturaCompraModel, ProductoModel, ProveedorModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _admin(client) -> str:
    return _login_token(client, "angelly_superadmin", "supersecure123")


def _proveedor(sf, nombre: str) -> int:
    with sf() as db:
        proveedor = ProveedorModel(nombre=nombre)
        db.add(proveedor)
        db.commit()
        return proveedor.id


def _producto(sf) -> int:
    with sf() as db:
        producto = ProductoModel(nombre="Arroz", precio_costo=1000.0, precio_venta=1500.0, stock_actual=10, stock_minimo=1)
        db.add(producto)
        db.commit()
        return producto.id


def _factura(client, token, proveedor: int, producto: int, **extra) -> dict:
    cuerpo = {"proveedor_id": proveedor, "items": [{"producto_id": producto, "cantidad": 2, "precio_unitario": 1000}], **extra}
    respuesta = client.post("/api/facturas-compra", headers=_h(token), json=cuerpo)
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _pagina(client, **filtros) -> dict:
    params = "&".join(f"{k}={v}" for k, v in filtros.items())
    respuesta = client.get(f"/api/facturas-compra/paginadas?{params}", headers=_h(_vendedor(client)))
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _ids(cuerpo: dict) -> list[int]:
    return [f["id"] for f in cuerpo["data"]]


def _tres(client, sf):
    bimbo, coca = _proveedor(sf, "Bimbo"), _proveedor(sf, "Coca-Cola")
    producto = _producto(sf)
    token = _vendedor(client)
    f1 = _factura(client, token, bimbo, producto, numero_factura="FEV-1001", medio_pago="efectivo")
    f2 = _factura(client, token, coca, producto, numero_factura="CC-2002", medio_pago="transferencia")
    f3 = _factura(client, token, coca, producto, numero_factura="CC-2003")
    client.post(f"/api/facturas-compra/{f3['id']}/anular", headers=_h(_admin(client)), json={"motivo": "Error al digitar"})
    return bimbo, coca, f1, f2, f3


def test_buscar_por_numero_o_por_proveedor_sin_importar_mayusculas(auth_client) -> None:
    client, sf = auth_client
    _, _, f1, f2, f3 = _tres(client, sf)

    assert _ids(_pagina(client, q="fev-1001")) == [f1["id"]]
    assert sorted(_ids(_pagina(client, q="COCA"))) == sorted([f2["id"], f3["id"]])
    assert _ids(_pagina(client, q="zzz")) == []


def test_filtrar_por_proveedor(auth_client) -> None:
    client, sf = auth_client
    bimbo, _, f1, _, _ = _tres(client, sf)

    assert _ids(_pagina(client, proveedor_id=bimbo)) == [f1["id"]]


def test_filtrar_por_medio_de_pago(auth_client) -> None:
    client, sf = auth_client
    _, _, f1, f2, _ = _tres(client, sf)

    assert _ids(_pagina(client, medio_pago="efectivo")) == [f1["id"]]
    assert _ids(_pagina(client, medio_pago="transferencia")) == [f2["id"]]


def test_filtrar_por_estado(auth_client) -> None:
    client, sf = auth_client
    _, _, f1, f2, f3 = _tres(client, sf)

    assert _ids(_pagina(client, estado="anuladas")) == [f3["id"]]
    assert sorted(_ids(_pagina(client, estado="vigentes"))) == sorted([f1["id"], f2["id"]])
    assert len(_ids(_pagina(client, estado="todas"))) == 3
    assert len(_ids(_pagina(client))) == 3


def test_los_filtros_se_combinan_y_el_total_es_el_de_la_busqueda(auth_client) -> None:
    client, sf = auth_client
    _, coca, _, f2, _ = _tres(client, sf)

    cuerpo = _pagina(client, proveedor_id=coca, estado="vigentes", medio_pago="transferencia", q="cc-")

    assert _ids(cuerpo) == [f2["id"]]
    assert cuerpo["page"]["total"] == 1


def test_paginar_del_mas_nuevo_al_mas_antiguo_con_el_detalle_de_cada_factura(auth_client) -> None:
    client, sf = auth_client
    _, _, f1, f2, f3 = _tres(client, sf)

    pagina1 = _pagina(client, limit=2, page=1)
    pagina2 = _pagina(client, limit=2, page=2)

    assert pagina1["page"]["total"] == 3 and pagina1["page"]["total_pages"] == 2
    assert _ids(pagina1) + _ids(pagina2) == [f3["id"], f2["id"], f1["id"]]
    assert pagina1["data"][0]["items"][0]["nombre_producto"] == "Arroz"
    assert pagina1["data"][0]["anulada"] is True


def test_el_filtro_de_fechas_se_combina_con_los_demas(auth_client) -> None:
    client, sf = auth_client
    _, _, f1, f2, _ = _tres(client, sf)
    with sf() as db:
        db.get(FacturaCompraModel, f1["id"]).fecha_creacion = datetime(2026, 3, 15, 22, 30)
        db.commit()

    assert _ids(_pagina(client, fecha_desde="2026-03-15", fecha_hasta="2026-03-15")) == [f1["id"]]
    assert f1["id"] not in _ids(_pagina(client, fecha_desde="2026-04-01"))
    assert _ids(_pagina(client, fecha_hasta="2026-03-15", medio_pago="transferencia")) == []
    assert f2["id"] in _ids(_pagina(client, medio_pago="transferencia"))


def test_filtros_invalidos_se_rechazan(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)

    assert client.get("/api/facturas-compra/paginadas?medio_pago=cheque", headers=_h(token)).status_code == 422
    assert client.get("/api/facturas-compra/paginadas?estado=raro", headers=_h(token)).status_code == 422
    assert client.get("/api/facturas-compra/paginadas?proveedor_id=0", headers=_h(token)).status_code == 422


def test_el_historial_requiere_autenticacion(auth_client) -> None:
    client, _ = auth_client

    assert client.get("/api/facturas-compra/paginadas").status_code in (401, 403)
