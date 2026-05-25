from __future__ import annotations

from collections.abc import Generator
import os

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import Base, ClienteModel, ProductoModel
from src.main import app


import pytest


@pytest.fixture()
def cartera_client() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
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


def test_abono_registra_metodo_pago_y_estado_contractual(
    cartera_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = cartera_client

    with testing_session_local() as session:
        session.add(
            ClienteModel(
                nombre="Cliente Abono",
                documento="900011",
                telefono_whatsapp="3001112222",
                limite_credito=100000,
                deuda_total=50000,
            ),
        )
        session.commit()
        cliente_id = session.execute(
            select(ClienteModel.id).where(ClienteModel.nombre == "Cliente Abono"),
        ).scalar_one()

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    response = client.post(
        f"/api/cartera/clientes/{cliente_id}/abonos",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "monto": 15000,
            "metodo_pago": "transferencia",
            "referencia": "Pago parcial",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["metodo_pago"] == "transferencia"
    assert payload["saldo_cliente"] == 35000
    assert payload["referencia"] == "Pago parcial"


def test_historial_cartera_devuelve_metodo_pago_y_detalle_de_articulos(
    cartera_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = cartera_client

    with testing_session_local() as session:
        cliente = ClienteModel(
            nombre="Cliente Historial",
            documento="900022",
            telefono_whatsapp="3003334444",
            limite_credito=100000,
            deuda_total=0,
        )
        producto = ProductoModel(
            nombre="Arroz Diana 500g",
            precio_costo=2800,
            precio_venta=3500,
            stock_actual=20,
            stock_minimo=2,
            catalogo='cartera',
        )
        session.add_all([cliente, producto])
        session.commit()
        cliente_id = cliente.id
        producto_id = producto.id

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    venta_response = client.post(
        "/api/cartera/ventas",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "cliente_id": cliente_id,
            "items": [{"producto_id": producto_id, "cantidad": 2}],
            "abono_inicial": 1000,
            "metodo_pago": "transferencia",
            "referencia": "Venta de prueba",
        },
    )

    assert venta_response.status_code == 201

    historial_response = client.get(
        "/api/cartera/ventas/historial?limit=10",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert historial_response.status_code == 200
    historial = historial_response.json()
    assert len(historial) == 1
    item = historial[0]
    assert item["metodo_pago"] == "transferencia"
    assert item["articulos_detalle"] == "Arroz Diana 500g x2"
    assert item["articulos"] == 2

    movimientos_response = client.get(
        f"/api/cartera/clientes/{cliente_id}/movimientos",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert movimientos_response.status_code == 200
    movimientos = movimientos_response.json()["data"]
    venta_movimiento = next(mov for mov in movimientos if mov["tipo"] == "Venta")
    assert venta_movimiento["descripcion"] == "Venta fiada"
    assert venta_movimiento["articulo"] == "Arroz Diana 500g"
    assert venta_movimiento["cantidad"] == 2


def test_metodo_pago_invalido_en_abono_rechaza_payload(
    cartera_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = cartera_client

    with testing_session_local() as session:
        cliente = ClienteModel(
            nombre="Cliente Validacion",
            documento="900033",
            telefono_whatsapp="3005556666",
            limite_credito=100000,
            deuda_total=20000,
        )
        session.add(cliente)
        session.commit()
        cliente_id = cliente.id

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    response = client.post(
        f"/api/cartera/clientes/{cliente_id}/abonos",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "monto": 5000,
            "metodo_pago": "tarjeta",
        },
    )

    assert response.status_code == 422
