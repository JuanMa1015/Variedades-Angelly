"""Pruebas de API para autenticacion JWT y usuarios semilla."""

from __future__ import annotations

from collections.abc import Generator
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.auth.security import decode_access_token
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    Base,
    ClienteFiadoTiendaModel,
    ClienteFidelizacionModel,
    ClienteModel,
    ProductoModel,
    UsuarioModel,
)
from src.main import app


@pytest.fixture()
def auth_client() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    """Entrega cliente API con BD SQLite aislada para pruebas auth."""
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


def test_login_admin_retorna_jwt_y_rol(auth_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    """Valida login exitoso del admin semilla y payload principal del token."""
    client, _ = auth_client

    response = client.post(
        "/api/auth/login",
        json={"username": "angelly_admin", "password": "cambiame123"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["role"] == "admin"
    assert payload["username"] == "angelly_admin"
    assert isinstance(payload["expires_in"], int)
    assert payload["expires_in"] > 0

    token_payload = decode_access_token(payload["access_token"])
    assert token_payload is not None
    assert token_payload.get("sub") == "angelly_admin"
    assert token_payload.get("role") == "admin"


def test_login_credenciales_invalidas_retorna_401(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Confirma que un password invalido no autentica y retorna 401."""
    client, _ = auth_client

    response = client.post(
        "/api/auth/login",
        json={"username": "angelly_admin", "password": "clave_erronea"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales invalidas"


def test_semillas_crean_admin_y_vendedor(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verifica que login inicial dispare la creacion de ambos usuarios semilla."""
    client, testing_session_local = auth_client

    login_response = client.post(
        "/api/auth/login",
        json={"username": "vendedor1", "password": "ventas123"},
    )

    assert login_response.status_code == 200
    assert login_response.json()["role"] == "vendedor"

    with testing_session_local() as session:
        usuarios = session.execute(select(UsuarioModel)).scalars().all()
        usernames = {usuario.username for usuario in usuarios}

    assert {"angelly_admin", "vendedor1"}.issubset(usernames)


def _login_token(client: TestClient, username: str, password: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_rbac_exige_token_en_cartera(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Confirma que cartera no es accesible sin Bearer token."""
    client, _ = auth_client

    response = client.get("/api/clientes/cartera")

    assert response.status_code == 401


def test_rbac_vendedor_no_puede_ver_cartera(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Valida que vendedor reciba 403 en endpoints de cartera."""
    client, _ = auth_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    response = client.get(
        "/api/clientes/cartera",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )

    assert response.status_code == 403


def test_cartera_admin_solo_lista_clientes_fiados(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verifica filtro de cartera: solo clientes con deuda > 0."""
    client, testing_session_local = auth_client

    with testing_session_local() as session:
        session.add_all(
            [
                ClienteModel(
                    nombre="Cliente Fiado",
                    documento="9001",
                    telefono_whatsapp="3005551111",
                    limite_credito=50000,
                    deuda_total=12000,
                ),
                ClienteModel(
                    nombre="Cliente Al Dia",
                    documento="9002",
                    telefono_whatsapp="3005552222",
                    limite_credito=50000,
                    deuda_total=0,
                ),
            ],
        )
        session.commit()

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    response = client.get(
        "/api/clientes/cartera",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    nombres = {item["nombre"] for item in payload["data"]}
    assert "Cliente Fiado" in nombres
    assert "Cliente Al Dia" not in nombres


def test_fidelizacion_canjea_bono_y_descuenta_puntos(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Valida ciclo basico de canje para clientes de fidelizacion."""
    client, testing_session_local = auth_client

    with testing_session_local() as session:
        session.add(
            ClienteFidelizacionModel(
                nombre="Cliente Bono",
                telefono_whatsapp="3009876543",
                puntos_acumulados=140,
            ),
        )
        session.commit()
        cliente = session.execute(
            select(ClienteFidelizacionModel).where(
                ClienteFidelizacionModel.telefono_whatsapp == "3009876543",
            ),
        ).scalar_one()
        cliente_id = cliente.id

    admin_token = _login_token(client, "angelly_admin", "cambiame123")
    canje_response = client.post(
        f"/api/fidelizacion/clientes/{cliente_id}/canjear-bono",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert canje_response.status_code == 200
    assert canje_response.json()["puntos_acumulados"] == 40


def test_vendedor_puede_listar_clientes_fidelizacion(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Valida que vendedor tenga acceso al modulo de fidelizacion."""
    client, testing_session_local = auth_client

    with testing_session_local() as session:
        session.add(
            ClienteFidelizacionModel(
                nombre="Cliente Fidelizacion",
                telefono_whatsapp="3007778899",
                puntos_acumulados=55,
            ),
        )
        session.commit()

    vendedor_token = _login_token(client, "vendedor1", "ventas123")
    response = client.get(
        "/api/fidelizacion/clientes",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert any(item["telefono_whatsapp"] == "3007778899" for item in payload)


def test_vendedor_puede_listar_productos(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Valida que vendedor tenga acceso a inventario desde API."""
    client, _ = auth_client

    vendedor_token = _login_token(client, "vendedor1", "ventas123")
    response = client.get(
        "/api/productos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_vendedor_no_puede_registrar_fiado_cartera(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Valida que solo admin pueda crear ventas fiadas sobre cartera."""
    client, testing_session_local = auth_client

    with testing_session_local() as session:
        producto = ProductoModel(
            nombre="Producto Fiado Cartera",
            precio_costo=2000,
            precio_venta=3000,
            stock_actual=20,
            stock_minimo=2,
        )
        cliente = ClienteModel(
            nombre="Cliente Cartera",
            documento="991122",
            telefono_whatsapp="3001119999",
            limite_credito=50000,
            deuda_total=0,
        )
        session.add_all([producto, cliente])
        session.commit()
        producto_id = producto.id
        cliente_id = cliente.id

    vendedor_token = _login_token(client, "vendedor1", "ventas123")
    response = client.post(
        "/api/ventas",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "cliente_id": cliente_id,
            "items": [{"producto_id": producto_id, "cantidad": 1}],
            "es_fiado": True,
            "fiado_origen": "cartera",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Solo admin puede registrar fiados de cartera"


def test_vendedor_puede_registrar_fiado_tienda(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Confirma que vendedor puede registrar fiado operativo de tienda."""
    client, testing_session_local = auth_client

    with testing_session_local() as session:
        producto = ProductoModel(
            nombre="Producto Fiado Tienda",
            precio_costo=1500,
            precio_venta=2500,
            stock_actual=15,
            stock_minimo=2,
        )
        cliente_tienda = ClienteFiadoTiendaModel(
            nombre="Cliente Tienda",
            telefono_whatsapp="3018887777",
        )
        session.add_all([producto, cliente_tienda])
        session.commit()
        producto_id = producto.id
        cliente_tienda_id = cliente_tienda.id

    vendedor_token = _login_token(client, "vendedor1", "ventas123")
    response = client.post(
        "/api/ventas",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "cliente_tienda_id": cliente_tienda_id,
            "items": [{"producto_id": producto_id, "cantidad": 2}],
            "es_fiado": True,
            "fiado_origen": "tienda",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["fiado_origen"] == "tienda"
    assert payload["cliente_tienda_id"] == cliente_tienda_id
    assert payload["total"] == 5000
    assert payload["saldo_pendiente"] == 5000


def test_pedido_proveedor_flujo_directo_sin_aprobacion(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verifica flujo directo: vendedor crea pedido sin aprobación posterior."""
    client, _ = auth_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    proveedor_response = client.post(
        "/api/proveedores",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "nombre": "Proveedor Flujo",
            "contacto": "Andrea",
            "telefono": "3004445566",
        },
    )
    assert proveedor_response.status_code == 201
    proveedor_id = proveedor_response.json()["id"]

    pedido_response = client.post(
        "/api/proveedores/pedidos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "proveedor_id": proveedor_id,
            "descripcion": "Pedido de reposicion semanal",
            "monto_estimado": 250000,
        },
    )
    assert pedido_response.status_code == 201
    pedido_payload = pedido_response.json()
    pedido_id = pedido_payload["id"]
    assert pedido_payload["estado"] == "enviado"
    assert pedido_payload["creado_por"] == "vendedor1"

    aprobar_vendedor = client.patch(
        f"/api/proveedores/pedidos/{pedido_id}/aprobar",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert aprobar_vendedor.status_code == 404


def test_vendedor_puede_registrar_y_listar_gastos(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Valida alta y consulta de gastos operativos para vendedor."""
    client, _ = auth_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    create_response = client.post(
        "/api/gastos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        json={
            "categoria": "servicios",
            "descripcion": "Pago de internet del local",
            "monto": 120000,
        },
    )

    assert create_response.status_code == 201
    created_payload = create_response.json()
    assert created_payload["registrado_por"] == "vendedor1"

    list_response = client.get(
        "/api/gastos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )

    assert list_response.status_code == 200
    payload = list_response.json()
    assert any(item["descripcion"] == "Pago de internet del local" for item in payload)


def test_dashboard_resumen_disponible_para_vendedor(
    auth_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Confirma que dashboard responde estructura base para vendedor."""
    client, _ = auth_client
    vendedor_token = _login_token(client, "vendedor1", "ventas123")

    response = client.get(
        "/api/dashboard/resumen",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "ventas_diarias" in payload
    assert "ventas_semanales" in payload
    assert "ventas_mensuales" in payload
