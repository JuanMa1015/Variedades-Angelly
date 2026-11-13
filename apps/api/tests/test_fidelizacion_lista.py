"""Fidelizacion: lista con busqueda, filtros y pagina del servidor, y resumen de todo el programa."""

from __future__ import annotations

from src.infrastructure.database.models import ClienteFidelizacionModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _admin(client) -> str:
    return _login_token(client, "angelly_superadmin", "supersecure123")


def _clientes(sf) -> None:
    datos = [
        ("Monica Salazar", "573023456789", 150, True),
        ("Camilo Perez", "573012345678", 65, True),
        ("Lina Rojas", "573001234567", 20, True),
        ("Monica Torres", "573157778899", 100, True),   # justo en el minimo para canjear
        ("Pedro Viejo", "573200000001", 500, False),    # desactivado: no cuenta ni sale por defecto
    ]
    with sf() as db:
        for nombre, telefono, puntos, activo in datos:
            db.add(ClienteFidelizacionModel(nombre=nombre, telefono_whatsapp=telefono, puntos_acumulados=puntos, activo=activo))
        db.commit()


def _lista(client, token=None, **filtros) -> dict:
    params = "&".join(f"{k}={v}" for k, v in filtros.items())
    respuesta = client.get(f"/api/fidelizacion/clientes/paginados?{params}", headers=_h(token or _vendedor(client)))
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _nombres(cuerpo: dict) -> list[str]:
    return [c["nombre"] for c in cuerpo["data"]]


def test_por_defecto_salen_los_activos_de_mas_a_menos_puntos(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    cuerpo = _lista(client)

    assert _nombres(cuerpo) == ["Monica Salazar", "Monica Torres", "Camilo Perez", "Lina Rojas"]
    assert all(c["activo"] is True for c in cuerpo["data"])
    assert cuerpo["page"]["total"] == 4


def test_a_igual_de_puntos_se_ordena_por_nombre(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        for nombre, telefono in (("Zoe Zapata", "573001110001"), ("Ana Arias", "573001110002")):
            db.add(ClienteFidelizacionModel(nombre=nombre, telefono_whatsapp=telefono, puntos_acumulados=40))
        db.commit()

    assert _nombres(_lista(client)) == ["Ana Arias", "Zoe Zapata"]


def test_paginar(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    pagina1 = _lista(client, limit=3, page=1)
    pagina2 = _lista(client, limit=3, page=2)

    assert pagina1["page"]["total"] == 4 and pagina1["page"]["total_pages"] == 2
    assert _nombres(pagina1) + _nombres(pagina2) == ["Monica Salazar", "Monica Torres", "Camilo Perez", "Lina Rojas"]
    assert _nombres(pagina2) == ["Lina Rojas"]


def test_buscar_por_nombre_sin_importar_mayusculas(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    assert _nombres(_lista(client, q="MONICA")) == ["Monica Salazar", "Monica Torres"]
    assert _nombres(_lista(client, q="  perez ")) == ["Camilo Perez"]
    assert _nombres(_lista(client, q="zzz")) == []


def test_buscar_por_parte_del_whatsapp_escrito_de_cualquier_forma(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    assert _nombres(_lista(client, q="302 345")) == ["Monica Salazar"]
    assert _nombres(_lista(client, q="3157778899")) == ["Monica Torres"]
    assert _nombres(_lista(client, q="57300123")) == ["Lina Rojas"]


def test_una_busqueda_con_pocos_digitos_no_filtra_por_telefono(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    assert _nombres(_lista(client, q="57")) == []  # menos de 3 digitos: solo se busca en nombres


def test_la_busqueda_se_combina_con_la_pagina_y_el_total_es_el_de_la_busqueda(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    cuerpo = _lista(client, q="monica", limit=1, page=2)

    assert _nombres(cuerpo) == ["Monica Torres"]
    assert cuerpo["page"]["total"] == 2 and cuerpo["page"]["total_pages"] == 2


def test_canjeables_son_los_que_llegan_al_minimo(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    assert _nombres(_lista(client, estado="canjeables")) == ["Monica Salazar", "Monica Torres"]


def test_el_admin_ve_los_desactivados_y_todos(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)
    admin = _admin(client)

    desactivados = _lista(client, token=admin, estado="desactivados")
    todos = _lista(client, token=admin, estado="todos")

    assert _nombres(desactivados) == ["Pedro Viejo"] and desactivados["data"][0]["activo"] is False
    assert len(todos["data"]) == 5


def test_el_vendedor_no_ve_los_desactivados(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)
    token = _vendedor(client)

    for estado in ("desactivados", "todos"):
        assert client.get(f"/api/fidelizacion/clientes/paginados?estado={estado}", headers=_h(token)).status_code == 403


def test_filtros_invalidos_y_sin_sesion(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)

    assert client.get("/api/fidelizacion/clientes/paginados?estado=raro", headers=_h(token)).status_code == 422
    assert client.get("/api/fidelizacion/clientes/paginados?limit=0", headers=_h(token)).status_code == 422
    client.cookies.clear()
    assert client.get("/api/fidelizacion/clientes/paginados").status_code in (401, 403)


def test_el_listado_original_sigue_igual_para_el_punto_de_venta(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    cuerpo = client.get("/api/fidelizacion/clientes", headers=_h(_vendedor(client))).json()

    assert isinstance(cuerpo, list)
    assert [c["nombre"] for c in cuerpo] == ["Monica Salazar", "Monica Torres", "Camilo Perez", "Lina Rojas"]
    assert set(cuerpo[0]) == {"id", "nombre", "telefono_whatsapp", "puntos_acumulados"}


# -- Resumen --


def test_el_resumen_cuenta_todo_el_programa_y_no_los_desactivados(auth_client) -> None:
    client, sf = auth_client
    _clientes(sf)

    cuerpo = client.get("/api/fidelizacion/resumen", headers=_h(_vendedor(client))).json()

    assert cuerpo == {
        "total_activos": 4,
        "pueden_canjear": 2,
        "desactivados": 1,
        "puntos_en_circulacion": 335,   # 150 + 65 + 20 + 100 (sin los 500 del desactivado)
        "valor_en_circulacion": 6700,   # 335 puntos x $20
        "umbral_bono": 100,
        "valor_punto": 20,
    }


def test_el_resumen_sin_clientes_da_ceros_y_requiere_sesion(auth_client) -> None:
    client, _ = auth_client

    cuerpo = client.get("/api/fidelizacion/resumen", headers=_h(_vendedor(client))).json()
    assert cuerpo["total_activos"] == 0 and cuerpo["puntos_en_circulacion"] == 0 and cuerpo["valor_en_circulacion"] == 0
    client.cookies.clear()
    assert client.get("/api/fidelizacion/resumen").status_code in (401, 403)
