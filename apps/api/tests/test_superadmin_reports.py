from __future__ import annotations

from collections.abc import Generator
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import Base, DetalleVentaModel, VentaModel
from src.main import app


@pytest.fixture()
def superadmin_reports_client() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    os.environ["APP_ENV"] = "test"
    os.environ["AUTH_BOOTSTRAP_ENABLED"] = "true"
    os.environ["AUTH_SUPERADMIN_USERNAME"] = "root_owner"
    os.environ["AUTH_SUPERADMIN_PASSWORD"] = "supersecure123"
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


def test_superadmin_informes_retorna_rankings_de_ventas_y_productos(
    superadmin_reports_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = superadmin_reports_client

    with testing_session_local() as session:
        venta_1 = VentaModel(creado_por="vendedor1", total=300000, saldo_pendiente=0, es_fiado=False)
        venta_2 = VentaModel(creado_por="vendedor1", total=50000, saldo_pendiente=0, es_fiado=False)
        venta_3 = VentaModel(creado_por="vendedor2", total=250000, saldo_pendiente=0, es_fiado=False)
        session.add_all([venta_1, venta_2, venta_3])
        session.flush()

        session.add_all(
            [
                DetalleVentaModel(
                    venta_id=venta_1.id,
                    producto_id=10,
                    nombre_producto="Arroz",
                    cantidad=6,
                    precio_unitario=50000,
                    subtotal=300000,
                ),
                DetalleVentaModel(
                    venta_id=venta_2.id,
                    producto_id=10,
                    nombre_producto="Arroz",
                    cantidad=1,
                    precio_unitario=50000,
                    subtotal=50000,
                ),
                DetalleVentaModel(
                    venta_id=venta_3.id,
                    producto_id=11,
                    nombre_producto="Azucar",
                    cantidad=5,
                    precio_unitario=50000,
                    subtotal=250000,
                ),
            ],
        )
        session.commit()

    token = _login_token(client, "root_owner", "supersecure123")
    response = client.get(
        "/api/superadmin/informes",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ventas_totales"] == 3
    assert payload["vendedor_mas_vendedor"]["vendedor"] == "vendedor1"
    assert payload["producto_mas_vendido"]["producto"] == "Arroz"
    assert payload["producto_menos_vendido"]["producto"] == "Azucar"
