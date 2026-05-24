"""Pruebas de API para el router de productos."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_db():
    """No podemos limpiar DB real, saltamos tests que requieren DB."""
    pass


def test_list_productos_requiere_auth() -> None:
    """Verifica que endpoint GET /api/productos requiera autenticacion."""
    response = client.get("/api/productos")
    assert response.status_code == 401


def test_create_producto_requiere_auth() -> None:
    """Verifica que endpoint POST /api/productos requiera autenticacion."""
    response = client.post("/api/productos", json={})
    assert response.status_code == 401


def test_patch_producto_requiere_auth() -> None:
    """Verifica que endpoint PATCH /api/productos/{id} requiera autenticacion."""
    response = client.patch("/api/productos/1", json={})
    assert response.status_code == 401


def test_delete_producto_requiere_auth() -> None:
    """Verifica que endpoint DELETE /api/productos/{id} requiera autenticacion."""
    response = client.delete("/api/productos/1")
    assert response.status_code == 401


def test_patch_producto_stock_requiere_auth() -> None:
    """Verifica que endpoint PATCH /api/productos/{id}/stock requiera auth."""
    response = client.patch("/api/productos/1/stock", json={"delta": 1})
    assert response.status_code == 401


def test_patch_producto_precio_requiere_auth() -> None:
    """Verifica que endpoint PATCH /api/productos/{id}/precio_venta requiera auth."""
    response = client.patch("/api/productos/1/precio_venta", json={"precio_venta": 1000})
    assert response.status_code == 401


def test_get_health_check() -> None:
    """Verifica que la app conteste en /docs."""
    response = client.get("/docs")
    assert response.status_code == 200


def test_list_productos_con_token_invalido() -> None:
    """Verifica que token invalido devuelva 401."""
    response = client.get(
        "/api/productos",
        headers={"Authorization": "Bearer token_falso"},
    )
    assert response.status_code == 401
