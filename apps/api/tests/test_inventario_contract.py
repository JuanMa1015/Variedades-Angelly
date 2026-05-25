from __future__ import annotations

from collections.abc import Generator
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import Base, ClienteFiadoTiendaModel
from src.main import app


@pytest.fixture()
def inventario_client() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
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


def test_crear_producto_y_filtrar_por_catalogo(
    inventario_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = inventario_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    create_tienda = client.post(
        "/api/productos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "nombre": "Producto Tienda Catalogo",
            "codigo_barras": "7701002003001",
            "catalogo": "tienda",
            "precio_costo": 1800,
            "precio_venta": 2600,
            "stock_actual": 20,
            "stock_minimo": 2,
        },
    )
    assert create_tienda.status_code == 201

    create_cartera = client.post(
        "/api/productos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "nombre": "Producto Cartera Catalogo",
            "codigo_barras": "7701002003002",
            "catalogo": "cartera",
            "precio_costo": 2200,
            "precio_venta": 3200,
            "stock_actual": 15,
            "stock_minimo": 1,
        },
    )
    assert create_cartera.status_code == 201

    list_tienda = client.get(
        "/api/productos?catalogo=tienda",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert list_tienda.status_code == 200
    assert all(item["catalogo"] == "tienda" for item in list_tienda.json())

    list_cartera = client.get(
        "/api/productos?catalogo=cartera",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert list_cartera.status_code == 200
    assert all(item["catalogo"] == "cartera" for item in list_cartera.json())


def test_codigo_barras_duplicado_retorna_409(
    inventario_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = inventario_client
    admin_token = _login_token(client, "angelly_admin", "cambiame123")

    first_response = client.post(
        "/api/productos",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Producto Barcode A",
            "codigo_barras": "7709990001112",
            "catalogo": "tienda",
            "precio_costo": 1000,
            "precio_venta": 1500,
            "stock_actual": 5,
            "stock_minimo": 1,
        },
    )
    assert first_response.status_code == 201

    duplicate_response = client.post(
        "/api/productos",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Producto Barcode B",
            "codigo_barras": "7709990001112",
            "catalogo": "tienda",
            "precio_costo": 1100,
            "precio_venta": 1700,
            "stock_actual": 6,
            "stock_minimo": 1,
        },
    )

    assert duplicate_response.status_code == 409
    assert "codigo de barras" in duplicate_response.json()["detail"]


def test_patch_stock_aplica_delta_y_valida_casos_invalidos(
    inventario_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = inventario_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    create_response = client.post(
        "/api/productos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "nombre": "Producto Delta Stock",
            "codigo_barras": "7702003004005",
            "catalogo": "tienda",
            "precio_costo": 900,
            "precio_venta": 1300,
            "stock_actual": 3,
            "stock_minimo": 1,
        },
    )
    assert create_response.status_code == 201
    producto_id = create_response.json()["id"]

    increase_response = client.patch(
        f"/api/productos/{producto_id}/stock",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={"delta": 4},
    )
    assert increase_response.status_code == 200
    assert increase_response.json()["stock_actual"] == 7

    zero_delta_response = client.patch(
        f"/api/productos/{producto_id}/stock",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={"delta": 0},
    )
    assert zero_delta_response.status_code == 422

    negative_response = client.patch(
        f"/api/productos/{producto_id}/stock",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={"delta": -10},
    )
    assert negative_response.status_code == 400
    assert "stock no puede quedar negativo" in negative_response.json()["detail"].lower()


def test_vendedor_puede_editar_producto(
    inventario_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = inventario_client
    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    create_response = client.post(
        "/api/productos",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Producto Editable",
            "codigo_barras": "7704445556667",
            "catalogo": "tienda",
            "precio_costo": 1200,
            "precio_venta": 1900,
            "stock_actual": 4,
            "stock_minimo": 1,
        },
    )
    assert create_response.status_code == 201
    producto_id = create_response.json()["id"]

    patch_response = client.patch(
        f"/api/productos/{producto_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={"precio_venta": 2000},
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["precio_venta"] == 2000


def test_soft_delete_producto_con_historial_ventas(
    inventario_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = inventario_client
    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    create_response = client.post(
        "/api/productos",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Producto Con Historial",
            "codigo_barras": "7705556667778",
            "catalogo": "tienda",
            "precio_costo": 1400,
            "precio_venta": 2100,
            "stock_actual": 12,
            "stock_minimo": 1,
        },
    )
    assert create_response.status_code == 201
    producto_id = create_response.json()["id"]

    with testing_session_local() as session:
        cliente_tienda = ClienteFiadoTiendaModel(
            nombre="Cliente Historial Producto",
            telefono_whatsapp="3001212121",
        )
        session.add(cliente_tienda)
        session.commit()
        cliente_tienda_id = cliente_tienda.id

    venta_response = client.post(
        "/api/ventas",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "cliente_tienda_id": cliente_tienda_id,
            "items": [{"producto_id": producto_id, "cantidad": 1}],
            "es_fiado": True,
            "fiado_origen": "tienda",
        },
    )
    assert venta_response.status_code == 201

    delete_response = client.delete(
        f"/api/productos/{producto_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert delete_response.status_code == 204
