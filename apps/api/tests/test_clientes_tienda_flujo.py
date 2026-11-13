"""Clientes de tienda: telefono unico, homonimos, lista ordenada por deuda, antiguedad, historial y abonos anulables."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from src.api.services import anulacion
from src.api.services.antiguedad_deuda import DIAS_ALERTA, DIAS_MOROSO, dias_de_deuda, estado_deuda
from src.api.services.telefono import TelefonoInvalido, normalizar_telefono
from src.infrastructure.database.models import (
    AbonoTiendaModel,
    AuditoriaModel,
    ClienteFiadoTiendaModel,
    DetalleVentaModel,
    VentaModel,
)
from src.infrastructure.repositories.ingresos import cobros_por_metodo
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


@pytest.fixture(autouse=True)
def _sin_intentos_previos():
    anulacion.reiniciar_intentos()
    yield
    anulacion.reiniciar_intentos()


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _admin(client) -> str:
    return _login_token(client, "angelly_superadmin", "supersecure123")


def _ahora() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _cliente(sf, nombre="Don Pedro", deuda=0.0, telefono="573001112233", activo=True) -> int:
    with sf() as db:
        cliente = ClienteFiadoTiendaModel(nombre=nombre, telefono_whatsapp=telefono, deuda_total=deuda, activo=activo)
        db.add(cliente)
        db.commit()
        return cliente.id


def _venta_fiada(sf, cliente_id: int, hace_dias: int, total: float, sin_pagar: float | None = None, anulada=False) -> int:
    with sf() as db:
        venta = VentaModel(
            cliente_tienda_id=cliente_id, tipo_fiado="tienda", es_fiado=True, total=total,
            saldo_pendiente=total if sin_pagar is None else sin_pagar, fecha=_ahora() - timedelta(days=hace_dias), anulada=anulada,
        )
        db.add(venta)
        db.flush()
        db.add(DetalleVentaModel(venta_id=venta.id, producto_id=1, nombre_producto="Arroz", cantidad=2, precio_unitario=total / 2, subtotal=total))
        db.commit()
        return venta.id


def _auditoria(sf, accion: str) -> list[str]:
    with sf() as db:
        return list(db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.accion == accion)).scalars())


# -- Telefono --


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("3001112233", "573001112233"),
        ("300 111 2233", "573001112233"),
        ("573001112233", "573001112233"),
        ("+57 300-111-2233", "573001112233"),
        ("2345678", "576012345678"),
        ("", None),
        (None, None),
        ("   ", None),
    ],
)
def test_normaliza_el_telefono_a_un_solo_formato(entrada, esperado) -> None:
    assert normalizar_telefono(entrada) == esperado


@pytest.mark.parametrize("entrada", ["123", "30011122", "57300111223344"])
def test_un_telefono_con_longitud_imposible_se_rechaza(entrada) -> None:
    with pytest.raises(TelefonoInvalido):
        normalizar_telefono(entrada)


def test_el_cliente_se_guarda_con_el_telefono_normalizado(auth_client) -> None:
    client, _ = auth_client

    respuesta = client.post("/api/clientes/tienda-fiado", headers=_h(_vendedor(client)), json={"nombre": "Ana Ruiz", "telefono_whatsapp": "300 111 2233"})

    assert respuesta.status_code == 201 and respuesta.json()["telefono_whatsapp"] == "573001112233"


def test_un_telefono_invalido_da_422_y_no_crea_nada(auth_client) -> None:
    client, sf = auth_client

    respuesta = client.post("/api/clientes/tienda-fiado", headers=_h(_vendedor(client)), json={"nombre": "Ana Ruiz", "telefono_whatsapp": "123"})

    assert respuesta.status_code == 422 and "WhatsApp" in respuesta.json()["detail"]
    with sf() as db:
        assert db.execute(select(ClienteFiadoTiendaModel)).first() is None


def test_editar_tambien_normaliza_el_telefono(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, telefono=None)

    respuesta = client.patch(f"/api/clientes/tienda-fiado/{cliente}", headers=_h(_vendedor(client)), json={"telefono_whatsapp": "3109998877"})

    assert respuesta.json()["telefono_whatsapp"] == "573109998877"


# -- Homonimos --


def test_un_homonimo_pide_confirmacion_y_con_ella_se_registra(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="José Pérez", telefono="573001112233")
    token = _vendedor(client)
    cuerpo = {"nombre": "jose  perez", "telefono_whatsapp": "3104445566"}

    sin_confirmar = client.post("/api/clientes/tienda-fiado", headers=_h(token), json=cuerpo)
    confirmado = client.post("/api/clientes/tienda-fiado", headers=_h(token), json={**cuerpo, "confirmar_homonimo": True})

    assert sin_confirmar.status_code == 409
    assert sin_confirmar.json()["homonimo"] is True
    assert sin_confirmar.json()["coincidencias"][0]["nombre"] == "José Pérez"
    assert confirmado.status_code == 201 and confirmado.json()["nombre"] == "jose perez"


def test_mismo_nombre_y_mismo_whatsapp_es_el_mismo_cliente_y_no_se_puede_confirmar(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="José Pérez", telefono="573001112233")

    respuesta = client.post(
        "/api/clientes/tienda-fiado", headers=_h(_vendedor(client)),
        json={"nombre": "Jose Perez", "telefono_whatsapp": "3001112233", "confirmar_homonimo": True},
    )

    assert respuesta.status_code == 409 and "homonimo" not in respuesta.json()
    assert "ese nombre y ese WhatsApp" in respuesta.json()["detail"]


def test_renombrar_a_un_nombre_existente_tambien_pide_confirmar(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="Luis Mora", telefono=None)
    otro = _cliente(sf, nombre="Pedro Gil", telefono="573001112233")
    token = _vendedor(client)

    sin = client.patch(f"/api/clientes/tienda-fiado/{otro}", headers=_h(token), json={"nombre": "luis mora"})
    con = client.patch(f"/api/clientes/tienda-fiado/{otro}", headers=_h(token), json={"nombre": "luis mora", "confirmar_homonimo": True})

    assert sin.status_code == 409 and sin.json()["homonimo"] is True
    assert con.status_code == 200


def test_editar_sin_cambiar_el_nombre_no_pide_confirmar(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="José Pérez", telefono="573001112233")
    otro = _cliente(sf, nombre="Jose Perez", telefono="573004445566")  # ya existian dos homonimos

    respuesta = client.patch(f"/api/clientes/tienda-fiado/{otro}", headers=_h(_vendedor(client)), json={"telefono_whatsapp": "3007778899"})

    assert respuesta.status_code == 200


def test_un_cliente_eliminado_no_cuenta_como_homonimo(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="Ana Ruiz", activo=False)

    respuesta = client.post("/api/clientes/tienda-fiado", headers=_h(_vendedor(client)), json={"nombre": "Ana Ruiz"})

    assert respuesta.status_code == 201


# -- Antiguedad de la deuda --


@pytest.mark.parametrize(
    ("deuda", "dias", "esperado"),
    [
        (0, 500, "sin_deuda"),
        (1000, None, "al_dia"),
        (1000, 0, "al_dia"),
        (1000, DIAS_ALERTA, "al_dia"),
        (1000, DIAS_ALERTA + 1, "alerta"),
        (1000, DIAS_MOROSO, "alerta"),
        (1000, DIAS_MOROSO + 1, "moroso"),
    ],
)
def test_semaforo_por_dias_de_deuda(deuda, dias, esperado) -> None:
    assert estado_deuda(deuda, dias) == esperado


def test_la_deuda_se_mide_desde_la_venta_mas_vieja_que_aun_no_se_pago(auth_client) -> None:
    _, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    _venta_fiada(sf, cliente, hace_dias=100, total=3000.0)
    _venta_fiada(sf, cliente, hace_dias=10, total=2000.0)

    with sf() as db:
        c = db.get(ClienteFiadoTiendaModel, cliente)
        assert dias_de_deuda(db, [c])[cliente] == 100  # debe las dos: la mas vieja manda
        c.deuda_total = 1500.0  # pago lo viejo: lo que queda cabe en la venta reciente
        assert dias_de_deuda(db, [c])[cliente] == 10


def test_las_ventas_anuladas_y_pagadas_no_cuentan_para_la_antiguedad(auth_client) -> None:
    _, sf = auth_client
    cliente = _cliente(sf, deuda=1000.0)
    _venta_fiada(sf, cliente, hace_dias=200, total=9000.0, anulada=True)
    _venta_fiada(sf, cliente, hace_dias=90, total=500.0, sin_pagar=0.0)
    _venta_fiada(sf, cliente, hace_dias=5, total=1000.0)

    with sf() as db:
        assert dias_de_deuda(db, [db.get(ClienteFiadoTiendaModel, cliente)])[cliente] == 5


def test_una_deuda_sin_ventas_no_tiene_fecha_y_no_se_marca_morosa(auth_client) -> None:
    _, sf = auth_client
    cliente = _cliente(sf, deuda=800000.0)

    with sf() as db:
        dias = dias_de_deuda(db, [db.get(ClienteFiadoTiendaModel, cliente)])
    assert dias == {cliente: None}
    assert estado_deuda(800000.0, dias[cliente]) == "al_dia"


def test_sin_clientes_con_deuda_no_se_consulta_nada(auth_client) -> None:
    _, sf = auth_client
    cliente = _cliente(sf, deuda=0.0)

    with sf() as db:
        assert dias_de_deuda(db, [db.get(ClienteFiadoTiendaModel, cliente)]) == {}


# -- Lista --


def _lista(client, token, **params):
    r = client.get("/api/clientes/tienda/lista", headers=_h(token), params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _sembrar_lista(sf) -> dict[str, int]:
    ids = {
        "moroso": _cliente(sf, "Luz Dary Manco", 452800.0, "573001110008"),
        "alerta": _cliente(sf, "Flor Manco", 20000.0, None),
        "al_dia": _cliente(sf, "Berta Villa", 6500.0, "573001110001"),
        "sin": _cliente(sf, "Aura Gomez", 0.0, None),
    }
    _venta_fiada(sf, ids["moroso"], 90, 452800.0)
    _venta_fiada(sf, ids["alerta"], 45, 20000.0)
    _venta_fiada(sf, ids["al_dia"], 3, 6500.0)
    return ids


def test_la_lista_ordena_por_quien_mas_debe(auth_client) -> None:
    client, sf = auth_client
    _sembrar_lista(sf)

    lista = _lista(client, _vendedor(client))

    assert [c["nombre"] for c in lista["data"]] == ["Luz Dary Manco", "Flor Manco", "Berta Villa", "Aura Gomez"]
    assert [c["estado_deuda"] for c in lista["data"]] == ["moroso", "alerta", "al_dia", "sin_deuda"]
    assert lista["data"][0]["dias_deuda"] == 90 and lista["total"] == 4


def test_filtros_de_la_lista(auth_client) -> None:
    client, sf = auth_client
    _sembrar_lista(sf)
    token = _vendedor(client)

    assert [c["nombre"] for c in _lista(client, token, filtro="con_deuda")["data"]] == ["Luz Dary Manco", "Flor Manco", "Berta Villa"]
    assert [c["nombre"] for c in _lista(client, token, filtro="moroso")["data"]] == ["Luz Dary Manco"]
    assert [c["nombre"] for c in _lista(client, token, filtro="alerta")["data"]] == ["Flor Manco"]


def test_ordenes_alternativos_y_busqueda(auth_client) -> None:
    client, sf = auth_client
    _sembrar_lista(sf)
    token = _vendedor(client)

    assert [c["nombre"] for c in _lista(client, token, orden="nombre")["data"]][0] == "Aura Gomez"
    assert [c["nombre"] for c in _lista(client, token, orden="antiguedad")["data"]][:3] == ["Luz Dary Manco", "Flor Manco", "Berta Villa"]
    assert [c["nombre"] for c in _lista(client, token, q="manco")["data"]] == ["Luz Dary Manco", "Flor Manco"]
    assert [c["nombre"] for c in _lista(client, token, q="573001110001")["data"]] == ["Berta Villa"]


def test_paginacion_de_la_lista(auth_client) -> None:
    client, sf = auth_client
    _sembrar_lista(sf)

    pagina2 = _lista(client, _vendedor(client), limit=3, page=2)

    assert pagina2["total"] == 4 and pagina2["total_pages"] == 2 and [c["nombre"] for c in pagina2["data"]] == ["Aura Gomez"]


def test_la_lista_indica_si_el_cliente_tiene_ventas(auth_client) -> None:
    client, sf = auth_client
    ids = _sembrar_lista(sf)

    por_id = {c["id"]: c for c in _lista(client, _vendedor(client))["data"]}

    assert por_id[ids["moroso"]]["tiene_ventas"] is True and por_id[ids["sin"]]["tiene_ventas"] is False


def test_solo_un_admin_ve_y_reactiva_los_clientes_eliminados(auth_client) -> None:
    client, sf = auth_client
    eliminado = _cliente(sf, "Cliente Viejo", activo=False)
    _cliente(sf, "Cliente Activo")

    assert client.get("/api/clientes/tienda/lista", headers=_h(_vendedor(client)), params={"inactivos": True}).status_code == 403
    admin = _admin(client)
    lista = _lista(client, admin, inactivos=True)
    assert [c["nombre"] for c in lista["data"]] == ["Cliente Viejo"] and lista["data"][0]["activo"] is False
    assert client.put(f"/api/clientes/tienda-fiado/{eliminado}/reactivar", headers=_h(admin)).status_code == 200
    assert [c["nombre"] for c in _lista(client, admin)["data"]] == ["Cliente Activo", "Cliente Viejo"]


def test_la_lista_no_incluye_eliminados_por_defecto(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, "Cliente Viejo", activo=False)

    assert _lista(client, _vendedor(client))["total"] == 0


def test_el_resumen_cuenta_por_antiguedad(auth_client) -> None:
    client, sf = auth_client
    _sembrar_lista(sf)

    resumen = client.get("/api/clientes/tienda/resumen", headers=_h(_vendedor(client))).json()

    assert resumen["clientes_totales"] == 4 and resumen["clientes_con_deuda"] == 3
    assert resumen["clientes_alto_riesgo"] == 1 and resumen["clientes_riesgo_medio"] == 1
    assert resumen["deuda_morosa"] == 452800.0
    assert resumen["deuda_total"] == 479300.0


# -- Historial --


def test_el_historial_trae_cada_venta_con_sus_productos_y_cada_abono(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=3000.0)
    venta = _venta_fiada(sf, cliente, hace_dias=2, total=5000.0, sin_pagar=4000.0)
    with sf() as db:
        db.add(AbonoTiendaModel(cliente_id=cliente, monto=1000.0, metodo_pago="transferencia", saldo_cliente=3000.0, referencia="Nequi 123", fecha=_ahora()))
        db.commit()

    movimientos = client.get(f"/api/clientes/tienda/{cliente}/movimientos", headers=_h(_vendedor(client))).json()["data"]

    assert [m["tipo"] for m in movimientos] == ["Abono", "Venta"]
    abono, venta_mov = movimientos
    assert abono["monto"] == 1000.0 and abono["metodo_pago"] == "transferencia" and abono["saldo"] == 3000.0 and abono["referencia"] == "Nequi 123"
    assert venta_mov["id"] == venta and venta_mov["monto"] == 5000.0 and venta_mov["por_pagar"] == 4000.0
    assert venta_mov["items"] == [{"articulo": "Arroz", "cantidad": 2, "precio_unitario": 2500.0, "subtotal": 5000.0}]


def test_el_historial_marca_las_ventas_anuladas_y_pagina(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=0.0)
    for dias in range(1, 6):
        _venta_fiada(sf, cliente, hace_dias=dias, total=100.0, anulada=(dias == 1))
    token = _vendedor(client)

    pagina1 = client.get(f"/api/clientes/tienda/{cliente}/movimientos", headers=_h(token), params={"limit": 2}).json()

    assert pagina1["total_pages"] == 3 and len(pagina1["data"]) == 2 and pagina1["data"][0]["anulado"] is True
    assert client.get("/api/clientes/tienda/999/movimientos", headers=_h(token)).status_code == 404


# -- Abonos: respuesta y anulacion --


def _abonar(client, token, cliente, monto=2000, metodo="efectivo"):
    r = client.post(f"/api/clientes/tienda/{cliente}/abonos", headers=_h(token), json={"monto": monto, "metodo_pago": metodo})
    assert r.status_code == 201, r.text
    return r.json()


def test_el_abono_responde_con_los_datos_del_comprobante(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, nombre="Don Pedro", deuda=5000.0)

    abono = _abonar(client, _vendedor(client), cliente, monto=2000)

    assert abono["cliente_nombre"] == "Don Pedro" and abono["deuda_anterior"] == 5000.0 and abono["saldo_cliente"] == 3000.0
    assert abono["anulado"] is False


def _deuda(sf, cliente: int) -> float:
    with sf() as db:
        return float(db.get(ClienteFiadoTiendaModel, cliente).deuda_total)


def test_el_admin_anula_un_abono_y_la_deuda_vuelve(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    abono = _abonar(client, _admin(client), cliente, monto=2000)

    r = client.post(f"/api/clientes/tienda/abonos/{abono['id']}/anular", headers=_h(_admin(client)), json={"motivo": "Monto mal digitado"})

    assert r.status_code == 200 and r.json()["anulado"] is True
    assert _deuda(sf, cliente) == 5000.0
    detalle = _auditoria(sf, "anular_abono")
    assert len(detalle) == 1 and "3000.0 -> 5000.0" in detalle[0] and "Monto mal digitado" in detalle[0]


def test_el_abono_anulado_sale_de_la_caja_y_queda_marcado_en_el_historial(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    admin = _admin(client)
    abono = _abonar(client, admin, cliente, monto=2000)
    _abonar(client, admin, cliente, monto=500)
    client.post(f"/api/clientes/tienda/abonos/{abono['id']}/anular", headers=_h(admin), json={"motivo": "Monto mal digitado"})

    with sf() as db:
        assert cobros_por_metodo(db) == {"efectivo": 500.0}
    historial = client.get(f"/api/clientes/tienda/{cliente}/movimientos", headers=_h(admin)).json()["data"]
    anulado = next(m for m in historial if m["id"] == abono["id"])
    assert anulado["anulado"] is True and anulado["motivo_anulacion"] == "Monto mal digitado"


def test_el_vendedor_anula_un_abono_solo_con_la_clave_de_un_admin(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    vendedor = _vendedor(client)
    abono = _abonar(client, vendedor, cliente)
    url = f"/api/clientes/tienda/abonos/{abono['id']}/anular"

    sin = client.post(url, headers=_h(vendedor), json={"motivo": "Error al digitar"})
    mala = client.post(url, headers=_h(vendedor), json={"motivo": "Error al digitar", "autorizador_usuario": "angelly_admin", "autorizador_password": "mal"})
    ok = client.post(url, headers=_h(vendedor), json={"motivo": "Error al digitar", "autorizador_usuario": "angelly_admin", "autorizador_password": "cambiame123"})

    assert (sin.status_code, mala.status_code, ok.status_code) == (403, 403, 200)
    assert _deuda(sf, cliente) == 5000.0


def test_no_se_anula_dos_veces_ni_un_abono_de_un_turno_cerrado(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    admin = _admin(client)
    primero, segundo = _abonar(client, admin, cliente, monto=1000), _abonar(client, admin, cliente, monto=1000)
    anular = lambda i: client.post(f"/api/clientes/tienda/abonos/{i}/anular", headers=_h(admin), json={"motivo": "Error al digitar"})

    assert anular(primero["id"]).status_code == 200
    assert anular(primero["id"]).status_code == 409
    client.post("/api/caja/cierre", headers=_h(admin), json={"monto_cierre": 0})
    cerrado = anular(segundo["id"])
    assert cerrado.status_code == 409 and "turno" in cerrado.json()["detail"]
    assert client.post("/api/clientes/tienda/abonos/9999/anular", headers=_h(admin), json={"motivo": "Error al digitar"}).status_code == 404


def test_anular_un_abono_exige_motivo_y_sesion(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    admin = _admin(client)
    abono = _abonar(client, admin, cliente)

    assert client.post(f"/api/clientes/tienda/abonos/{abono['id']}/anular", headers=_h(admin), json={"motivo": " "}).status_code == 422
    client.cookies.clear()
    assert client.post(f"/api/clientes/tienda/abonos/{abono['id']}/anular", json={"motivo": "Error al digitar"}).status_code == 401


def test_el_abono_anulado_guarda_quien_lo_anulo_y_quien_lo_autorizo(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=1000.0)
    abono = _abonar(client, _admin(client), cliente, monto=1000)

    client.post(f"/api/clientes/tienda/abonos/{abono['id']}/anular", headers=_h(_admin(client)), json={"motivo": "Error al digitar"})

    with sf() as db:
        fila = db.get(AbonoTiendaModel, abono["id"])
        assert fila.anulado is True and fila.anulado_por == "angelly_superadmin" and fila.autorizado_por == "angelly_superadmin"
        assert fila.anulado_en is not None and fila.motivo_anulacion == "Error al digitar"
