"""Gastos: resumen del mes (con la hora de Bogota), comparacion con el mes anterior y filtros del historial."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from src.infrastructure.database.models import GastoModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)

BOGOTA = timezone(timedelta(hours=-5))


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _gasto(sf, fecha: datetime, monto=1000.0, categoria="servicios", medio="efectivo", anulado=False, descripcion="Pago de la luz", por="vendedor1") -> int:
    with sf() as db:
        gasto = GastoModel(
            categoria=categoria, descripcion=descripcion, monto=monto, fecha=fecha, registrado_por=por,
            medio_pago=medio, anulado=anulado,
        )
        db.add(gasto)
        db.commit()
        return gasto.id


def _resumen(client, mes: str | None = None):
    url = "/api/gastos/resumen" + (f"?mes={mes}" if mes else "")
    return client.get(url, headers=_h(_vendedor(client)))


def _lista(client, **filtros) -> dict:
    params = "&".join(f"{k}={v}" for k, v in filtros.items())
    respuesta = client.get(f"/api/gastos/paginados?{params}", headers=_h(_vendedor(client)))
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _ids(cuerpo: dict) -> list[int]:
    return [g["id"] for g in cuerpo["data"]]


# -- Resumen --


def test_el_resumen_suma_solo_los_vigentes_del_mes_por_categoria_y_medio(auth_client) -> None:
    client, sf = auth_client
    _gasto(sf, datetime(2026, 11, 5, 15), 100000, "servicios", "efectivo")
    _gasto(sf, datetime(2026, 11, 6, 15), 250000, "arriendo", "transferencia")
    _gasto(sf, datetime(2026, 11, 7, 15), 50000, "servicios", "tarjeta")
    _gasto(sf, datetime(2026, 11, 8, 15), 999999, "otros", "efectivo", anulado=True)
    _gasto(sf, datetime(2026, 10, 8, 15), 777777, "otros", "efectivo")

    cuerpo = _resumen(client, "2026-11").json()

    assert cuerpo["mes"] == "2026-11"
    assert cuerpo["total"] == 400000
    assert cuerpo["registros"] == 3
    assert cuerpo["anulados"] == 1
    assert cuerpo["total_efectivo"] == 100000
    assert cuerpo["total_otros_medios"] == 300000
    assert [(c["categoria"], c["total"], c["registros"]) for c in cuerpo["por_categoria"]] == [("arriendo", 250000, 1), ("servicios", 150000, 2)]


def test_compara_con_el_mes_anterior(auth_client) -> None:
    client, sf = auth_client
    _gasto(sf, datetime(2026, 10, 10, 15), 200000)
    _gasto(sf, datetime(2026, 11, 10, 15), 300000)

    cuerpo = _resumen(client, "2026-11").json()

    assert cuerpo["mes_anterior"] == {"mes": "2026-10", "total": 200000, "registros": 1}
    assert cuerpo["variacion_pct"] == 50.0


def test_si_el_mes_anterior_fue_cero_no_hay_porcentaje(auth_client) -> None:
    client, sf = auth_client
    _gasto(sf, datetime(2026, 11, 10, 15), 300000)

    cuerpo = _resumen(client, "2026-11").json()

    assert cuerpo["mes_anterior"]["total"] == 0
    assert cuerpo["variacion_pct"] is None


def test_un_gasto_menor_que_el_mes_anterior_baja(auth_client) -> None:
    client, sf = auth_client
    _gasto(sf, datetime(2026, 10, 10, 15), 400000)
    _gasto(sf, datetime(2026, 11, 10, 15), 300000)

    assert _resumen(client, "2026-11").json()["variacion_pct"] == -25.0


def test_enero_se_compara_con_diciembre_del_ano_anterior(auth_client) -> None:
    client, sf = auth_client
    _gasto(sf, datetime(2025, 12, 20, 15), 100000)
    _gasto(sf, datetime(2026, 1, 20, 15), 100000)

    cuerpo = _resumen(client, "2026-01").json()

    assert cuerpo["mes_anterior"]["mes"] == "2025-12"
    assert cuerpo["variacion_pct"] == 0.0


def test_el_mes_se_cuenta_con_la_hora_de_bogota(auth_client) -> None:
    client, sf = auth_client
    # 03:00 UTC del 1 de noviembre son las 22:00 del 31 de octubre en Bogota
    _gasto(sf, datetime(2026, 11, 1, 3, 0), 111000)
    # 05:00 UTC del 1 de noviembre son las 00:00 en Bogota: ya es noviembre
    _gasto(sf, datetime(2026, 11, 1, 5, 0), 222000)

    assert _resumen(client, "2026-10").json()["total"] == 111000
    assert _resumen(client, "2026-11").json()["total"] == 222000


def test_sin_mes_usa_el_mes_actual(auth_client) -> None:
    client, sf = auth_client
    ahora_bogota = datetime.now(BOGOTA)
    _gasto(sf, datetime.now(UTC).replace(tzinfo=None), 5000)

    cuerpo = _resumen(client).json()

    assert cuerpo["mes"] == ahora_bogota.strftime("%Y-%m")
    assert cuerpo["total"] == 5000


def test_un_mes_mal_escrito_se_rechaza(auth_client) -> None:
    client, _ = auth_client

    for mes in ("2026-13", "26-11", "noviembre", "2026-00"):
        assert _resumen(client, mes).status_code == 422


def test_un_mes_sin_gastos_da_ceros(auth_client) -> None:
    client, _ = auth_client

    cuerpo = _resumen(client, "2026-05").json()

    assert cuerpo["total"] == 0 and cuerpo["registros"] == 0 and cuerpo["por_categoria"] == []


def test_el_resumen_requiere_autenticacion(auth_client) -> None:
    client, _ = auth_client

    assert client.get("/api/gastos/resumen").status_code in (401, 403)


# -- Historial con filtros --


def _varios(sf):
    return {
        "luz": _gasto(sf, datetime(2026, 11, 5, 15), 100000, "servicios", "efectivo", descripcion="Pago de la luz"),
        "arriendo": _gasto(sf, datetime(2026, 11, 6, 15), 1200000, "arriendo", "transferencia", descripcion="Arriendo del local", por="angelly_admin"),
        "anulado": _gasto(sf, datetime(2026, 11, 7, 15), 50000, "servicios", "tarjeta", anulado=True, descripcion="Gasto con error"),
        "octubre": _gasto(sf, datetime(2026, 10, 7, 15), 80000, "transporte", "efectivo", descripcion="Flete de octubre"),
    }


def test_filtrar_por_mes(auth_client) -> None:
    client, sf = auth_client
    ids = _varios(sf)

    assert sorted(_ids(_lista(client, mes="2026-11"))) == sorted([ids["luz"], ids["arriendo"], ids["anulado"]])
    assert _ids(_lista(client, mes="2026-10")) == [ids["octubre"]]


def test_filtrar_por_categoria_sin_importar_mayusculas(auth_client) -> None:
    client, sf = auth_client
    ids = _varios(sf)

    assert _ids(_lista(client, categoria="ARRIENDO")) == [ids["arriendo"]]
    assert sorted(_ids(_lista(client, categoria="servicios"))) == sorted([ids["luz"], ids["anulado"]])


def test_filtrar_por_medio_de_pago(auth_client) -> None:
    client, sf = auth_client
    ids = _varios(sf)

    assert _ids(_lista(client, medio_pago="transferencia")) == [ids["arriendo"]]
    assert sorted(_ids(_lista(client, medio_pago="efectivo"))) == sorted([ids["luz"], ids["octubre"]])


def test_filtrar_por_estado(auth_client) -> None:
    client, sf = auth_client
    ids = _varios(sf)

    assert _ids(_lista(client, estado="anulados")) == [ids["anulado"]]
    assert ids["anulado"] not in _ids(_lista(client, estado="vigentes"))
    assert len(_ids(_lista(client, estado="todos"))) == 4


def test_buscar_por_detalle_categoria_o_quien_lo_registro(auth_client) -> None:
    client, sf = auth_client
    ids = _varios(sf)

    assert _ids(_lista(client, q="FLETE")) == [ids["octubre"]]
    assert _ids(_lista(client, q="transporte")) == [ids["octubre"]]
    assert _ids(_lista(client, q="angelly_admin")) == [ids["arriendo"]]


def test_los_filtros_se_combinan_y_el_total_es_el_de_la_busqueda(auth_client) -> None:
    client, sf = auth_client
    ids = _varios(sf)

    cuerpo = _lista(client, mes="2026-11", categoria="servicios", estado="vigentes")

    assert _ids(cuerpo) == [ids["luz"]]
    assert cuerpo["page"]["total"] == 1


def test_paginar_el_historial_del_mas_nuevo_al_mas_antiguo(auth_client) -> None:
    client, sf = auth_client
    ids = _varios(sf)

    pagina1 = _lista(client, limit=2, page=1)
    pagina2 = _lista(client, limit=2, page=2)

    assert pagina1["page"]["total"] == 4 and pagina1["page"]["total_pages"] == 2
    assert _ids(pagina1) + _ids(pagina2) == [ids["anulado"], ids["arriendo"], ids["luz"], ids["octubre"]]


def test_filtros_invalidos_se_rechazan(auth_client) -> None:
    client, _ = auth_client
    token = _vendedor(client)

    assert client.get("/api/gastos/paginados?mes=2026-13", headers=_h(token)).status_code == 422
    assert client.get("/api/gastos/paginados?medio_pago=cheque", headers=_h(token)).status_code == 422
    assert client.get("/api/gastos/paginados?estado=raro", headers=_h(token)).status_code == 422
