"""Cada rol entra solo a lo suyo: el admin a cartera, el vendedor a la tienda y el superadmin a todo.

La prueba recorre TODAS las rutas registradas en la aplicacion, asi una ruta nueva que se abra por error
a un rol que no corresponde hace fallar esta prueba.
"""

from __future__ import annotations

import re

import pytest

from src.main import app
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

# Lo que el admin (cartera) NO puede tocar: todo lo de la tienda y la gerencia.
PREFIJOS_CERRADOS_AL_ADMIN = (
    "/api/caja",
    "/api/export",
    "/api/facturas-compra",
    "/api/fidelizacion",
    "/api/gastos",
    "/api/proveedores",
    "/api/ventas",
    "/api/clientes/tienda-fiado",
    "/api/superadmin",
)
# Lo que el vendedor NO puede tocar: cartera, auditoria y gerencia.
PREFIJOS_CERRADOS_AL_VENDEDOR = ("/api/cartera", "/api/auditorias", "/api/superadmin")


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _rutas(prefijos: tuple[str, ...]) -> list[tuple[str, str]]:
    encontradas = []
    for ruta in app.routes:
        path = getattr(ruta, "path", "")
        if not path.startswith(prefijos):
            continue
        for metodo in sorted(getattr(ruta, "methods", None) or ()):
            if metodo in ("HEAD", "OPTIONS"):
                continue
            encontradas.append((metodo, re.sub(r"\{[^}]+\}", "1", path)))
    return encontradas


def _intentar(client, token: str, metodo: str, path: str) -> int:
    return client.request(metodo, path, headers=_h(token), json={} if metodo in ("POST", "PUT", "PATCH") else None).status_code


def test_el_recorrido_de_rutas_no_esta_vacio() -> None:
    assert len(_rutas(PREFIJOS_CERRADOS_AL_ADMIN)) > 40
    assert len(_rutas(PREFIJOS_CERRADOS_AL_VENDEDOR)) > 25


def test_el_admin_recibe_403_en_todo_lo_de_la_tienda_y_la_gerencia(auth_client) -> None:
    client, _ = auth_client
    token = _login_token(client, "angelly_admin", "cambiame123")

    abiertas = [(m, p) for m, p in _rutas(PREFIJOS_CERRADOS_AL_ADMIN) if _intentar(client, token, m, p) != 403]

    assert abiertas == [], f"El admin no deberia entrar a: {abiertas}"


def test_el_vendedor_recibe_403_en_cartera_auditoria_y_gerencia(auth_client) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")

    abiertas = [(m, p) for m, p in _rutas(PREFIJOS_CERRADOS_AL_VENDEDOR) if _intentar(client, token, m, p) != 403]

    assert abiertas == [], f"El vendedor no deberia entrar a: {abiertas}"


@pytest.mark.parametrize("path", ["/api/cartera/dashboard", "/api/cartera/resumen", "/api/cartera/clientes", "/api/productos?catalogo=cartera", "/api/auditorias"])
def test_el_admin_si_entra_a_cartera(auth_client, path) -> None:
    client, _ = auth_client
    token = _login_token(client, "angelly_admin", "cambiame123")

    assert client.get(path, headers=_h(token)).status_code == 200


@pytest.mark.parametrize("path", ["/api/gastos", "/api/proveedores", "/api/caja/estado", "/api/productos", "/api/dashboard/vendedor"])
def test_el_vendedor_si_entra_a_la_tienda(auth_client, path) -> None:
    client, _ = auth_client
    token = _login_token(client, "vendedor1", "ventas123")

    assert client.get(path, headers=_h(token)).status_code == 200


@pytest.mark.parametrize("path", ["/api/gastos", "/api/proveedores", "/api/cartera/dashboard", "/api/auditorias", "/api/superadmin/usuarios/admins"])
def test_el_superadmin_entra_a_todo(auth_client, path) -> None:
    client, _ = auth_client
    token = _login_token(client, "angelly_superadmin", "supersecure123")

    assert client.get(path, headers=_h(token)).status_code == 200
