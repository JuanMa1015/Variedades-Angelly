"""Pruebas de API para routers de fidelizacion y tienda fiado."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_list_fidelizacion_requiere_auth() -> None:
    """Verifica que GET /api/fidelizacion/clientes requiera auth."""
    response = client.get("/api/fidelizacion/clientes")
    assert response.status_code == 401


def test_create_fidelizacion_requiere_auth() -> None:
    """Verifica que POST /api/fidelizacion/clientes requiera auth."""
    response = client.post("/api/fidelizacion/clientes", json={})
    assert response.status_code == 401


def test_list_tienda_fiado_requiere_auth() -> None:
    """Verifica que GET /api/clientes/tienda-fiado requiera auth."""
    response = client.get("/api/clientes/tienda-fiado")
    assert response.status_code == 401


def test_create_tienda_fiado_requiere_auth() -> None:
    """Verifica que POST /api/clientes/tienda-fiado requiera auth."""
    response = client.post("/api/clientes/tienda-fiado", json={})
    assert response.status_code == 401
