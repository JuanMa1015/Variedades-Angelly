from __future__ import annotations

from collections.abc import Generator
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import Base, ProductoModel
from src.main import app


@pytest.fixture()
def operaciones_client() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    os.environ["APP_ENV"] = "test"
    os.environ["AUTH_BOOTSTRAP_ENABLED"] = "true"
    os.environ["AUTH_ADMIN_USERNAME"] = "angelly_admin"
    os.environ["AUTH_ADMIN_PASSWORD"] = "cambiame123"
    os.environ["AUTH_SELLER_USERNAME"] = "vendedor1"
    os.environ["AUTH_SELLER_PASSWORD"] = "ventas123"
    os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-with-32-bytes-minimum"

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client, testing_session_local

    app.dependency_overrides.clear()


def _login_token(client: TestClient, username: str, password: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_admin_puede_crear_factura_compra_y_totales_iva(
    operaciones_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = operaciones_client

    admin_token = _login_token(client, "angelly_admin", "cambiame123")

    proveedor_response = client.post(
        "/api/proveedores",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Proveedor Factura",
            "contacto": "Laura",
            "telefono": "3002221111",
        },
    )
    assert proveedor_response.status_code == 201
    proveedor_id = proveedor_response.json()["id"]

    with testing_session_local() as session:
        session.add_all(
            [
                ProductoModel(
                    nombre="Producto IVA",
                    precio_costo=1000,
                    precio_venta=1500,
                    stock_actual=8,
                    stock_minimo=1,
                    catalogo="tienda",
                ),
                ProductoModel(
                    nombre="Producto Sin IVA",
                    precio_costo=2000,
                    precio_venta=2600,
                    stock_actual=8,
                    stock_minimo=1,
                    catalogo="tienda",
                ),
            ],
        )
        session.commit()

    productos_response = client.get(
        "/api/productos?catalogo=tienda",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert productos_response.status_code == 200
    productos = {item["nombre"]: item["id"] for item in productos_response.json()}

    factura_response = client.post(
        "/api/facturas-compra",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "proveedor_id": proveedor_id,
            "items": [
                {
                    "producto_id": productos["Producto IVA"],
                    "cantidad": 2,
                    "aplica_iva": True,
                    "precio_unitario": 5000,
                },
                {
                    "producto_id": productos["Producto Sin IVA"],
                    "cantidad": 1,
                    "aplica_iva": False,
                    "precio_unitario": 3000,
                },
            ],
        },
    )

    assert factura_response.status_code == 201
    factura = factura_response.json()
    assert factura["subtotal"] == 13000
    assert factura["total_iva"] == 1900
    assert factura["total_factura"] == 14900
    assert len(factura["items"]) == 2


def test_vendedor_no_puede_crear_facturas_compra(
    operaciones_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = operaciones_client

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    proveedor_response = client.post(
        "/api/proveedores",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Proveedor Restringido",
            "contacto": "Mario",
            "telefono": "3000002222",
        },
    )
    assert proveedor_response.status_code == 201
    proveedor_id = proveedor_response.json()["id"]

    forbidden_response = client.post(
        "/api/facturas-compra",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "proveedor_id": proveedor_id,
            "items": [
                {
                    "producto_id": 999,
                    "cantidad": 1,
                    "aplica_iva": False,
                    "precio_unitario": 1000,
                },
            ],
        },
    )

    assert forbidden_response.status_code == 403


def test_no_se_puede_eliminar_proveedor_con_pedidos(
    operaciones_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = operaciones_client

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    proveedor_response = client.post(
        "/api/proveedores",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "nombre": "Proveedor Con Pedido",
            "contacto": "Diana",
            "telefono": "3012345678",
        },
    )
    assert proveedor_response.status_code == 201
    proveedor_id = proveedor_response.json()["id"]

    pedido_response = client.post(
        "/api/proveedores/pedidos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "proveedor_id": proveedor_id,
            "descripcion": "Pedido prueba bloqueo",
            "monto_estimado": 90000,
        },
    )
    assert pedido_response.status_code == 201

    delete_response = client.delete(
        f"/api/proveedores/{proveedor_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete_response.status_code == 409
    assert "pedidos registrados" in delete_response.json()["detail"]


def test_vendedor_puede_crear_pedido_y_admin_actualizarlo(
    operaciones_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = operaciones_client

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    proveedor_response = client.post(
        "/api/proveedores",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Proveedor Edit Pedido",
            "contacto": "Jose",
            "telefono": "3023334444",
        },
    )
    assert proveedor_response.status_code == 201
    proveedor_id = proveedor_response.json()["id"]

    pedido_response = client.post(
        "/api/proveedores/pedidos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "proveedor_id": proveedor_id,
            "descripcion": "Pedido inicial",
            "monto_estimado": 120000,
        },
    )
    assert pedido_response.status_code == 201
    pedido_id = pedido_response.json()["id"]

    update_response = client.patch(
        f"/api/proveedores/pedidos/{pedido_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "descripcion": "Pedido actualizado",
            "monto_estimado": 150000,
        },
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["descripcion"] == "Pedido actualizado"
    assert updated["monto_estimado"] == 150000


def test_listado_facturas_compra_es_solo_admin(
    operaciones_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = operaciones_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    response = client.get(
        "/api/facturas-compra",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )

    assert response.status_code == 403
