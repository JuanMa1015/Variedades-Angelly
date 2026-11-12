"""Cada rol maneja su catalogo: el vendedor la tienda, el admin la cartera y el superadmin los dos."""

from __future__ import annotations

from src.infrastructure.database.models import ProductoModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(client, usuario: str) -> dict[str, str]:
    credenciales = {
        "admin": ("angelly_admin", "cambiame123"),
        "vendedor": ("vendedor1", "ventas123"),
        "super": ("angelly_superadmin", "supersecure123"),
    }[usuario]
    return {"Authorization": f"Bearer {_login_token(client, *credenciales)}"}


def _producto(sf, nombre: str, catalogo: str, stock: int = 5, activo: bool = True, codigo: str | None = None) -> int:
    with sf() as db:
        producto = ProductoModel(
            nombre=nombre, codigo_barras=codigo, precio_costo=500, precio_venta=1000, stock_actual=stock, stock_minimo=2, catalogo=catalogo, activo=activo,
        )
        db.add(producto)
        db.commit()
        return producto.id


def _dos(sf) -> tuple[int, int]:
    return _producto(sf, "Arroz tienda", "tienda"), _producto(sf, "Bolso cartera", "cartera")


def _nombres(respuesta) -> list[str]:
    cuerpo = respuesta.json()
    filas = cuerpo["data"] if isinstance(cuerpo, dict) else cuerpo
    return sorted(p["nombre"] for p in filas)


# -- Listar --


def test_cada_rol_solo_lista_su_catalogo_y_el_superadmin_los_dos(auth_client) -> None:
    client, sf = auth_client
    _dos(sf)

    assert _nombres(client.get("/api/productos", headers=_h(client, "vendedor"))) == ["Arroz tienda"]
    assert _nombres(client.get("/api/productos", headers=_h(client, "admin"))) == ["Bolso cartera"]
    assert _nombres(client.get("/api/productos?catalogo=todos", headers=_h(client, "admin"))) == ["Bolso cartera"]
    assert _nombres(client.get("/api/productos", headers=_h(client, "super"))) == ["Arroz tienda", "Bolso cartera"]
    assert _nombres(client.get("/api/productos/paginados", headers=_h(client, "admin"))) == ["Bolso cartera"]
    assert _nombres(client.get("/api/productos/paginados", headers=_h(client, "vendedor"))) == ["Arroz tienda"]
    assert len(_nombres(client.get("/api/productos/paginados", headers=_h(client, "super")))) == 2


def test_pedir_el_catalogo_ajeno_es_un_403_no_una_lista_vacia(auth_client) -> None:
    client, sf = auth_client
    _dos(sf)

    assert client.get("/api/productos?catalogo=cartera", headers=_h(client, "vendedor")).status_code == 403
    assert client.get("/api/productos?catalogo=tienda", headers=_h(client, "admin")).status_code == 403
    assert client.get("/api/productos/paginados?catalogo=tienda", headers=_h(client, "admin")).status_code == 403
    assert client.get("/api/productos?catalogo=cartera", headers=_h(client, "admin")).status_code == 200
    assert client.get("/api/productos?catalogo=tienda", headers=_h(client, "super")).status_code == 200


def test_el_resumen_y_la_reposicion_son_del_catalogo_del_rol(auth_client) -> None:
    client, sf = auth_client
    _producto(sf, "Arroz tienda", "tienda", stock=0)
    _producto(sf, "Bolso cartera", "cartera", stock=1)
    _producto(sf, "Sabana cartera", "cartera", stock=9)

    resumen_admin = client.get("/api/productos/resumen", headers=_h(client, "admin")).json()
    resumen_vendedor = client.get("/api/productos/resumen", headers=_h(client, "vendedor")).json()
    reposicion_admin = client.get("/api/productos/reposicion", headers=_h(client, "admin")).json()

    assert resumen_admin["total"] == 2 and resumen_vendedor["total"] == 1
    assert reposicion_admin["total_productos"] == 1
    assert client.get("/api/productos/resumen?catalogo=tienda", headers=_h(client, "admin")).status_code == 403
    assert client.get("/api/productos/reposicion?catalogo=cartera", headers=_h(client, "vendedor")).status_code == 403
    assert client.get("/api/productos/resumen?catalogo=cartera", headers=_h(client, "super")).json()["total"] == 2


# -- Crear, editar, desactivar --


def _crear(client, usuario, catalogo, nombre="Nuevo producto"):
    return client.post(
        "/api/productos", headers=_h(client, usuario),
        json={"nombre": nombre, "catalogo": catalogo, "precio_costo": 500, "precio_venta": 1000},
    )


def test_solo_se_crean_productos_del_propio_catalogo(auth_client) -> None:
    client, _ = auth_client

    assert _crear(client, "admin", "tienda", "Producto A").status_code == 403
    assert _crear(client, "admin", "cartera", "Producto B").status_code == 201
    assert _crear(client, "vendedor", "cartera", "Producto C").status_code == 403
    assert _crear(client, "vendedor", "tienda", "Producto D").status_code == 201
    assert _crear(client, "super", "cartera", "Producto E").status_code == 201
    assert _crear(client, "super", "tienda", "Producto F").status_code == 201


