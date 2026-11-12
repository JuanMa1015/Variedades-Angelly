"""Clientes de cartera: datos unicos y limpios, auditoria, desactivar sin deuda y semaforo por antiguedad."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from src.infrastructure.database.models import AuditoriaModel, ClienteModel, ProductoModel, VentaModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _admin(client) -> dict[str, str]:
    return {"Authorization": f"Bearer {_login_token(client, 'angelly_admin', 'cambiame123')}"}


def _crear(client, **cuerpo):
    cuerpo.setdefault("nombre", "Maria Perez")
    return client.post("/api/cartera/clientes", headers=_admin(client), json=cuerpo)


def _cliente(sf, nombre="Pedro Cartera", documento="100200300", telefono=None, deuda=0.0, activo=True) -> int:
    with sf() as db:
        cliente = ClienteModel(
            nombre=nombre,
            documento=documento,
            telefono_whatsapp=telefono,
            limite_credito=0,
            deuda_total=deuda,
            activo=activo,
        )
        db.add(cliente)
        db.commit()
        return cliente.id


def _auditoria(sf, accion: str) -> list[str]:
    with sf() as db:
        return list(
            db.execute(
                select(AuditoriaModel.detalle).where(AuditoriaModel.modulo == "clientes_cartera", AuditoriaModel.accion == accion),
            ).scalars(),
        )


def _patch(client, cliente_id, **cuerpo):
    return client.patch(f"/api/cartera/clientes/{cliente_id}", headers=_admin(client), json=cuerpo)


# -- Crear --


def test_crear_guarda_nombre_y_whatsapp_limpios_y_audita(auth_client) -> None:
    client, sf = auth_client

    respuesta = _crear(client, nombre="  Maria   Perez ", documento=" 123456789 ", telefono_whatsapp="300 111 2233")

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["nombre"] == "Maria Perez"
    assert cuerpo["documento"] == "123456789"
    assert cuerpo["telefono_whatsapp"] == "573001112233"
    detalle = _auditoria(sf, "crear")
    assert len(detalle) == 1 and "Maria Perez" in detalle[0]


def test_un_whatsapp_con_longitud_imposible_se_rechaza(auth_client) -> None:
    client, _ = auth_client

    respuesta = _crear(client, telefono_whatsapp="12345")

    assert respuesta.status_code == 422


def test_el_mismo_whatsapp_no_puede_estar_dos_veces_aunque_se_escriba_distinto(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="Ana Vieja", documento="55555", telefono="3001112233")  # guardado sin el 57

    respuesta = _crear(client, nombre="Otra Persona", telefono_whatsapp="+57 300 111 2233")

    assert respuesta.status_code == 409
    assert "Ana Vieja" in respuesta.json()["detail"]


def test_el_nombre_no_se_repite_aunque_cambien_mayusculas_tildes_o_espacios(auth_client) -> None:
    client, _ = auth_client
    assert _crear(client, nombre="José Núñez").status_code == 201

    respuesta = _crear(client, nombre="  jose   nunez ")

    assert respuesta.status_code == 409
    assert "José Núñez" in respuesta.json()["detail"]


def test_un_cliente_desactivado_sigue_ocupando_su_nombre_y_lo_explica(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="Luis Antiguo", documento="777777", activo=False)

    respuesta = _crear(client, nombre="Luis Antiguo")

    assert respuesta.status_code == 409
    assert "desactivado" in respuesta.json()["detail"]


def test_el_documento_repetido_dice_a_quien_pertenece(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="Dueño Documento", documento="99887766")

    respuesta = _crear(client, nombre="Alguien Mas", documento="99887766")

    assert respuesta.status_code == 409
    assert "Dueño Documento" in respuesta.json()["detail"]


def test_sin_documento_es_vacio_de_verdad_y_varios_clientes_pueden_no_tenerlo(auth_client) -> None:
    client, _ = auth_client

    primero = _crear(client, nombre="Sin Documento Uno", documento="      ")
    segundo = _crear(client, nombre="Sin Documento Dos", documento="      ")

    assert primero.status_code == 201 and segundo.status_code == 201
    assert primero.json()["documento"] is None and segundo.json()["documento"] is None


def test_un_documento_muy_corto_se_rechaza(auth_client) -> None:
    client, _ = auth_client

    assert _crear(client, documento="123").status_code == 422


# -- Editar --


def test_editar_deja_rastro_con_lo_que_cambio(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, nombre="Pedro Cartera", documento="100200300")

    respuesta = _patch(client, cliente, nombre="Pedro Gomez", telefono_whatsapp="3105556677")

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["telefono_whatsapp"] == "573105556677"
    detalle = _auditoria(sf, "editar")
    assert len(detalle) == 1
    assert "Pedro Cartera" in detalle[0] and "Pedro Gomez" in detalle[0] and "573105556677" in detalle[0]


def test_guardar_sin_cambios_no_deja_rastro_falso(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, nombre="Pedro Cartera", documento="100200300", telefono="573001112233")

    respuesta = _patch(client, cliente, nombre="Pedro  Cartera", documento="100200300", telefono_whatsapp="300 111 2233")

    assert respuesta.status_code == 200
    assert _auditoria(sf, "editar") == []


def test_se_puede_borrar_el_documento_y_el_whatsapp(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, documento="100200300", telefono="573001112233")

    respuesta = _patch(client, cliente, documento=None, telefono_whatsapp="")

    assert respuesta.status_code == 200
    assert respuesta.json()["documento"] is None
    assert respuesta.json()["telefono_whatsapp"] is None


def test_el_nombre_no_se_puede_dejar_vacio(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)

    assert _patch(client, cliente, nombre="   ").status_code in (400, 422)
    assert _patch(client, cliente, nombre=None).status_code == 400


def test_editar_no_puede_chocar_con_otro_cliente(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="Primero", documento="11111", telefono="573001112233")
    segundo = _cliente(sf, nombre="Segundo", documento="22222")

    assert _patch(client, segundo, nombre="primero").status_code == 409
    assert _patch(client, segundo, documento="11111").status_code == 409
    assert _patch(client, segundo, telefono_whatsapp="300 111 2233").status_code == 409


def test_editar_sin_enviar_campos_es_un_error(auth_client) -> None:
    client, sf = auth_client

    assert _patch(client, _cliente(sf)).status_code == 400


# -- Desactivar y reactivar --


def test_no_se_desactiva_a_quien_debe(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=5000.0)

    respuesta = client.delete(f"/api/cartera/clientes/{cliente}", headers=_admin(client))

    assert respuesta.status_code == 409
    assert "deuda" in respuesta.json()["detail"]
    with sf() as db:
        assert db.get(ClienteModel, cliente).activo is True


def test_desactivar_a_quien_no_debe_conserva_su_historial_y_deja_rastro(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, deuda=0.0)
    with sf() as db:
        db.add(VentaModel(cliente_id=cliente, total=1000, saldo_pendiente=0, es_fiado=False))
        db.commit()

    respuesta = client.delete(f"/api/cartera/clientes/{cliente}", headers=_admin(client))

    assert respuesta.status_code == 204
    with sf() as db:
        assert db.get(ClienteModel, cliente).activo is False
        assert len(db.execute(select(VentaModel).where(VentaModel.cliente_id == cliente)).scalars().all()) == 1
    assert len(_auditoria(sf, "desactivar")) == 1


def test_reactivar_deja_rastro_una_sola_vez(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, activo=False)

    assert client.put(f"/api/clientes/{cliente}/reactivar", headers=_admin(client)).status_code == 200
    assert client.put(f"/api/clientes/{cliente}/reactivar", headers=_admin(client)).status_code == 200

    with sf() as db:
        assert db.get(ClienteModel, cliente).activo is True
    assert len(_auditoria(sf, "reactivar")) == 1


def test_la_lista_oculta_desactivados_salvo_que_se_pidan(auth_client) -> None:
    client, sf = auth_client
    _cliente(sf, nombre="Activo Uno", documento="10001")
    _cliente(sf, nombre="Inactivo Dos", documento="20002", activo=False)

    activos = client.get("/api/clientes", headers=_admin(client)).json()
    todos = client.get("/api/clientes?include_inactivos=true", headers=_admin(client)).json()

    assert [c["nombre"] for c in activos] == ["Activo Uno"]
    assert {c["nombre"]: c["activo"] for c in todos} == {"Activo Uno": True, "Inactivo Dos": False}


# -- Semaforo por antiguedad --


def _venta_fiada(sf, cliente_id: int, total: float, dias: int) -> None:
    with sf() as db:
        db.add(
            VentaModel(
                cliente_id=cliente_id,
                tipo_fiado="cartera",
                es_fiado=True,
                total=total,
                saldo_pendiente=total,
                fecha=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=dias),
            ),
        )
        db.commit()


def test_el_semaforo_mira_cuanto_lleva_la_deuda_y_no_solo_el_monto(auth_client) -> None:
    client, sf = auth_client
    reciente_grande = _cliente(sf, nombre="Reciente Grande", documento="10001", deuda=900000.0)
    _venta_fiada(sf, reciente_grande, 900000.0, dias=2)
    vieja_pequena = _cliente(sf, nombre="Vieja Pequena", documento="20002", deuda=5000.0)
    _venta_fiada(sf, vieja_pequena, 5000.0, dias=75)
    en_alerta = _cliente(sf, nombre="En Alerta", documento="30003", deuda=20000.0)
    _venta_fiada(sf, en_alerta, 20000.0, dias=40)
    _cliente(sf, nombre="Sin Deuda", documento="40004")

    lista = {c["nombre"]: c for c in client.get("/api/clientes", headers=_admin(client)).json()}

    assert lista["Reciente Grande"]["estado_deuda"] == "al_dia"
    assert lista["Vieja Pequena"]["estado_deuda"] == "moroso"
    assert lista["Vieja Pequena"]["dias_deuda"] == 75
    assert lista["En Alerta"]["estado_deuda"] == "alerta"
    assert lista["Sin Deuda"]["estado_deuda"] == "sin_deuda"
    assert lista["Sin Deuda"]["dias_deuda"] is None


def test_un_abono_se_aplica_a_lo_mas_viejo_y_rejuvenece_la_deuda(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf, nombre="Pago Parcial", documento="50005", deuda=30000.0)  # debia 50.000 y abono 20.000
    _venta_fiada(sf, cliente, 20000.0, dias=80)
    _venta_fiada(sf, cliente, 30000.0, dias=3)

    lista = {c["nombre"]: c for c in client.get("/api/clientes", headers=_admin(client)).json()}

    assert lista["Pago Parcial"]["dias_deuda"] == 3
    assert lista["Pago Parcial"]["estado_deuda"] == "al_dia"


# -- Cupo y deuda --


def _producto(sf) -> int:
    with sf() as db:
        producto = ProductoModel(nombre="Arroz", precio_costo=500, precio_venta=1000, stock_actual=50, stock_minimo=1, catalogo="cartera")
        db.add(producto)
        db.commit()
        return producto.id


def test_un_cliente_nuevo_sin_cupo_definido_puede_comprar_a_credito_en_el_pos(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)  # limite_credito 0: ninguna pantalla lo fija
    producto = _producto(sf)

    respuesta = client.post(
        "/api/ventas",
        headers=_admin(client),
        json={
            "cliente_id": cliente,
            "items": [{"producto_id": producto, "cantidad": 3}],
            "es_fiado": True,
            "fiado_origen": "cartera",
            "abono_inicial": 0,
            "metodo_pago": "efectivo",
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    with sf() as db:
        assert float(db.get(ClienteModel, cliente).deuda_total) == 3000.0


def test_la_deuda_queda_igual_a_ventas_menos_abonos_y_vuelve_si_se_borra_un_abono(auth_client) -> None:
    client, sf = auth_client
    cliente = _cliente(sf)
    producto = _producto(sf)
    admin = _admin(client)

    def vender(cantidad, abono):
        return client.post(
            "/api/cartera/ventas",
            headers=admin,
            json={"cliente_id": cliente, "items": [{"producto_id": producto, "cantidad": cantidad}], "abono_inicial": abono, "metodo_pago": "efectivo"},
        )

    primera = vender(5, 1000)  # debe 4.000
    segunda = vender(3, 0)  # debe 7.000
    assert primera.status_code == 201 and segunda.status_code == 201, (primera.text, segunda.text)
    abono = client.post(f"/api/cartera/clientes/{cliente}/abonos", headers=admin, json={"monto": 2500, "metodo_pago": "efectivo"})
    assert abono.status_code == 201, abono.text  # debe 4.500

    def deuda() -> float:
        with sf() as db:
            return float(db.get(ClienteModel, cliente).deuda_total)

    assert deuda() == 4500.0
    borrado = client.delete(f"/api/cartera/abonos/{abono.json()['id']}", headers=admin)
    assert borrado.status_code == 204, borrado.text
    assert deuda() == 7000.0  # 4.000 + 3.000: al borrar el abono la deuda vuelve
