from __future__ import annotations

from collections.abc import Generator
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    Base,
    ClienteFiadoTiendaModel,
    ClienteFidelizacionModel,
    ClienteModel,
    ProductoModel,
    VentaModel,
)
from src.main import app


@pytest.fixture()
def split_router_client() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
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


def test_dashboard_resumen_incluye_totales_por_metodo(
    split_router_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = split_router_client

    with testing_session_local() as session:
        cliente = ClienteModel(
            nombre="Cliente Resumen",
            documento="70001",
            telefono_whatsapp="3001110001",
            limite_credito=100000,
            deuda_total=25000,
        )
        session.add(cliente)
        session.flush()

        session.add_all(
            [
                VentaModel(
                    cliente_id=cliente.id,
                    es_fiado=False,
                    tipo_fiado=None,
                    metodo_pago="efectivo",
                    total=50000,
                    saldo_pendiente=0,
                ),
                VentaModel(
                    cliente_id=cliente.id,
                    es_fiado=True,
                    tipo_fiado="cartera",
                    metodo_pago="transferencia",
                    total=40000,
                    saldo_pendiente=10000,
                ),
                AbonoCarteraModel(
                    cliente_id=cliente.id,
                    monto=7000,
                    metodo_pago="efectivo",
                    saldo_cliente=18000,
                    referencia="Abono 1",
                ),
                AbonoCarteraModel(
                    cliente_id=cliente.id,
                    monto=3000,
                    metodo_pago="transferencia",
                    saldo_cliente=15000,
                    referencia="Abono 2",
                ),
            ],
        )
        session.commit()

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    response = client.get(
        "/api/dashboard/resumen",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["pagos_efectivo"] == 57000
    assert payload["pagos_transferencia"] == 33000


def test_clientes_tienda_fiado_crud_basico(
    split_router_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = split_router_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    create_response = client.post(
        "/api/clientes/tienda-fiado",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "nombre": "Cliente Tienda CRUD",
            "telefono_whatsapp": "3011112222",
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()

    patch_response = client.patch(
        f"/api/clientes/tienda-fiado/{created['id']}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "nombre": "Cliente Tienda Editado",
            "telefono_whatsapp": "3019998888",
        },
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["nombre"] == "Cliente Tienda Editado"

    list_response = client.get(
        "/api/clientes/tienda-fiado",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert list_response.status_code == 200
    assert any(item["nombre"] == "Cliente Tienda Editado" for item in list_response.json())

    delete_response = client.delete(
        f"/api/clientes/tienda-fiado/{created['id']}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert delete_response.status_code == 204


def test_delete_cliente_tienda_fiado_con_historial_retorna_409(
    split_router_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = split_router_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    with testing_session_local() as session:
        cliente_tienda = ClienteFiadoTiendaModel(
            nombre="Cliente Bloqueado",
            telefono_whatsapp="3022223333",
        )
        producto = ProductoModel(
            nombre="Producto Bloqueo",
            precio_costo=1800,
            precio_venta=3000,
            stock_actual=10,
            stock_minimo=1,
            catalogo="tienda",
        )
        session.add_all([cliente_tienda, producto])
        session.commit()
        cliente_tienda_id = cliente_tienda.id
        producto_id = producto.id

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
        f"/api/clientes/tienda-fiado/{cliente_tienda_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )

    assert delete_response.status_code == 409
    assert "historial de ventas" in delete_response.json()["detail"]


def test_fidelizacion_admin_crud_y_vendedor_sin_alta(
    split_router_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = split_router_client

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    forbidden_response = client.post(
        "/api/fidelizacion/clientes",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "nombre": "Cliente Rechazado",
            "telefono_whatsapp": "3005556666",
            "puntos_acumulados": 5,
        },
    )
    assert forbidden_response.status_code == 403

    create_response = client.post(
        "/api/fidelizacion/clientes",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Cliente Fidelizacion CRUD",
            "telefono_whatsapp": "3001119998",
            "puntos_acumulados": 20,
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()

    patch_response = client.patch(
        f"/api/fidelizacion/clientes/{created['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nombre": "Cliente Fidelizacion Editado",
            "puntos_acumulados": 80,
        },
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["nombre"] == "Cliente Fidelizacion Editado"
    assert patched["puntos_acumulados"] == 80

    list_response = client.get(
        "/api/fidelizacion/clientes",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert list_response.status_code == 200
    assert any(item["id"] == created["id"] for item in list_response.json())

    delete_response = client.delete(
        f"/api/fidelizacion/clientes/{created['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete_response.status_code == 204


def test_superadmin_puede_consumir_endpoints_admin(
    split_router_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = split_router_client

    with testing_session_local() as session:
        session.add(
            ClienteModel(
                nombre="Cliente Superadmin",
                documento="70009",
                telefono_whatsapp="3009090909",
                limite_credito=50000,
                deuda_total=12000,
            ),
        )
        session.commit()

    superadmin_token = _login_token(client, "root_owner", "supersecure123")
    response = client.get(
        "/api/clientes/cartera",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert any(item["nombre"] == "Cliente Superadmin" for item in payload["data"])
