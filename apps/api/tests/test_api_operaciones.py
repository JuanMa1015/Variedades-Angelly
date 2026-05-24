"""Pruebas de API para los routers de operaciones (proveedores, gastos)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_list_proveedores_requiere_auth() -> None:
    """Verifica que GET /api/proveedores requiera autenticacion."""
    response = client.get("/api/proveedores")
    assert response.status_code == 401


def test_create_proveedor_requiere_auth() -> None:
    """Verifica que POST /api/proveedores requiera autenticacion."""
    response = client.post("/api/proveedores", json={})
    assert response.status_code == 401


def test_list_pedidos_requiere_auth() -> None:
    """Verifica que GET /api/proveedores/pedidos requiera auth."""
    response = client.get("/api/proveedores/pedidos")
    assert response.status_code == 401


def test_list_gastos_requiere_auth() -> None:
    """Verifica que GET /api/gastos requiera autenticacion."""
    response = client.get("/api/gastos")
    assert response.status_code == 401


def test_create_gasto_requiere_auth() -> None:
    """Verifica que POST /api/gastos requiera autenticacion."""
    response = client.post("/api/gastos", json={})
    assert response.status_code == 401



