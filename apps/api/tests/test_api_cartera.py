"""Pruebas de API para los routers de cartera y clientes."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_list_clientes_requiere_auth() -> None:
    """Verifica que GET /api/clientes requiera autenticacion."""
    response = client.get("/api/clientes")
    assert response.status_code == 401


def test_create_cliente_requiere_auth() -> None:
    """Verifica que POST /api/clientes requiera autenticacion."""
    response = client.post("/api/clientes", json={})
    assert response.status_code == 401


def test_cartera_resumen_requiere_auth() -> None:
    """Verifica que GET /api/cartera/resumen requiera autenticacion."""
    response = client.get("/api/cartera/resumen")
    assert response.status_code == 401


def test_list_abonos_requiere_auth() -> None:
    """Verifica que GET /api/cartera/abonos requiera autenticacion."""
    response = client.get("/api/cartera/abonos")
    assert response.status_code == 401


def test_list_clientes_cartera_requiere_auth() -> None:
    """Verifica que GET /api/cartera/clientes requiera autenticacion."""
    response = client.get("/api/cartera/clientes")
    assert response.status_code == 401
