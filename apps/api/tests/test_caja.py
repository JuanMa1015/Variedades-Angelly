"""Pruebas unitarias y de API para el modulo de caja."""

from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.domain.caja import CierreCaja
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import Base
from src.main import app


# ─── Tests de dominio ───


def test_cierre_caja_abierta_por_defecto() -> None:
    """Valida que una caja recien abierta tenga estado abierta."""
    caja = CierreCaja(
        id=1,
        monto_inicial=50000.0,
        monto_ventas_efectivo=0.0,
        monto_ventas_transferencia=0.0,
        monto_gastos=0.0,
        monto_cierre=None,
        fecha_apertura=datetime.now(UTC),
        fecha_cierre=None,
        abierto_por="admin",
        cerrado_por=None,
    )
    assert caja.esta_abierta is True
    assert caja.saldo_esperado == 50000.0


def test_cierre_caja_cerrada() -> None:
    """Valida que una caja cerrada tenga estado correcto."""
    caja = CierreCaja(
        id=1,
        monto_inicial=50000.0,
        monto_ventas_efectivo=100000.0,
        monto_ventas_transferencia=50000.0,
        monto_gastos=20000.0,
        monto_cierre=180000.0,
        fecha_apertura=datetime.now(UTC),
        fecha_cierre=datetime.now(UTC),
        abierto_por="admin",
        cerrado_por="admin",
    )
    assert caja.esta_abierta is False
    assert caja.total_ingresos == 150000.0
    assert caja.saldo_esperado == 180000.0


def test_cierre_caja_cerrar_ya_cerrada_lanza_error() -> None:
    """Valida que cerrar una caja ya cerrada lance error."""
    caja = CierreCaja(
        id=1,
        monto_inicial=50000.0,
        monto_ventas_efectivo=0.0,
        monto_ventas_transferencia=0.0,
        monto_gastos=0.0,
        monto_cierre=50000.0,
        fecha_apertura=datetime.now(UTC),
        fecha_cierre=datetime.now(UTC),
        abierto_por="admin",
        cerrado_por="admin",
    )
    with pytest.raises(ValueError, match="cerrada"):
        caja.cerrar(monto_cierre=50000.0, cerrado_por="admin")


def test_cierre_caja_monto_cierre_negativo_lanza_error() -> None:
    """Valida que monto de cierre negativo sea rechazado."""
    caja = CierreCaja(
        id=1,
        monto_inicial=50000.0,
        monto_ventas_efectivo=0.0,
        monto_ventas_transferencia=0.0,
        monto_gastos=0.0,
        monto_cierre=None,
        fecha_apertura=datetime.now(UTC),
        fecha_cierre=None,
        abierto_por="admin",
        cerrado_por=None,
    )
    with pytest.raises(ValueError, match="negativo"):
        caja.cerrar(monto_cierre=-100.0, cerrado_por="admin")


# ─── Tests de API ───


@pytest.fixture()
def caja_client() -> Generator[tuple[TestClient, dict[str, str], dict[str, str], sessionmaker], None, None]:
    """Entrega cliente API con BD SQLite aislada para pruebas de caja."""
    import os

    os.environ["APP_ENV"] = "test"
    os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-with-32-bytes-minimum"

    from src.auth.security import create_access_token

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        conn.execute(
            text("""
                CREATE TABLE IF NOT EXISTS cierres_caja (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    monto_inicial FLOAT NOT NULL DEFAULT 0.0,
                    monto_ventas_efectivo FLOAT NOT NULL DEFAULT 0.0,
                    monto_ventas_transferencia FLOAT NOT NULL DEFAULT 0.0,
                    monto_gastos FLOAT NOT NULL DEFAULT 0.0,
                    monto_cierre FLOAT,
                    fecha_apertura DATETIME NOT NULL,
                    fecha_cierre DATETIME,
                    abierto_por VARCHAR(50) NOT NULL,
                    cerrado_por VARCHAR(50)
                )
            """),
        )
        conn.commit()

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    token, _ = create_access_token(username="vendedor_test", role="vendedor")
    headers = {"Authorization": f"Bearer {token}"}

    token_sa, _ = create_access_token(username="super_test", role="superadmin")
    headers_sa = {"Authorization": f"Bearer {token_sa}"}

    with TestClient(app) as client:
        yield client, headers, headers_sa, testing_session_local

    app.dependency_overrides.clear()
    del os.environ["APP_ENV"]
    del os.environ["JWT_SECRET_KEY"]


