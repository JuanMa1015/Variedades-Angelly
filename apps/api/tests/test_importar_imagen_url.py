"""Importar una imagen desde una URL: guarda una copia propia y bloquea destinos peligrosos (SSRF)."""

from __future__ import annotations

import io

import httpx
import pytest
from fastapi import HTTPException
from PIL import Image

from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from src.api.routers import upload as upload_module
from src.api.services import imagen_remota

PUBLICA = "93.184.216.34"
RESOLUCION = {
    "cdn.ejemplo.com": [PUBLICA],
    "otro.ejemplo.com": [PUBLICA],
    "interno.ejemplo.com": ["10.0.0.5"],
    "mixto.ejemplo.com": [PUBLICA, "127.0.0.1"],
    "ipv6local.ejemplo.com": ["::1"],
}


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _imagen(formato: str = "PNG", tamano=(20, 20)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", tamano, "green").save(buffer, format=formato)
    return buffer.getvalue()


@pytest.fixture()
def entorno(monkeypatch, tmp_path):
    """Sin red real: DNS simulado, descargas simuladas y almacenamiento local temporal."""
    monkeypatch.setattr(upload_module, "LOCAL_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(upload_module, "BLOB_TOKEN", None)
    peticiones: list[httpx.Request] = []

    async def resolver(host, _puerto):
        if host not in RESOLUCION:
            raise HTTPException(status_code=400, detail="No se pudo encontrar esa direccion de internet.")
        return RESOLUCION[host]

    monkeypatch.setattr(imagen_remota, "resolver_ips", resolver)

    def servir(handler):
        def registrar(request: httpx.Request) -> httpx.Response:
            peticiones.append(request)
            return handler(request)

        monkeypatch.setattr(
            imagen_remota,
            "_cliente_http",
            lambda: httpx.AsyncClient(transport=httpx.MockTransport(registrar), follow_redirects=False),
        )

    return servir, peticiones, tmp_path


def _importar(client, token, url):
    return client.post("/api/upload-imagen-url", headers=_h(token), json={"url": url})


# ── Camino feliz ──


def test_importa_una_imagen_y_la_guarda_optimizada(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, peticiones, carpeta = entorno
    servir(lambda r: httpx.Response(200, content=_imagen("PNG", (3000, 2000)), headers={"content-type": "image/png"}))
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _importar(client, token, "https://cdn.ejemplo.com/foto.png")

    assert respuesta.status_code == 200
    assert respuesta.json()["url"].startswith("/uploads/")
    archivo = next(carpeta.iterdir())
    with Image.open(archivo) as guardada:
        assert max(guardada.size) == 1600  # se redujo como una subida normal
    assert len(peticiones) == 1


def test_deduce_el_formato_del_contenido_no_de_la_url(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, carpeta = entorno
    servir(lambda r: httpx.Response(200, content=_imagen("JPEG"), headers={"content-type": "image/jpeg"}))
    token = _login_token(client, "vendedor1", "ventas123")

    _importar(client, token, "https://cdn.ejemplo.com/descarga?id=7")

    assert next(carpeta.iterdir()).suffix == ".jpg"


def test_no_envia_cookies_ni_credenciales_al_sitio_externo(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, peticiones, _ = entorno
    servir(lambda r: httpx.Response(200, content=_imagen(), headers={"content-type": "image/png"}))
    token = _login_token(client, "vendedor1", "ventas123")

    _importar(client, token, "https://cdn.ejemplo.com/a.png")

    cabeceras = {k.lower() for k in peticiones[0].headers}
    assert "authorization" not in cabeceras
    assert "cookie" not in cabeceras


def test_sigue_redirecciones_publicas(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, peticiones, _ = entorno

    def manejador(r: httpx.Request) -> httpx.Response:
        if r.url.host == "cdn.ejemplo.com":
            return httpx.Response(302, headers={"location": "https://otro.ejemplo.com/final.png"})
        return httpx.Response(200, content=_imagen(), headers={"content-type": "image/png"})

    servir(manejador)
    token = _login_token(client, "vendedor1", "ventas123")

    assert _importar(client, token, "https://cdn.ejemplo.com/a.png").status_code == 200
    assert [p.url.host for p in peticiones] == ["cdn.ejemplo.com", "otro.ejemplo.com"]


# ── SSRF: destinos que el servidor nunca debe visitar ──


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/a.png",
        "http://127.1/a.png",
        "http://localhost/a.png",
        "http://10.0.0.5/a.png",
        "http://172.16.0.1/a.png",
        "http://192.168.1.10/a.png",
        "http://169.254.169.254/latest/meta-data/",
        "http://100.64.0.1/a.png",
        "http://0.0.0.0/a.png",
        "http://[::1]/a.png",
        "http://[::ffff:127.0.0.1]/a.png",
        "http://[fe80::1]/a.png",
        "http://interno.ejemplo.com/a.png",  # el nombre apunta a una IP privada
        "http://mixto.ejemplo.com/a.png",  # una sola IP privada basta para rechazarlo
        "http://ipv6local.ejemplo.com/a.png",
    ],
)
def test_bloquea_destinos_internos(auth_client, entorno, url) -> None:
    client, _ = auth_client
    servir, peticiones, carpeta = entorno
    servir(lambda r: httpx.Response(200, content=_imagen(), headers={"content-type": "image/png"}))
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _importar(client, token, url)

    assert respuesta.status_code == 400
    assert peticiones == []  # ni siquiera se intento la conexion
    assert list(carpeta.iterdir()) == []


@pytest.mark.parametrize(
    "url",
    [
        "ftp://cdn.ejemplo.com/a.png",
        "file:///etc/passwd",
        "gopher://cdn.ejemplo.com/",
        "javascript:alert(1)",
        "https://usuario:clave@cdn.ejemplo.com/a.png",
        "https://cdn.ejemplo.com:22/a.png",
        "https://cdn.ejemplo.com:8080/a.png",
        "https://no-existe.ejemplo.com/a.png",
    ],
)
def test_bloquea_esquemas_credenciales_puertos_y_nombres_inexistentes(auth_client, entorno, url) -> None:
    client, _ = auth_client
    servir, peticiones, _ = entorno
    servir(lambda r: httpx.Response(200, content=_imagen(), headers={"content-type": "image/png"}))
    token = _login_token(client, "vendedor1", "ventas123")

    assert _importar(client, token, url).status_code == 400
    assert peticiones == []


def test_una_redireccion_a_la_red_interna_se_bloquea(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, peticiones, _ = entorno
    servir(lambda r: httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"}))
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _importar(client, token, "https://cdn.ejemplo.com/a.png")

    assert respuesta.status_code == 400
    assert len(peticiones) == 1  # solo la primera; la segunda nunca salio


def test_demasiadas_redirecciones(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, _ = entorno
    servir(lambda r: httpx.Response(302, headers={"location": "https://otro.ejemplo.com/otra"}))
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _importar(client, token, "https://cdn.ejemplo.com/a.png")

    assert respuesta.status_code == 400
    assert "redirige demasiadas veces" in respuesta.json()["detail"]


def test_redireccion_sin_destino(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, _ = entorno
    servir(lambda r: httpx.Response(302))
    token = _login_token(client, "vendedor1", "ventas123")

    assert _importar(client, token, "https://cdn.ejemplo.com/a.png").status_code == 400


# ── Contenido y tamano ──


def test_rechaza_lo_que_no_es_imagen_por_content_type(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, _ = entorno
    servir(lambda r: httpx.Response(200, content=b"<html></html>", headers={"content-type": "text/html"}))
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _importar(client, token, "https://cdn.ejemplo.com/pagina")

    assert respuesta.status_code == 400
    assert "no es una imagen" in respuesta.json()["detail"]


def test_rechaza_bytes_que_no_son_imagen_aunque_digan_serlo(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, carpeta = entorno
    servir(lambda r: httpx.Response(200, content=b"MZ\x90\x00ejecutable", headers={"content-type": "image/png"}))
    token = _login_token(client, "vendedor1", "ventas123")

    assert _importar(client, token, "https://cdn.ejemplo.com/x.png").status_code == 400
    assert list(carpeta.iterdir()) == []


def test_rechaza_svg(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, _ = entorno
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    servir(lambda r: httpx.Response(200, content=svg, headers={"content-type": "image/svg+xml"}))
    token = _login_token(client, "vendedor1", "ventas123")

    assert _importar(client, token, "https://cdn.ejemplo.com/x.svg").status_code == 400


def test_rechaza_por_content_length_sin_descargar(auth_client, entorno, monkeypatch) -> None:
    client, _ = auth_client
    servir, _, _ = entorno
    monkeypatch.setattr(upload_module, "MAX_FILE_SIZE", 1000)
    servir(lambda r: httpx.Response(200, content=b"x" * 10, headers={"content-type": "image/png", "content-length": "999999"}))
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _importar(client, token, "https://cdn.ejemplo.com/x.png")

    assert respuesta.status_code == 400
    assert "5 MB" in respuesta.json()["detail"]


def test_corta_la_descarga_si_supera_el_limite_sin_content_length(auth_client, entorno, monkeypatch) -> None:
    client, _ = auth_client
    servir, _, _ = entorno
    monkeypatch.setattr(upload_module, "MAX_FILE_SIZE", 100)
    servir(lambda r: httpx.Response(200, content=_imagen("PNG", (300, 300)), headers={"content-type": "image/png"}))
    token = _login_token(client, "vendedor1", "ventas123")

    assert _importar(client, token, "https://cdn.ejemplo.com/x.png").status_code == 400


def test_error_http_del_sitio_externo(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, _ = entorno
    servir(lambda r: httpx.Response(404))
    token = _login_token(client, "vendedor1", "ventas123")

    respuesta = _importar(client, token, "https://cdn.ejemplo.com/x.png")

    assert respuesta.status_code == 400
    assert "404" in respuesta.json()["detail"]
    assert "subela desde tu computador" in respuesta.json()["detail"]


def test_tiempo_agotado_responde_504(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, _ = entorno

    def lento(r: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("lento", request=r)

    servir(lento)
    token = _login_token(client, "vendedor1", "ventas123")

    assert _importar(client, token, "https://cdn.ejemplo.com/x.png").status_code == 504


def test_fallo_de_conexion_responde_502(auth_client, entorno) -> None:
    client, _ = auth_client
    servir, _, _ = entorno

    def caido(r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sin conexion", request=r)

    servir(caido)
    token = _login_token(client, "vendedor1", "ventas123")

    assert _importar(client, token, "https://cdn.ejemplo.com/x.png").status_code == 502


# ── Acceso y validacion de la peticion ──


def test_exige_sesion(auth_client) -> None:
    client, _ = auth_client

    assert client.post("/api/upload-imagen-url", json={"url": "https://cdn.ejemplo.com/a.png"}).status_code == 401


@pytest.mark.parametrize("cuerpo", [{}, {"url": ""}, {"url": "x"}, {"url": "https://a.co/" + "a" * 2100}])
def test_valida_el_cuerpo(auth_client, cuerpo) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")

    assert client.post("/api/upload-imagen-url", headers=_h(token), json=cuerpo).status_code == 422


# ── Utilidades ──


@pytest.mark.parametrize(
    ("ip", "esperado"),
    [
        (PUBLICA, True),
        ("8.8.8.8", True),
        ("2606:4700:4700::1111", True),
        ("127.0.0.1", False),
        ("10.1.2.3", False),
        ("172.31.255.255", False),
        ("192.168.0.1", False),
        ("169.254.169.254", False),
        ("100.100.100.100", False),
        ("224.0.0.1", False),
        ("0.0.0.0", False),
        ("::1", False),
        ("fc00::1", False),
        ("::ffff:10.0.0.1", False),
        ("no-es-ip", False),
    ],
)
def test_clasificacion_de_direcciones_publicas(ip, esperado) -> None:
    assert imagen_remota.ip_es_publica(ip) is esperado


def test_el_limite_de_importaciones_es_estricto_fuera_de_pruebas(monkeypatch) -> None:
    from src.api.limiter import importar_imagen_rate_limit

    monkeypatch.setenv("APP_ENV", "production")
    assert importar_imagen_rate_limit() == "20/minute"
    monkeypatch.setenv("APP_ENV", "test")
    assert importar_imagen_rate_limit() == "1000/minute"
