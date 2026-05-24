"""Pruebas de API para el router de ventas y fidelizacion."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_create_venta_requiere_auth() -> None:
    """Verifica que POST /api/ventas requiera autenticacion."""
    response = client.post("/api/ventas", json={})
    assert response.status_code == 401


def test_list_ventas_requiere_auth() -> None:
    """Verifica que GET /api/ventas requiera autenticacion."""
    response = client.get("/api/ventas")
    assert response.status_code == 401


def test_patch_venta_requiere_auth() -> None:
    """Verifica que PATCH /api/ventas/{id} requiera autenticacion."""
    response = client.patch("/api/ventas/1", json={})
    assert response.status_code == 401


def test_delete_venta_requiere_auth() -> None:
    """Verifica que DELETE /api/ventas/{id} requiera autenticacion."""
    response = client.delete("/api/ventas/1")
    assert response.status_code == 401