def test_no_se_toca_un_producto_del_otro_catalogo(auth_client) -> None:
    client, sf = auth_client
    tienda, cartera = _dos(sf)
    admin, vendedor = _h(client, "admin"), _h(client, "vendedor")

    assert client.patch(f"/api/productos/{tienda}", headers=admin, json={"precio_venta": 2000}).status_code == 403
    assert client.patch(f"/api/productos/{cartera}", headers=vendedor, json={"precio_venta": 2000}).status_code == 403
    assert client.delete(f"/api/productos/{tienda}", headers=admin).status_code == 403
    assert client.put(f"/api/productos/{tienda}/reactivar", headers=admin).status_code == 403
    assert client.patch(f"/api/productos/{tienda}/stock", headers=admin, json={"delta": 5}).status_code == 403
    assert client.patch(f"/api/productos/{tienda}/precio_venta", headers=admin, json={"precio_venta": 1}).status_code == 403
    assert client.patch(f"/api/productos/{cartera}/precio_venta", headers=vendedor, json={"precio_venta": 1}).status_code == 403
    with sf() as db:
        assert db.get(ProductoModel, tienda).precio_venta == 1000 and db.get(ProductoModel, tienda).stock_actual == 5
        assert db.get(ProductoModel, cartera).precio_venta == 1000


def test_cada_rol_si_puede_con_su_propio_catalogo(auth_client) -> None:
    client, sf = auth_client
    tienda, cartera = _dos(sf)

    assert client.patch(f"/api/productos/{cartera}", headers=_h(client, "admin"), json={"precio_venta": 2000}).status_code == 200
    assert client.patch(f"/api/productos/{tienda}", headers=_h(client, "vendedor"), json={"precio_venta": 2500}).status_code == 200
    assert client.patch(f"/api/productos/{cartera}/precio_venta", headers=_h(client, "admin"), json={"precio_venta": 3000}).status_code == 200
    assert client.patch(f"/api/productos/{cartera}", headers=_h(client, "super"), json={"precio_venta": 3500}).status_code == 200
    assert client.delete(f"/api/productos/{cartera}", headers=_h(client, "admin")).status_code == 204
    assert client.put(f"/api/productos/{cartera}/reactivar", headers=_h(client, "admin")).status_code == 200


def test_solo_el_superadmin_pasa_un_producto_de_catalogo(auth_client) -> None:
    client, sf = auth_client
    _, cartera = _dos(sf)

    assert client.patch(f"/api/productos/{cartera}", headers=_h(client, "admin"), json={"catalogo": "tienda"}).status_code == 403
    assert client.patch(f"/api/productos/{cartera}", headers=_h(client, "admin"), json={"catalogo": "cartera"}).status_code == 200
    movido = client.patch(f"/api/productos/{cartera}", headers=_h(client, "super"), json={"catalogo": "tienda"})

    assert movido.status_code == 200 and movido.json()["catalogo"] == "tienda"


# -- Stock --


def test_el_stock_se_ajusta_y_se_consulta_solo_en_el_propio_catalogo(auth_client) -> None:
    client, sf = auth_client
    tienda, cartera = _dos(sf)
    ajuste = {"modo": "sumar", "cantidad": 3, "motivo": "ingreso_sin_factura"}

    assert client.post(f"/api/productos/{tienda}/ajustes-stock", headers=_h(client, "admin"), json=ajuste).status_code == 403
    assert client.post(f"/api/productos/{cartera}/ajustes-stock", headers=_h(client, "vendedor"), json=ajuste).status_code == 403
    assert client.get(f"/api/productos/{tienda}/movimientos-stock", headers=_h(client, "admin")).status_code == 403
    assert client.get(f"/api/productos/{cartera}/movimientos-stock", headers=_h(client, "vendedor")).status_code == 403
    propio = client.post(f"/api/productos/{cartera}/ajustes-stock", headers=_h(client, "admin"), json=ajuste)
    assert propio.status_code == 200 and propio.json()["producto"]["stock_actual"] == 8
    assert client.get(f"/api/productos/{cartera}/movimientos-stock", headers=_h(client, "admin")).status_code == 200
    with sf() as db:
        assert db.get(ProductoModel, tienda).stock_actual == 5


# -- Nombres repetidos --


def test_el_repetido_dice_en_que_catalogo_esta_y_si_esta_desactivado(auth_client) -> None:
    client, sf = auth_client
    _producto(sf, "Arroz", "tienda", codigo="7701")
    _producto(sf, "Viejo", "cartera", activo=False)

    por_nombre = _crear(client, "admin", "cartera", "arroz")
    por_codigo = client.post(
        "/api/productos", headers=_h(client, "admin"),
        json={"nombre": "Otro", "catalogo": "cartera", "precio_costo": 1, "precio_venta": 2, "codigo_barras": "7701"},
    )
    desactivado = _crear(client, "admin", "cartera", "VIEJO")

    assert por_nombre.status_code == 409 and "catalogo de tienda" in por_nombre.json()["detail"]
    assert por_codigo.status_code == 409 and "codigo de barras" in por_codigo.json()["detail"]
    assert desactivado.status_code == 409 and "desactivado" in desactivado.json()["detail"]


# -- Punto de venta --


def test_el_punto_de_venta_no_vende_productos_de_cartera(auth_client) -> None:
    client, sf = auth_client
    tienda, cartera = _dos(sf)
    vendedor = _h(client, "vendedor")
    client.post("/api/caja/apertura", headers=vendedor, json={"monto_inicial": 0})

    respuesta = client.post(
        "/api/ventas", headers=vendedor,
        json={"items": [{"producto_id": cartera, "cantidad": 1}], "es_fiado": False, "metodo_pago": "efectivo"},
    )
    propia = client.post(
        "/api/ventas", headers=vendedor,
        json={"items": [{"producto_id": tienda, "cantidad": 1}], "es_fiado": False, "metodo_pago": "efectivo"},
    )

    assert respuesta.status_code == 400 and "no es un producto de la tienda" in respuesta.json()["detail"]
    assert propia.status_code == 201, propia.text
    with sf() as db:
        assert db.get(ProductoModel, cartera).stock_actual == 5
