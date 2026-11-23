"""Las imagenes no se pierden en silencio: en produccion, sin almacenamiento permanente, se rechazan con un mensaje claro."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from src.api.routers import upload as upload_module
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), "red").save(buffer, format="PNG")
    return buffer.getvalue()


def _subir(client, token=None):
    token = token or _login_token(client, "vendedor1", "ventas123")
    # Con APP_ENV=production las escrituras exigen Origin propio y X-Requested-With (proteccion CSRF).
    encabezados = {"Authorization": f"Bearer {token}", "Origin": "http://testserver", "X-Requested-With": "XMLHttpRequest"}
    return client.post("/api/upload-imagen", headers=encabezados, files={"file": ("foto.png", _png(), "image/png")})


@pytest.fixture()
def carpeta(tmp_path, monkeypatch):
    monkeypatch.setattr(upload_module, "LOCAL_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(upload_module, "BLOB_TOKEN", None)
    monkeypatch.delenv("IMAGENES_DISCO_LOCAL", raising=False)
    return tmp_path


def test_en_produccion_sin_blob_la_imagen_se_rechaza_y_no_se_guarda_en_el_disco(auth_client, carpeta, monkeypatch) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    monkeypatch.setenv("APP_ENV", "production")

    respuesta = _subir(client, token)

    assert respuesta.status_code == 503
    assert "BLOB_READ_WRITE_TOKEN" in respuesta.json()["detail"]
    assert list(carpeta.iterdir()) == []


def test_en_produccion_con_blob_se_sube_a_blob(auth_client, carpeta, monkeypatch) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setattr(upload_module, "BLOB_TOKEN", "token-de-prueba")
    subidas = []

    async def blob_falso(nombre, contenido, tipo):
        subidas.append((nombre, tipo, len(contenido)))
        return "https://tienda.public.blob.vercel-storage.com/productos/foto-abc.png"

    monkeypatch.setattr(upload_module, "_upload_to_blob", blob_falso)

    respuesta = _subir(client, token)

    assert respuesta.status_code == 200
    assert respuesta.json()["url"].startswith("https://tienda.public.blob.vercel-storage.com/")
    assert len(subidas) == 1 and subidas[0][1] == "image/png"
    assert list(carpeta.iterdir()) == []


def test_en_produccion_se_puede_usar_disco_si_se_declara_un_volumen_persistente(auth_client, carpeta, monkeypatch) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("IMAGENES_DISCO_LOCAL", "true")

    respuesta = _subir(client, token)

    assert respuesta.status_code == 200 and respuesta.json()["url"].startswith("/uploads/")
    assert len(list(carpeta.iterdir())) == 1


def test_en_desarrollo_sin_blob_se_guarda_en_disco(auth_client, carpeta) -> None:
    client, _ = auth_client

    respuesta = _subir(client)

    assert respuesta.status_code == 200 and respuesta.json()["url"].startswith("/uploads/")


def test_health_dice_donde_se_guardan_las_imagenes_y_se_degrada_si_no_son_permanentes(auth_client, carpeta, monkeypatch) -> None:
    client, _ = auth_client

    desarrollo = client.get("/health").json()
    monkeypatch.setenv("APP_ENV", "production")
    sin_blob = client.get("/health").json()
    monkeypatch.setattr(upload_module, "BLOB_TOKEN", "token-de-prueba")
    con_blob = client.get("/health").json()

    assert desarrollo["status"] == "ok" and desarrollo["imagenes"] == {"almacenamiento": "disco_local", "listo": True}
    assert sin_blob["status"] == "degraded" and sin_blob["imagenes"] == {"almacenamiento": "disco_local", "listo": False}
    assert con_blob["status"] == "ok" and con_blob["imagenes"] == {"almacenamiento": "blob", "listo": True}
    assert "token" not in str(con_blob).lower()  # nunca se expone el valor del token


# -- Respuestas de Vercel Blob traducidas a mensajes claros --


class _Respuesta:
    def __init__(self, status_code, cuerpo=None, texto=""):
        self.status_code, self._cuerpo, self.text = status_code, cuerpo or {}, texto

    def json(self):
        return self._cuerpo


class _Cliente:
    def __init__(self, respuesta):
        self.respuesta = respuesta

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def put(self, *args, **kwargs):
        if isinstance(self.respuesta, Exception):
            raise self.respuesta
        return self.respuesta


@pytest.mark.parametrize(
    ("respuesta", "estado", "texto"),
    [
        (_Respuesta(403, texto="forbidden"), 500, "BLOB_READ_WRITE_TOKEN"),
        (_Respuesta(401, texto="unauthorized"), 500, "BLOB_READ_WRITE_TOKEN"),
        (_Respuesta(500, texto="boom"), 502, "No se pudo guardar la imagen"),
        (__import__("httpx").ConnectError("sin red"), 502, "No se pudo contactar"),
    ],
)
def test_los_errores_de_blob_dicen_que_paso(auth_client, carpeta, monkeypatch, respuesta, estado, texto) -> None:
    client, _ = auth_client
    monkeypatch.setattr(upload_module, "BLOB_TOKEN", "token-de-prueba")
    monkeypatch.setattr(upload_module, "_cliente_http", lambda: _Cliente(respuesta))

    resultado = _subir(client)

    assert resultado.status_code == estado and texto in resultado.json()["detail"]


def test_blob_responde_bien_y_se_guarda_la_url(auth_client, carpeta, monkeypatch) -> None:
    client, _ = auth_client
    monkeypatch.setattr(upload_module, "BLOB_TOKEN", "token-de-prueba")
    monkeypatch.setattr(upload_module, "_cliente_http", lambda: _Cliente(_Respuesta(200, {"url": "https://x.public.blob.vercel-storage.com/productos/a.png"})))

    resultado = _subir(client)

    assert resultado.status_code == 200 and resultado.json()["url"].endswith("/productos/a.png")
