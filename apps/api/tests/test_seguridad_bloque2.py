"""Pruebas de seguridad: revalidacion de usuario, CSRF por Origin, permisos y auditoria."""

from __future__ import annotations

from sqlalchemy import select

from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from src.infrastructure.database.models import (
    AuditoriaModel,
    ProductoModel,
    UsuarioModel,
)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _crear_producto(session_factory) -> int:
    with session_factory() as db:
        producto = ProductoModel(
            nombre="Producto seguridad",
            precio_costo=100.0,
            precio_venta=200.0,
            stock_actual=5,
            stock_minimo=1,
        )
        db.add(producto)
        db.commit()
        return producto.id


# ── S2: usuario revalidado en cada request ──


def test_usuario_eliminado_pierde_acceso_aunque_su_token_no_expire(auth_client) -> None:
    client, session_factory = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    assert client.get("/api/productos", headers=_auth(token)).status_code == 200

    with session_factory() as db:
        db.delete(db.execute(select(UsuarioModel).where(UsuarioModel.username == "vendedor1")).scalar_one())
        db.commit()

    assert client.get("/api/productos", headers=_auth(token)).status_code == 401


def test_usuario_desactivado_pierde_acceso_y_no_puede_iniciar_sesion(auth_client) -> None:
    client, session_factory = auth_client
    token = _login_token(client, "vendedor1", "ventas123")

    with session_factory() as db:
        db.execute(select(UsuarioModel).where(UsuarioModel.username == "vendedor1")).scalar_one().activo = False
        db.commit()

    assert client.get("/api/productos", headers=_auth(token)).status_code == 401
    login = client.post("/api/auth/login", json={"username": "vendedor1", "password": "ventas123"})
    assert login.status_code == 401


def test_cambio_de_rol_se_aplica_de_inmediato(auth_client) -> None:
    client, session_factory = auth_client
    token = _login_token(client, "angelly_admin", "cambiame123")
    assert client.get("/api/auditorias", headers=_auth(token)).status_code == 200

    with session_factory() as db:
        db.execute(select(UsuarioModel).where(UsuarioModel.username == "angelly_admin")).scalar_one().rol = "vendedor"
        db.commit()

    # El token sigue diciendo "admin", pero el rol vigente en BD es vendedor.
    assert client.get("/api/auditorias", headers=_auth(token)).status_code == 403


def test_refresh_rechaza_usuario_eliminado(auth_client) -> None:
    client, session_factory = auth_client
    client.post("/api/auth/login", json={"username": "vendedor1", "password": "ventas123"})

    with session_factory() as db:
        db.delete(db.execute(select(UsuarioModel).where(UsuarioModel.username == "vendedor1")).scalar_one())
        db.commit()

    assert client.post("/api/auth/refresh").status_code == 401


def test_refresh_usa_el_rol_actual_de_la_bd(auth_client) -> None:
    client, session_factory = auth_client
    client.post("/api/auth/login", json={"username": "angelly_admin", "password": "cambiame123"})

    with session_factory() as db:
        db.execute(select(UsuarioModel).where(UsuarioModel.username == "angelly_admin")).scalar_one().rol = "vendedor"
        db.commit()

    refreshed = client.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["role"] == "vendedor"


# ── S1: CSRF por Origin ──


def test_post_desde_origen_no_permitido_se_rechaza(auth_client) -> None:
    client, _ = auth_client
    response = client.post(
        "/api/auth/login",
        json={"username": "angelly_admin", "password": "cambiame123"},
        headers={"Origin": "https://atacante.vercel.app"},
    )
    assert response.status_code == 403


def test_post_desde_origen_permitido_funciona(auth_client) -> None:
    client, _ = auth_client
    response = client.post(
        "/api/auth/login",
        json={"username": "angelly_admin", "password": "cambiame123"},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200


# ── S5: permisos del vendedor ──


def test_vendedor_no_puede_desactivar_productos_ni_borrar_facturas(auth_client) -> None:
    client, session_factory = auth_client
    producto_id = _crear_producto(session_factory)
    token = _login_token(client, "vendedor1", "ventas123")

    assert client.delete(f"/api/productos/{producto_id}", headers=_auth(token)).status_code == 403
    assert client.put(f"/api/productos/{producto_id}/reactivar", headers=_auth(token)).status_code == 403
    assert client.delete("/api/facturas-compra/1", headers=_auth(token)).status_code == 403
    assert client.patch("/api/facturas-compra/1", headers=_auth(token), json={"total_factura": 1}).status_code == 403
    assert client.delete("/api/proveedores/1", headers=_auth(token)).status_code == 403


# ── S6: auditoria automatica con el usuario del token ──


def test_desactivar_producto_deja_auditoria_con_el_usuario_del_token(auth_client) -> None:
    client, session_factory = auth_client
    producto_id = _crear_producto(session_factory)
    token = _login_token(client, "angelly_superadmin", "supersecure123")

    assert client.delete(f"/api/productos/{producto_id}", headers=_auth(token)).status_code == 204

    with session_factory() as db:
        fila = db.execute(
            select(AuditoriaModel).where(AuditoriaModel.entidad == "producto", AuditoriaModel.accion == "desactivar"),
        ).scalar_one()
        assert fila.usuario == "angelly_superadmin"
        assert fila.entidad_id == producto_id


def test_admin_no_puede_borrar_registros_de_auditoria(auth_client) -> None:
    client, _ = auth_client
    token = _login_token(client, "angelly_admin", "cambiame123")
    assert client.delete("/api/auditorias/1", headers=_auth(token)).status_code in (403, 404, 405)
