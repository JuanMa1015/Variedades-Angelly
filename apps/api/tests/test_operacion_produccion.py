"""Pruebas de operacion: subida a Vercel Blob, estado de migraciones y log de errores 500."""

from __future__ import annotations

import asyncio
import io
import logging
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, text

from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from src.api.routers import upload as upload_module
from src.infrastructure.database.migraciones import ALEMBIC_DIR, estado_migraciones
from src.main import app


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "blue").save(buffer, format="PNG")
    return buffer.getvalue()


def _cliente_simulado(handler):
    """Cliente httpx cuyo servidor es la funcion ``handler`` (sin red)."""
    return lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ── Vercel Blob ──


@pytest.fixture()
def con_blob(monkeypatch):
    monkeypatch.setattr(upload_module, "BLOB_TOKEN", "vercel_blob_rw_test_token")


def test_subida_a_blob_usa_el_contrato_del_sdk_oficial(con_blob, monkeypatch) -> None:
    capturada: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        capturada["request"] = request
        return httpx.Response(200, json={"url": "https://abc.public.blob.vercel-storage.com/productos/x-123.png"})

    monkeypatch.setattr(upload_module, "_cliente_http", _cliente_simulado(handler))

    url = asyncio.run(upload_module._upload_to_blob("x.png", b"datos", "image/png"))

    request = capturada["request"]
    assert url == "https://abc.public.blob.vercel-storage.com/productos/x-123.png"
    assert request.method == "PUT"
    assert request.url.path == "/api/blob/"
    assert request.url.params["pathname"] == "productos/x.png"
    assert request.headers["authorization"] == "Bearer vercel_blob_rw_test_token"
    assert request.headers["x-api-version"] == "13"
    assert request.headers["x-vercel-blob-access"] == "public"
    assert request.headers["x-content-type"] == "image/png"
    assert request.content == b"datos"


@pytest.mark.parametrize("estado", [401, 403])
def test_blob_rechaza_credenciales(con_blob, monkeypatch, estado) -> None:
    monkeypatch.setattr(upload_module, "_cliente_http", _cliente_simulado(lambda r: httpx.Response(estado, text="no")))

    with pytest.raises(HTTPException) as error:
        asyncio.run(upload_module._upload_to_blob("x.png", b"d", "image/png"))

    assert error.value.status_code == 500
    assert "BLOB_READ_WRITE_TOKEN" in error.value.detail


def test_blob_con_error_del_servicio_responde_502(con_blob, monkeypatch) -> None:
    monkeypatch.setattr(upload_module, "_cliente_http", _cliente_simulado(lambda r: httpx.Response(500, text="boom")))

    with pytest.raises(HTTPException) as error:
        asyncio.run(upload_module._upload_to_blob("x.png", b"d", "image/png"))

    assert error.value.status_code == 502


def test_blob_sin_conexion_responde_502(con_blob, monkeypatch) -> None:
    def caido(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sin red")

    monkeypatch.setattr(upload_module, "_cliente_http", _cliente_simulado(caido))

    with pytest.raises(HTTPException) as error:
        asyncio.run(upload_module._upload_to_blob("x.png", b"d", "image/png"))

    assert error.value.status_code == 502


def test_endpoint_devuelve_la_url_permanente_de_blob(auth_client, con_blob, monkeypatch) -> None:
    client, _ = auth_client
    monkeypatch.setattr(
        upload_module,
        "_cliente_http",
        _cliente_simulado(lambda r: httpx.Response(200, json={"url": "https://s.public.blob.vercel-storage.com/a.png"})),
    )
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = client.post(
        "/api/upload-imagen",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("foto.png", _png(), "image/png")},
    )

    assert respuesta.status_code == 200
    assert respuesta.json() == {"url": "https://s.public.blob.vercel-storage.com/a.png"}


# ── Estado de migraciones ──


def _bd_sqlite(tmp_path: Path):
    return create_engine(f"sqlite+pysqlite:///{(tmp_path / 'mig.sqlite3').as_posix()}")


def test_base_sin_migrar_se_reporta_como_pendiente(tmp_path) -> None:
    estado = estado_migraciones(_bd_sqlite(tmp_path))

    assert estado["actual"] is None
    assert estado["esperada"]
    assert estado["al_dia"] is False


def test_base_con_la_ultima_migracion_esta_al_dia(tmp_path) -> None:
    engine = _bd_sqlite(tmp_path)
    esperada = estado_migraciones(engine)["esperada"]
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        conn.execute(text("INSERT INTO alembic_version VALUES (:v)"), {"v": esperada})

    estado = estado_migraciones(engine)

    assert estado == {"actual": esperada, "esperada": esperada, "al_dia": True}


def test_la_carpeta_de_alembic_existe_junto_al_codigo() -> None:
    assert (ALEMBIC_DIR / "versions").is_dir()


def test_health_no_expone_migraciones_fuera_de_produccion(auth_client) -> None:
    client, _ = auth_client

    cuerpo = client.get("/health").json()

    assert cuerpo["status"] == "ok"
    assert cuerpo["migraciones"] is None


def test_health_marca_degradado_si_hay_migraciones_pendientes(auth_client, monkeypatch) -> None:
    import src.main as main_module

    client, _ = auth_client
    monkeypatch.setattr(main_module, "_estado_migraciones", lambda: {"actual": "a", "esperada": "b", "al_dia": False})

    cuerpo = client.get("/health").json()

    assert cuerpo["status"] == "degraded"
    assert cuerpo["migraciones"]["esperada"] == "b"


# ── Log de errores no controlados ──


def test_un_error_500_queda_registrado_con_su_traza(auth_client, caplog) -> None:
    client = TestClient(app, raise_server_exceptions=False)

    def rota():
        raise RuntimeError("fallo de prueba")

    app.add_api_route("/__prueba_500", rota, methods=["GET"])
    try:
        with caplog.at_level(logging.ERROR, logger="tienda_angelly"):
            respuesta = client.get("/__prueba_500")
    finally:
        app.router.routes = [r for r in app.router.routes if getattr(r, "path", "") != "/__prueba_500"]

    assert respuesta.status_code == 500
    assert "fallo de prueba" not in respuesta.text  # el usuario no ve el detalle interno
    registro = next(r for r in caplog.records if "Error no controlado" in r.getMessage())
    assert "GET /__prueba_500" in registro.getMessage()
    assert registro.exc_info is not None


def test_alembic_sigue_con_una_sola_cabeza() -> None:
    backend = Path(__file__).resolve().parents[1]
    salida = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "heads"],
        cwd=str(backend), capture_output=True, text=True, check=False,
    )
    assert salida.returncode == 0
    assert salida.stdout.count("(head)") == 1
