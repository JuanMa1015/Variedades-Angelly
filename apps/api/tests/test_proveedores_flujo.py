"""Proveedores: nombre y telefono unicos, formato de telefono, auditoria, pedidos con descripcion larga y proveedor inactivo."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.infrastructure.database.models import AuditoriaModel, PedidoProveedorModel, ProveedorModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _admin(client) -> str:
    return _login_token(client, "angelly_superadmin", "supersecure123")


def _crear(client, token, nombre="Bimbo", telefono="3001112233", contacto=None):
    return client.post("/api/proveedores", headers=_h(token), json={"nombre": nombre, "telefono": telefono, "contacto": contacto})


def _auditoria(sf, entidad: str) -> list[tuple[str, str]]:
    with sf() as db:
        filas = db.execute(select(AuditoriaModel).where(AuditoriaModel.entidad == entidad)).scalars().all()
        return [(fila.accion, fila.detalle or "") for fila in filas]


# -- Alta --


def test_el_telefono_se_guarda_en_formato_unico(auth_client) -> None:
    client, _ = auth_client

    respuesta = _crear(client, _vendedor(client), telefono="300 111 2233")

    assert respuesta.status_code == 201
    assert respuesta.json()["telefono"] == "573001112233"


def test_un_telefono_con_longitud_imposible_se_rechaza(auth_client) -> None:
    client, _ = auth_client

    respuesta = _crear(client, _vendedor(client), telefono="12345")

    assert respuesta.status_code == 400
    assert "digitos" in respuesta.json()["detail"]


def test_el_telefono_es_opcional(auth_client) -> None:
    client, _ = auth_client

    respuesta = _crear(client, _vendedor(client), telefono=None)

    assert respuesta.status_code == 201
    assert respuesta.json()["telefono"] is None


@pytest.mark.parametrize("repetido", ["bimbo", "BIMBO", "  Bimbo  "])
def test_el_nombre_no_se_repite_sin_importar_mayusculas_ni_espacios(auth_client, repetido) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    assert _crear(client, token, nombre="Bimbo", telefono="3001112233").status_code == 201

    respuesta = _crear(client, token, nombre=repetido, telefono="3109998877")

    assert respuesta.status_code == 409
    assert "nombre" in respuesta.json()["detail"]


def test_el_telefono_no_se_repite_aunque_se_escriba_distinto(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    assert _crear(client, token, nombre="Bimbo", telefono="3001112233").status_code == 201

    respuesta = _crear(client, token, nombre="Coca-Cola", telefono="+57 300-111-2233")

    assert respuesta.status_code == 409
    assert "'Bimbo'" in respuesta.json()["detail"]


def test_un_telefono_viejo_con_formato_raro_no_bloquea_otros_altas(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        db.add(ProveedorModel(nombre="Antiguo", telefono="123", activo=True))
        db.commit()

    respuesta = _crear(client, _vendedor(client), nombre="Nuevo", telefono="3001112233")

    assert respuesta.status_code == 201


# -- Edicion --


def test_editar_conserva_su_propio_nombre_y_telefono(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()

    respuesta = client.patch(
        f"/api/proveedores/{proveedor['id']}", headers=_h(token),
        json={"nombre": "BIMBO", "telefono": "3001112233", "contacto": "Robocop"},
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["nombre"] == "BIMBO"
    assert respuesta.json()["contacto"] == "Robocop"


def test_editar_no_puede_tomar_el_telefono_de_otro(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    _crear(client, token, nombre="Bimbo", telefono="3001112233")
    otro = _crear(client, token, nombre="Coca-Cola", telefono="3109998877").json()

    respuesta = client.patch(f"/api/proveedores/{otro['id']}", headers=_h(token), json={"telefono": "3001112233"})

    assert respuesta.status_code == 409


def test_editar_puede_quitar_el_telefono(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()

    respuesta = client.patch(f"/api/proveedores/{proveedor['id']}", headers=_h(token), json={"telefono": ""})

    assert respuesta.status_code == 200
    assert respuesta.json()["telefono"] is None


def test_un_proveedor_desactivado_se_puede_reactivar_y_aparece_al_pedir_inactivos(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()
    client.patch(f"/api/proveedores/{proveedor['id']}", headers=_h(token), json={"activo": False})

    solo_activos = client.get("/api/proveedores", headers=_h(token)).json()
    con_inactivos = client.get("/api/proveedores?include_inactivos=true", headers=_h(token)).json()
    reactivado = client.patch(f"/api/proveedores/{proveedor['id']}", headers=_h(token), json={"activo": True})

    assert solo_activos == []
    assert [p["nombre"] for p in con_inactivos] == ["Bimbo"]
    assert reactivado.json()["activo"] is True


# -- Auditoria --


def test_crear_editar_y_desactivar_dejan_registro(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token, telefono="3001112233").json()
    client.patch(f"/api/proveedores/{proveedor['id']}", headers=_h(token), json={"contacto": "Ana", "telefono": "3109998877"})
    client.patch(f"/api/proveedores/{proveedor['id']}", headers=_h(token), json={"activo": False})
    client.put(f"/api/proveedores/{proveedor['id']}/toggle-activo", headers=_h(token))

    registro = _auditoria(sf, "proveedor")

    assert registro[0] == ("crear", "Creado: Bimbo")
    assert "contacto: - -> Ana" in registro[1][1]
    assert "telefono: 573001112233 -> 573109998877" in registro[1][1]
    assert registro[2][1] == "desactivado"
    assert registro[3][1] == "activado"


def test_guardar_sin_cambios_no_llena_la_auditoria(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()

    client.patch(f"/api/proveedores/{proveedor['id']}", headers=_h(token), json={"nombre": "Bimbo", "telefono": "3001112233"})

    assert [accion for accion, _ in _auditoria(sf, "proveedor")] == ["crear"]


# -- Borrado --


def test_el_vendedor_no_puede_borrar_proveedores(auth_client) -> None:
    client, _ = auth_client
    proveedor = _crear(client, _vendedor(client)).json()

    assert client.delete(f"/api/proveedores/{proveedor['id']}", headers=_h(_vendedor(client))).status_code == 403


def test_el_admin_borra_un_proveedor_sin_historial(auth_client) -> None:
    client, _ = auth_client
    proveedor = _crear(client, _vendedor(client)).json()

    assert client.delete(f"/api/proveedores/{proveedor['id']}", headers=_h(_admin(client))).status_code == 204


def test_no_se_borra_un_proveedor_con_pedidos(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()
    client.post("/api/proveedores/pedidos", headers=_h(token), json={"proveedor_id": proveedor["id"], "descripcion": "Pedido semanal", "monto_estimado": 1000})

    respuesta = client.delete(f"/api/proveedores/{proveedor['id']}", headers=_h(_admin(client)))

    assert respuesta.status_code == 409


# -- Pedidos --


def test_un_pedido_con_muchos_productos_cabe_en_la_descripcion(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()
    descripcion = "\n".join(f"- {n}x Producto numero {n}" for n in range(1, 40))
    assert len(descripcion) > 255

    respuesta = client.post("/api/proveedores/pedidos", headers=_h(token), json={"proveedor_id": proveedor["id"], "descripcion": descripcion, "monto_estimado": 90000})

    assert respuesta.status_code == 201
    with sf() as db:
        assert db.execute(select(PedidoProveedorModel.descripcion)).scalar_one() == descripcion


def test_una_descripcion_de_mas_de_mil_caracteres_se_rechaza(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()

    respuesta = client.post("/api/proveedores/pedidos", headers=_h(token), json={"proveedor_id": proveedor["id"], "descripcion": "x" * 1001, "monto_estimado": 1000})

    assert respuesta.status_code == 422


def test_no_se_hacen_pedidos_a_un_proveedor_desactivado(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()
    client.patch(f"/api/proveedores/{proveedor['id']}", headers=_h(token), json={"activo": False})

    respuesta = client.post("/api/proveedores/pedidos", headers=_h(token), json={"proveedor_id": proveedor["id"], "descripcion": "Pedido semanal", "monto_estimado": 1000})

    assert respuesta.status_code == 409
    assert "desactivado" in respuesta.json()["detail"]
    with sf() as db:
        assert db.execute(select(PedidoProveedorModel)).first() is None


def test_crear_un_pedido_deja_registro(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)
    proveedor = _crear(client, token).json()

    client.post("/api/proveedores/pedidos", headers=_h(token), json={"proveedor_id": proveedor["id"], "descripcion": "Pedido semanal", "monto_estimado": 25000})

    assert _auditoria(sf, "pedido_proveedor") == [("crear", "Pedido a Bimbo por 25000")]