def test_caja_estado_sin_caja(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica que sin cajas creadas el estado indique 'cerrada'."""
    client, headers, _, _ = caja_client
    response = client.get("/api/caja/estado", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["abierta"] is False
    assert data["caja_actual"] is None


def test_caja_estado_requiere_auth() -> None:
    """Verifica que el endpoint requiera autenticacion."""
    client = TestClient(app)
    response = client.get("/api/caja/estado")
    assert response.status_code == 401


def test_caja_apertura_requiere_auth() -> None:
    """Verifica que POST /api/caja/apertura requiera auth."""
    client = TestClient(app)
    response = client.post("/api/caja/apertura", json={"monto_inicial": 50000})
    assert response.status_code in (401, 403)


def test_caja_apertura_exitosa(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica apertura de caja exitosa."""
    client, headers, _, _ = caja_client
    response = client.post("/api/caja/apertura", json={"monto_inicial": 50000}, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["monto_inicial"] == 50000.0
    assert data["esta_abierta"] is True
    assert data["abierto_por"] == "vendedor_test"
    assert data["monto_cierre"] is None
    assert data["fecha_cierre"] is None


def test_caja_apertura_duplicada_rechazada(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica que no se pueda abrir caja si ya hay una abierta."""
    client, headers, _, _ = caja_client
    client.post("/api/caja/apertura", json={"monto_inicial": 50000}, headers=headers)
    response = client.post("/api/caja/apertura", json={"monto_inicial": 50000}, headers=headers)
    assert response.status_code == 409
    assert "abierta" in response.json()["detail"]


def test_caja_cierre_sin_apertura_rechazado(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica que cerrar sin abrir antes sea rechazado."""
    client, headers, _, _ = caja_client
    response = client.post("/api/caja/cierre", json={"monto_cierre": 60000}, headers=headers)
    assert response.status_code == 409
    assert "abierta" in response.json()["detail"]


def test_caja_apertura_y_cierre_exitoso(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica flujo completo apertura → cierre."""
    client, headers, _, _ = caja_client

    apertura = client.post("/api/caja/apertura", json={"monto_inicial": 50000}, headers=headers)
    assert apertura.status_code == 201
    caja_id = apertura.json()["id"]

    cierre = client.post("/api/caja/cierre", json={"monto_cierre": 50000}, headers=headers)
    assert cierre.status_code == 200
    data = cierre.json()
    assert data["monto_cierre"] == 50000.0
    assert data["esta_abierta"] is False
    assert data["cerrado_por"] == "vendedor_test"
    assert data["fecha_cierre"] is not None


def test_caja_listar_requiere_auth() -> None:
    """Verifica que GET /api/caja requiera auth."""
    client = TestClient(app)
    response = client.get("/api/caja")
    assert response.status_code == 401


def test_caja_listar_vacio(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica listado vacio inicialmente."""
    client, _, headers_sa, _ = caja_client
    response = client.get("/api/caja", headers=headers_sa)
    assert response.status_code == 200
    assert response.json() == []


def test_caja_listar_con_registros(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica listado con apertura y cierre."""
    client, headers, headers_sa, _ = caja_client
    client.post("/api/caja/apertura", json={"monto_inicial": 50000}, headers=headers)
    client.post("/api/caja/cierre", json={"monto_cierre": 50000}, headers=headers)

    response = client.get("/api/caja", headers=headers_sa)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["monto_inicial"] == 50000.0


def test_caja_apertura_monto_negativo_rechazado(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica que monto_inicial negativo sea rechazado por Pydantic."""
    client, headers, _, _ = caja_client
    response = client.post("/api/caja/apertura", json={"monto_inicial": -100}, headers=headers)
    assert response.status_code == 422


def test_caja_cierre_monto_negativo_rechazado(caja_client: tuple[TestClient, dict, dict, sessionmaker]) -> None:
    """Verifica que monto_cierre negativo sea rechazado por Pydantic."""
    client, headers, _, _ = caja_client
    client.post("/api/caja/apertura", json={"monto_inicial": 50000}, headers=headers)
    response = client.post("/api/caja/cierre", json={"monto_cierre": -100}, headers=headers)
    assert response.status_code == 422
