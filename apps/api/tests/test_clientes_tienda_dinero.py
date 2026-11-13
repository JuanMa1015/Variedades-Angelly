"""Clientes de tienda: la deuda no se toca sin motivo, no se elimina a quien debe y los abonos exigen caja abierta."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.infrastructure.database.models import (
    AbonoTiendaModel,
    AuditoriaModel,
    CierreCajaModel,
    ClienteFiadoTiendaModel,
    ProductoModel,
)
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _vendedor(client) -> str:
    return _login_token(client, "vendedor1", "ventas123")


def _cliente(sf, deuda: float = 5000.0, nombre: str = "Don Pedro") -> int:
    with sf() as db:
        cliente = ClienteFiadoTiendaModel(nombre=nombre, telefono_whatsapp="573001112233", deuda_total=deuda)
        db.add(cliente)
        db.commit()
        return cliente.id


def _deuda(sf, cliente_id: int) -> float:
    with sf() as db:
        return float(db.get(ClienteFiadoTiendaModel, cliente_id).deuda_total)


def _auditoria(sf, accion: str) -> list[str]:
    with sf() as db:
        return list(db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.accion == accion)).scalars())


def _patch(client, token, cliente_id, **cuerpo):
    return client.patch(f"/api/clientes/tienda-fiado/{cliente_id}", headers=_h(token), json=cuerpo)


# -- Ajustar la deuda a mano --


def test_ajustar_la_deuda_exige_un_motivo(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)

    sin_motivo = _patch(client, _vendedor(client), cliente, deuda_total=0)

    assert sin_motivo.status_code == 400
    assert "motivo" in sin_motivo.json()["detail"]
    assert _deuda(sf, cliente) == 5000.0


def test_un_motivo_muy_corto_se_rechaza(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)

    respuesta = _patch(client, _vendedor(client), cliente, deuda_total=0, motivo_ajuste="x")

    assert respuesta.status_code == 422
    assert _deuda(sf, cliente) == 5000.0


def test_con_motivo_se_ajusta_y_queda_en_la_auditoria(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)

    respuesta = _patch(client, _vendedor(client), cliente, deuda_total=3000, motivo_ajuste="Pago en efectivo no registrado")

    assert respuesta.status_code == 200 and respuesta.json()["deuda_total"] == 3000.0
    detalle = _auditoria(sf, "ajustar_deuda")
    assert len(detalle) == 1
    assert "5000.0 -> 3000.0" in detalle[0] and "Pago en efectivo no registrado" in detalle[0] and "Don Pedro" in detalle[0]


def test_reenviar_la_misma_deuda_no_pide_motivo_ni_audita_un_ajuste(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)

    respuesta = _patch(client, _vendedor(client), cliente, nombre="Pedro Perez", telefono_whatsapp="573009998877", deuda_total=5000)

    assert respuesta.status_code == 200
    assert _auditoria(sf, "ajustar_deuda") == []
    editar = _auditoria(sf, "editar")
    assert len(editar) == 1 and "Pedro Perez" in editar[0] and "573009998877" in editar[0]


def test_editar_sin_cambios_no_deja_rastro_falso(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)

    _patch(client, _vendedor(client), cliente, nombre="Don Pedro", telefono_whatsapp="573001112233")

    assert _auditoria(sf, "editar") == []


# -- Eliminar --


def test_no_se_elimina_a_un_cliente_con_deuda_pendiente(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=1500.0)

    respuesta = client.delete(f"/api/clientes/tienda-fiado/{cliente}", headers=_h(_vendedor(client)))

    assert respuesta.status_code == 409
    assert "deuda pendiente" in respuesta.json()["detail"]
    with sf() as db:
        assert db.get(ClienteFiadoTiendaModel, cliente).activo is True


def test_sin_deuda_se_elimina_y_queda_registrado(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=0.0)

    respuesta = client.delete(f"/api/clientes/tienda-fiado/{cliente}", headers=_h(_vendedor(client)))

    assert respuesta.status_code == 204
    with sf() as db:
        assert db.get(ClienteFiadoTiendaModel, cliente).activo is False
    assert len(_auditoria(sf, "eliminar")) == 1


def test_un_cliente_sin_deuda_pero_con_ventas_sigue_sin_poder_eliminarse(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=0.0)
    with sf() as db:
        producto = ProductoModel(nombre="Arroz", precio_costo=500.0, precio_venta=1000.0, stock_actual=10, stock_minimo=1)
        db.add(producto)
        db.commit()
        producto_id = producto.id
    token = _vendedor(client)
    venta = client.post("/api/ventas", headers=_h(token), json={
        "items": [{"producto_id": producto_id, "cantidad": 1}], "es_fiado": True, "fiado_origen": "tienda",
        "cliente_tienda_id": cliente, "abono_inicial": 1000, "metodo_pago": "efectivo",
    })
    assert venta.status_code == 201

    respuesta = client.delete(f"/api/clientes/tienda-fiado/{cliente}", headers=_h(token))

    assert respuesta.status_code == 409 and "historial de ventas" in respuesta.json()["detail"]


# -- Crear y reactivar quedan registrados --


def test_crear_y_reactivar_quedan_en_la_auditoria(auth_client) -> None:
    client, sf = auth_client
    token = _vendedor(client)

    creado = client.post("/api/clientes/tienda-fiado", headers=_h(token), json={"nombre": "Maria Gomez", "telefono_whatsapp": "573104445566"})
    cliente = creado.json()["id"]
    client.delete(f"/api/clientes/tienda-fiado/{cliente}", headers=_h(token))
    admin = _login_token(client, "angelly_superadmin", "supersecure123")
    reactivado = client.put(f"/api/clientes/tienda-fiado/{cliente}/reactivar", headers=_h(admin))

    assert creado.status_code == 201 and reactivado.status_code == 200
    assert len(_auditoria(sf, "crear")) == 1 and "573104445566" in _auditoria(sf, "crear")[0]
    assert len(_auditoria(sf, "reactivar")) == 1


# -- Abonos --


@pytest.mark.sin_turno
def test_no_se_registra_un_abono_con_la_caja_cerrada(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)

    respuesta = client.post(f"/api/clientes/tienda/{cliente}/abonos", headers=_h(_vendedor(client)), json={"monto": 1000, "metodo_pago": "efectivo"})

    assert respuesta.status_code == 409
    assert "caja esta cerrada" in respuesta.json()["detail"] and "abonos" in respuesta.json()["detail"]
    assert _deuda(sf, cliente) == 5000.0
    with sf() as db:
        assert db.execute(select(AbonoTiendaModel)).first() is None


def test_con_la_caja_abierta_el_abono_baja_la_deuda_y_queda_auditado(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)

    respuesta = client.post(f"/api/clientes/tienda/{cliente}/abonos", headers=_h(_vendedor(client)), json={"monto": 2000, "metodo_pago": "transferencia"})

    assert respuesta.status_code == 201
    assert _deuda(sf, cliente) == 3000.0
    detalle = _auditoria(sf, "abono")
    assert len(detalle) == 1 and "2000.0 por transferencia" in detalle[0] and "5000.0 -> 3000.0" in detalle[0]
    with sf() as db:
        assert db.execute(select(AbonoTiendaModel.caja_id)).scalar_one() == db.execute(select(CierreCajaModel.id)).scalar_one()


def test_un_abono_rechazado_no_deja_auditoria(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=1000.0)

    respuesta = client.post(f"/api/clientes/tienda/{cliente}/abonos", headers=_h(_vendedor(client)), json={"monto": 5000, "metodo_pago": "efectivo"})

    assert respuesta.status_code == 400
    assert _auditoria(sf, "abono") == []
