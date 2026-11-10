"""Pruebas de endurecimiento: cookies, IP del cliente, subida de imagenes y exportes CSV."""

from __future__ import annotations

import io
from types import SimpleNamespace

import pytest
from PIL import Image

from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from src.api import limiter as limiter_module
from src.api.routers import auth as auth_module
from src.api.routers import upload as upload_module
from src.infrastructure.database.models import ClienteModel, ProductoModel, VentaModel


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _png(size: tuple[int, int] = (10, 10)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "red").save(buffer, format="PNG")
    return buffer.getvalue()


def _subir(client, token, contenido: bytes, nombre: str = "foto.png"):
    return client.post("/api/upload-imagen", headers=_h(token), files={"file": (nombre, contenido, "image/png")})


# ── Cookies ──


@pytest.mark.parametrize(
    ("entorno", "samesite", "esperado_samesite", "esperado_secure"),
    [
        ("development", "", "lax", False),
        ("production", "", "none", True),
        ("production", "lax", "lax", True),
        ("development", "none", "none", True),  # SameSite=None exige Secure
        ("development", "invalido", "lax", False),
    ],
)
def test_opciones_de_cookie_segun_entorno(monkeypatch, entorno, samesite, esperado_samesite, esperado_secure) -> None:
    monkeypatch.setenv("APP_ENV", entorno)
    monkeypatch.setenv("COOKIE_SAMESITE", samesite)

    opciones = auth_module._session_cookie_options()

    assert opciones == {"httponly": True, "samesite": esperado_samesite, "secure": esperado_secure}


def test_login_usa_el_samesite_configurado(auth_client, monkeypatch) -> None:
    client, _ = auth_client
    monkeypatch.setenv("COOKIE_SAMESITE", "strict")

    respuesta = client.post("/api/auth/login", json={"username": "angelly_admin", "password": "cambiame123"})

    cookies = respuesta.headers.get_list("set-cookie")
    assert len(cookies) == 2
    assert all("samesite=strict" in c.lower() and "httponly" in c.lower() for c in cookies)


# ── IP del cliente ──


def _peticion(headers: dict[str, str], host: str = "10.0.0.1"):
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=host))


def test_ip_del_cliente_confia_en_el_proxy_por_defecto(monkeypatch) -> None:
    monkeypatch.delenv("TRUST_PROXY_HEADERS", raising=False)

    assert limiter_module._get_client_ip(_peticion({"X-Real-IP": "203.0.113.5"})) == "203.0.113.5"
    assert limiter_module._get_client_ip(_peticion({"X-Forwarded-For": "1.1.1.1, 203.0.113.9"})) == "203.0.113.9"
    assert limiter_module._get_client_ip(_peticion({})) == "10.0.0.1"


def test_ip_del_cliente_ignora_headers_falsificables_sin_proxy(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "false")

    ip = limiter_module._get_client_ip(_peticion({"X-Real-IP": "9.9.9.9", "X-Forwarded-For": "8.8.8.8"}))

    assert ip == "10.0.0.1"


# ── Subida de imagenes ──


@pytest.fixture()
def carpeta_uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(upload_module, "LOCAL_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(upload_module, "BLOB_TOKEN", None)
    return tmp_path


def test_subida_valida_se_guarda(auth_client, carpeta_uploads) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _subir(client, token, _png())

    assert respuesta.status_code == 200
    assert len(list(carpeta_uploads.iterdir())) == 1


def test_subida_rechaza_archivos_que_superan_el_limite(auth_client, carpeta_uploads, monkeypatch) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    monkeypatch.setattr(upload_module, "MAX_FILE_SIZE", 100)

    respuesta = _subir(client, token, _png((200, 200)))

    assert respuesta.status_code == 400
    assert "5 MB" in respuesta.json()["detail"]
    assert list(carpeta_uploads.iterdir()) == []


def test_subida_rechaza_riff_que_no_es_webp(auth_client, carpeta_uploads) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    wav = b"RIFF" + b"\x24\x00\x00\x00" + b"WAVE" + b"fmt " + b"\x00" * 40

    respuesta = _subir(client, token, wav, nombre="audio.webp")

    assert respuesta.status_code == 400


def test_subida_rechaza_bmp(auth_client, carpeta_uploads) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4)).save(buffer, format="BMP")

    assert _subir(client, token, buffer.getvalue(), nombre="x.bmp").status_code == 400


def test_subida_rechaza_imagenes_con_demasiados_pixeles(auth_client, carpeta_uploads, monkeypatch) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")
    monkeypatch.setattr(upload_module, "MAX_PIXELS", 100)

    respuesta = _subir(client, token, _png((50, 50)))  # 2500 px > 100

    assert respuesta.status_code == 400
    assert "pixeles" in respuesta.json()["detail"]


def test_subida_rechaza_gif_corrupto(auth_client, carpeta_uploads) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")

    assert _subir(client, token, b"GIF89a" + b"\x00" * 20, nombre="x.gif").status_code == 400


# ── Exportes CSV ──


def test_exporte_neutraliza_formulas_de_excel(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        db.add(ProductoModel(
            nombre='=HYPERLINK("http://malo.example","clic")', precio_costo=1, precio_venta=2,
            stock_actual=1, stock_minimo=0, codigo_barras="+123",
        ))
        db.commit()
    token = _login_token(client, "angelly_admin", "cambiame123")

    respuesta = client.get("/api/export/productos", headers=_h(token))

    assert respuesta.status_code == 200
    assert "'=HYPERLINK" in respuesta.text
    assert "'+123" in respuesta.text
    assert respuesta.headers["content-disposition"] == 'attachment; filename="productos.csv"'


def test_exporte_de_ventas_neutraliza_el_nombre_del_cliente(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        cliente = ClienteModel(nombre="@SUM(A1)", documento="1", limite_credito=0)
        db.add(cliente)
        db.flush()
        db.add(VentaModel(cliente_id=cliente.id, total=10, saldo_pendiente=0, creado_por="-cmd"))
        db.commit()
    token = _login_token(client, "angelly_admin", "cambiame123")

    texto = client.get("/api/export/ventas", headers=_h(token)).text

    assert "'@SUM(A1)" in texto
    assert "'-cmd" in texto
