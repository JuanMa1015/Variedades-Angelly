"""Cobrar cartera: abonos auditados, anulables con motivo, sin fecha futura, riesgo por antiguedad y estado de cuenta."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from src.infrastructure.database.models import AbonoCarteraModel, AuditoriaModel, ClienteModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)
from tests.test_cartera_ventas_reglas import _producto, _vender
from tests.test_clientes_cartera_reglas import _admin, _cliente, _venta_fiada


def _abonar(client, cliente, monto=1000, **extra):
    return client.post(f"/api/cartera/clientes/{cliente}/abonos", headers=_admin(client), json={"monto": monto, "metodo_pago": "efectivo", **extra})


def _deuda(sf, cliente) -> float:
    with sf() as db:
        return float(db.get(ClienteModel, cliente).deuda_total)


def _auditoria(sf, accion) -> list[str]:
    with sf() as db:
        return list(
            db.execute(
                select(AuditoriaModel.detalle).where(
                    AuditoriaModel.modulo == "cartera", AuditoriaModel.entidad == "abono", AuditoriaModel.accion == accion,
                ),
            ).scalars(),
        )


def _anular(client, abono_id, motivo="Se anoto al cliente equivocado"):
    params = {"motivo": motivo} if motivo is not None else {}
    return client.delete(f"/api/cartera/abonos/{abono_id}", headers=_admin(client), params=params)


# -- Registrar --


def test_registrar_un_abono_deja_rastro_con_la_deuda_antes_y_despues(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, nombre="Maria Perez", deuda=5000.0)

    respuesta = _abonar(client, cliente, 2000)

    assert respuesta.status_code == 201, respuesta.text
    assert _deuda(sf, cliente) == 3000
    detalle = _auditoria(sf, "crear")
    assert len(detalle) == 1 and "Maria Perez" in detalle[0] and "5000.0 -> 3000.0" in detalle[0]


def test_la_fecha_del_abono_puede_ser_pasada_pero_no_futura(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    pasada = (datetime.now(UTC) - timedelta(days=10)).isoformat()
    futura = (datetime.now(UTC) + timedelta(days=3)).isoformat()

    assert _abonar(client, cliente, 1000, fecha=pasada).status_code == 201
    respuesta = _abonar(client, cliente, 1000, fecha=futura)

    assert respuesta.status_code == 400 and "futura" in respuesta.json()["detail"]
    assert _deuda(sf, cliente) == 4000


def test_no_se_abona_mas_de_lo_que_se_debe(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=500.0)

    assert _abonar(client, cliente, 600).status_code == 400
    assert _deuda(sf, cliente) == 500


# -- Anular --


def test_anular_un_abono_devuelve_la_deuda_no_lo_borra_y_deja_rastro(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    abono_id = _abonar(client, cliente, 2000).json()["id"]

    respuesta = _anular(client, abono_id)

    assert respuesta.status_code == 204
    assert _deuda(sf, cliente) == 5000
    with sf() as db:
        abono = db.get(AbonoCarteraModel, abono_id)
        assert abono is not None and abono.anulado and abono.anulado_por == "angelly_admin"
        assert abono.motivo_anulacion == "Se anoto al cliente equivocado" and abono.anulado_en is not None
    assert len(_auditoria(sf, "anular")) == 1
    assert client.get("/api/cartera/abonos", headers=_admin(client)).json() == []


def test_anular_exige_motivo_y_no_se_anula_dos_veces(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    abono_id = _abonar(client, cliente, 2000).json()["id"]

    assert _anular(client, abono_id, motivo=None).status_code == 400
    assert _anular(client, abono_id, motivo="ab").status_code == 400
    assert _deuda(sf, cliente) == 3000
    assert _anular(client, abono_id).status_code == 204
    assert _anular(client, abono_id).status_code == 409
    assert _anular(client, 99999).status_code == 404
    assert _deuda(sf, cliente) == 5000


def test_el_abono_inicial_de_una_venta_se_corrige_anulando_la_venta(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf), _producto(sf)
    _vender(client, cliente, producto, cantidad=5, abono=1000)
    with sf() as db:
        abono_id = db.execute(select(AbonoCarteraModel.id)).scalar_one()

    respuesta = _anular(client, abono_id)

    assert respuesta.status_code == 409 and "anulando esa venta" in respuesta.json()["detail"]
    assert _deuda(sf, cliente) == 4000


def test_un_abono_anulado_no_cuenta_en_el_detalle_del_cliente(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    abono_id = _abonar(client, cliente, 2000).json()["id"]
    _anular(client, abono_id)

    movimientos = client.get(f"/api/cartera/clientes/{cliente}/movimientos", headers=_admin(client)).json()["data"]

    assert [m for m in movimientos if m["tipo"] == "Abono"] == []


# -- Editar --


def _editar(client, abono_id, **cuerpo):
    return client.patch(f"/api/cartera/abonos/{abono_id}", headers=_admin(client), json=cuerpo)


def test_cambiar_el_monto_de_un_abono_exige_motivo_y_ajusta_la_deuda(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    abono_id = _abonar(client, cliente, 2000).json()["id"]  # debe 3.000

    sin_motivo = _editar(client, abono_id, monto=1500)
    con_motivo = _editar(client, abono_id, monto=1500, motivo="Se digito mal")

    assert sin_motivo.status_code == 400 and "motivo" in sin_motivo.json()["detail"]
    assert con_motivo.status_code == 200, con_motivo.text
    assert _deuda(sf, cliente) == 3500
    detalle = _auditoria(sf, "editar")
    assert len(detalle) == 1 and "2000.0 -> 1500.0" in detalle[0] and "Se digito mal" in detalle[0]


def test_cambiar_solo_el_metodo_no_pide_motivo_y_sin_cambios_no_deja_rastro(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)
    abono_id = _abonar(client, cliente, 2000).json()["id"]

    assert _editar(client, abono_id, metodo_pago="transferencia").status_code == 200
    assert _editar(client, abono_id, monto=2000, metodo_pago="transferencia").status_code == 200

    assert len(_auditoria(sf, "editar")) == 1
    assert _deuda(sf, cliente) == 3000


def test_no_se_edita_un_abono_anulado_ni_el_inicial_de_una_venta(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, deuda=5000.0), _producto(sf)
    anulado = _abonar(client, cliente, 1000).json()["id"]
    _anular(client, anulado)
    _vender(client, cliente, producto, cantidad=2, abono=500)
    with sf() as db:
        inicial = db.execute(select(AbonoCarteraModel.id).where(AbonoCarteraModel.venta_id.is_not(None))).scalar_one()

    assert _editar(client, anulado, monto=10, motivo="Prueba").status_code == 409
    assert _editar(client, inicial, monto=10, motivo="Prueba").status_code == 409


# -- Riesgo y estado de cuenta --


def test_el_resumen_de_riesgo_mira_cuanto_lleva_la_deuda_y_no_solo_el_monto(auth_client) -> None:
    client, sf = auth_client
    grande_reciente = _cliente(sf, nombre="Grande Reciente", documento="10001", deuda=900000.0)
    _venta_fiada(sf, grande_reciente, 900000.0, dias=2)
    pequena_vieja = _cliente(sf, nombre="Pequena Vieja", documento="20002", deuda=5000.0)
    _venta_fiada(sf, pequena_vieja, 5000.0, dias=90)
    en_alerta = _cliente(sf, nombre="En Alerta", documento="30003", deuda=8000.0)
    _venta_fiada(sf, en_alerta, 8000.0, dias=40)

    resumen = client.get("/api/cartera/resumen", headers=_admin(client)).json()

    assert resumen["clientes_alto_riesgo"] == 1 and resumen["clientes_riesgo_medio"] == 1
    assert resumen["clientes_con_deuda"] == 3


def test_el_estado_de_cuenta_trae_cifras_reales_para_el_mensaje_de_cobro(auth_client) -> None:
    client, sf = auth_client
    cliente, producto = _cliente(sf, nombre="Maria Perez"), _producto(sf, precio=2000.0)
    _vender(client, cliente, producto, cantidad=3, abono=1000)  # contado parcial: debe 5.000
    _abonar(client, cliente, 1500)  # debe 3.500
    contado = _vender(client, cliente, producto, cantidad=1, abono=2000)  # de contado: no es fiado
    assert contado.status_code == 201

    estado = client.get(f"/api/cartera/clientes/{cliente}/estado-cuenta", headers=_admin(client)).json()

    assert estado["deuda_total"] == 3500 and estado["estado_deuda"] == "al_dia" and estado["dias_deuda"] == 0
    assert len(estado["ultimas_compras"]) == 1  # la de contado no se cobra
    assert estado["ultimas_compras"][0]["articulos"] == "Arroz x3" and estado["ultimas_compras"][0]["total"] == 6000
    assert estado["ultimo_abono"]["monto"] == 1500  # el abono inicial de la venta no cuenta como abono


def test_el_estado_de_cuenta_y_los_abonos_son_solo_de_cartera(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=1000.0)
    vendedor = {"Authorization": f"Bearer {_login_token(client, 'vendedor1', 'ventas123')}"}

    assert client.get(f"/api/cartera/clientes/{cliente}/estado-cuenta", headers=vendedor).status_code == 403
    assert client.delete("/api/cartera/abonos/1", headers=vendedor, params={"motivo": "Intento"}).status_code == 403
    assert client.get("/api/cartera/clientes/99999/estado-cuenta", headers=_admin(client)).status_code == 404
