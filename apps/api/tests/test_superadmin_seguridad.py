"""Superadmin: auditoria que nadie edita ni borra, y usuarios que se desactivan (no se borran) y cierran sus sesiones."""

from __future__ import annotations

import time

import pytest
from sqlalchemy import select

from src.api.services.auditoria import registrar_auditoria
from src.infrastructure.database.models import AuditoriaInmutable, AuditoriaModel, UsuarioModel
from tests.test_auth_api import _login_token, auth_client  # noqa: F401  (fixture)


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _super(client) -> dict[str, str]:
    return _h(_login_token(client, "angelly_superadmin", "supersecure123"))


def _admin(client) -> dict[str, str]:
    return _h(_login_token(client, "angelly_admin", "cambiame123"))


def _vendedor(client) -> dict[str, str]:
    return _h(_login_token(client, "vendedor1", "ventas123"))


def _sembrar(sf) -> None:
    with sf() as db:
        registrar_auditoria(db, usuario="vendedor1", modulo="gastos", entidad="gasto", accion="crear", entidad_id=1, detalle="pago de luz")
        registrar_auditoria(db, usuario="angelly_admin", modulo="cartera", entidad="venta", accion="anular", entidad_id=2, detalle="Maria Perez: error al digitar")
        registrar_auditoria(db, usuario="angelly_admin", modulo="clientes_cartera", entidad="cliente_cartera", accion="crear", entidad_id=3, detalle="Danilo")
        db.commit()


# -- Auditoria: solo se consulta --


def test_nadie_crea_edita_ni_borra_auditorias_desde_la_api(auth_client) -> None:
    client, sf = auth_client
    _sembrar(sf)
    super_h, admin_h = _super(client), _admin(client)
    cuerpo = {"modulo": "x", "entidad": "y", "accion": "z"}

    for encabezado in (super_h, admin_h):
        assert client.post("/api/auditorias", headers=encabezado, json=cuerpo).status_code in (404, 405)
        assert client.patch("/api/auditorias/1", headers=encabezado, json={"usuario": "otra"}).status_code in (404, 405)
        assert client.delete("/api/auditorias/1", headers=encabezado).status_code in (404, 405)
    assert client.post("/api/superadmin/auditorias", headers=super_h, json=cuerpo).status_code in (404, 405)
    assert client.patch("/api/superadmin/auditorias/1", headers=super_h, json=cuerpo).status_code in (404, 405)
    assert client.delete("/api/superadmin/auditorias/1", headers=super_h).status_code in (404, 405)
    with sf() as db:
        assert db.query(AuditoriaModel).count() >= 3


def test_aunque_alguien_lo_intente_por_codigo_la_auditoria_no_se_edita_ni_se_borra(auth_client) -> None:
    _, sf = auth_client
    _sembrar(sf)

    with sf() as db:
        fila = db.execute(select(AuditoriaModel).limit(1)).scalar_one()
        fila.usuario = "otra_persona"
        with pytest.raises(AuditoriaInmutable):
            db.flush()
        db.rollback()
    with sf() as db:
        fila = db.execute(select(AuditoriaModel).limit(1)).scalar_one()
        db.delete(fila)
        with pytest.raises(AuditoriaInmutable):
            db.flush()
        db.rollback()
    with sf() as db:
        assert db.execute(select(AuditoriaModel).where(AuditoriaModel.usuario == "otra_persona")).first() is None


def test_la_lista_se_filtra_por_modulo_accion_usuario_texto_y_fechas(auth_client) -> None:
    client, sf = auth_client
    _sembrar(sf)
    super_h = _super(client)

    def ids(**params):
        return {a["detalle"] for a in client.get("/api/auditorias", headers=super_h, params=params).json() if a["detalle"] in {"pago de luz", "Maria Perez: error al digitar", "Danilo"}}

    assert ids(modulo="gastos") == {"pago de luz"}
    assert ids(accion="anular") == {"Maria Perez: error al digitar"}
    assert ids(usuario="vendedor1") == {"pago de luz"}
    assert ids(q="maria") == {"Maria Perez: error al digitar"}
    assert ids(desde="2000-01-01", hasta="2999-12-31") == {"pago de luz", "Maria Perez: error al digitar", "Danilo"}
    assert ids(desde="2999-01-01") == set()


def test_la_lista_paginada_dice_el_total_y_pagina(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        for n in range(7):
            registrar_auditoria(db, usuario="angelly_admin", modulo="cartera", entidad="venta", accion="crear", entidad_id=n + 1, detalle=f"venta {n}")
        db.commit()

    primera = client.get("/api/auditorias/paginadas", headers=_super(client), params={"modulo": "cartera", "limit": 3, "page": 1}).json()
    ultima = client.get("/api/auditorias/paginadas", headers=_super(client), params={"modulo": "cartera", "limit": 3, "page": 3}).json()

    assert primera["page"] == {"total": 7, "total_pages": 3, "current_page": 1, "limit": 3}
    assert [a["detalle"] for a in primera["data"]] == ["venta 6", "venta 5", "venta 4"]  # lo mas nuevo primero
    assert [a["detalle"] for a in ultima["data"]] == ["venta 0"]


def test_el_admin_solo_ve_la_auditoria_de_cartera_y_el_vendedor_no_ve_ninguna(auth_client) -> None:
    client, sf = auth_client
    _sembrar(sf)

    admin = client.get("/api/auditorias", headers=_admin(client)).json()
    super_lista = client.get("/api/auditorias", headers=_super(client)).json()

    assert {a["modulo"] for a in admin} <= {"cartera", "clientes_cartera"}
    assert "gastos" in {a["modulo"] for a in super_lista}
    assert client.get("/api/auditorias", headers=_vendedor(client)).status_code == 403
    assert client.get("/api/auditorias/paginadas", headers=_vendedor(client)).status_code == 403


# -- Usuarios: se desactivan, no se borran --


def _crear(client, ruta="vendedores", username="nuevo_vendedor", password="ClaveSegura2026"):
    return client.post(f"/api/superadmin/usuarios/{ruta}", headers=_super(client), json={"username": username, "password": password})


def _auditoria(sf, accion) -> list[str]:
    with sf() as db:
        return list(db.execute(select(AuditoriaModel.detalle).where(AuditoriaModel.modulo == "usuarios", AuditoriaModel.accion == accion)).scalars())


def test_crear_usuarios_deja_rastro_y_la_lista_dice_si_estan_activos(auth_client) -> None:
    client, sf = auth_client

    assert _crear(client).status_code == 201
    assert _crear(client, "admins", "nuevo_admin").status_code == 201

    vendedores = client.get("/api/superadmin/usuarios/vendedores", headers=_super(client)).json()
    admins = client.get("/api/superadmin/usuarios/admins", headers=_super(client)).json()
    assert any(u["username"] == "nuevo_vendedor" and u["activo"] is True for u in vendedores)
    assert any(u["username"] == "nuevo_admin" and u["rol"] == "admin" for u in admins)
    assert len(_auditoria(sf, "crear")) == 2


def test_el_usuario_no_se_repite_ni_con_otras_mayusculas_ni_lleva_espacios(auth_client) -> None:
    client, _ = auth_client
    assert _crear(client, username="Maria_Lopez").status_code == 201

    assert _crear(client, username="maria_lopez").status_code == 409
    assert _crear(client, username="Vendedor1").status_code == 409  # ya existe vendedor1
    assert _crear(client, username="con espacio").status_code == 400
    assert _crear(client, username="  ab  ").status_code == 400


def test_editar_audita_que_cambio_sin_guardar_la_clave_y_sin_cambios_no_deja_rastro(auth_client) -> None:
    client, sf = auth_client
    usuario_id = _crear(client).json()["id"]
    ruta = f"/api/superadmin/usuarios/vendedores/{usuario_id}"

    assert client.patch(ruta, headers=_super(client), json={"username": "nuevo_vendedor"}).status_code == 200  # mismo nombre
    assert _auditoria(sf, "editar") == []
    respuesta = client.patch(ruta, headers=_super(client), json={"username": "renombrado", "password": "OtraClaveSegura2026"})

    assert respuesta.status_code == 200 and respuesta.json()["username"] == "renombrado"
    detalle = _auditoria(sf, "editar")
    assert len(detalle) == 1
    assert "'nuevo_vendedor' -> 'renombrado'" in detalle[0] and "clave cambiada" in detalle[0] and "OtraClaveSegura2026" not in detalle[0]


def test_cambiar_la_clave_cierra_las_sesiones_abiertas(auth_client) -> None:
    client, _ = auth_client
    usuario_id = _crear(client, username="sesiones_a").json()["id"]
    token_viejo = _h(_login_token(client, "sesiones_a", "ClaveSegura2026"))
    assert client.get("/api/productos", headers=token_viejo).status_code == 200

    cambio = client.patch(f"/api/superadmin/usuarios/vendedores/{usuario_id}", headers=_super(client), json={"password": "ClaveNuevaSegura2026"})

    assert cambio.status_code == 200
    assert client.get("/api/productos", headers=token_viejo).status_code == 401
    time.sleep(1.1)  # una sesion nueva, un segundo despues, ya sirve
    token_nuevo = _h(_login_token(client, "sesiones_a", "ClaveNuevaSegura2026"))
    assert client.get("/api/productos", headers=token_nuevo).status_code == 200


def test_desactivar_no_borra_cierra_las_sesiones_impide_entrar_y_queda_registrado(auth_client) -> None:
    client, sf = auth_client
    usuario_id = _crear(client, username="se_va").json()["id"]
    token = _h(_login_token(client, "se_va", "ClaveSegura2026"))

    respuesta = client.delete(f"/api/superadmin/usuarios/vendedores/{usuario_id}", headers=_super(client))

    assert respuesta.status_code == 200 and respuesta.json()["activo"] is False
    assert client.get("/api/productos", headers=token).status_code == 401
    assert client.post("/api/auth/login", json={"username": "se_va", "password": "ClaveSegura2026"}).status_code == 401
    with sf() as db:
        assert db.get(UsuarioModel, usuario_id) is not None  # sigue existiendo
    assert any("se_va" in d for d in _auditoria(sf, "desactivar"))


def test_reactivar_devuelve_el_acceso_pero_no_resucita_las_sesiones_de_antes(auth_client) -> None:
    client, sf = auth_client
    usuario_id = _crear(client, username="vuelve").json()["id"]
    token_viejo = _h(_login_token(client, "vuelve", "ClaveSegura2026"))
    client.delete(f"/api/superadmin/usuarios/vendedores/{usuario_id}", headers=_super(client))

    reactivado = client.put(f"/api/superadmin/usuarios/vendedores/{usuario_id}/reactivar", headers=_super(client))

    assert reactivado.status_code == 200 and reactivado.json()["activo"] is True
    assert client.get("/api/productos", headers=token_viejo).status_code == 401  # el token de antes no revive
    time.sleep(1.1)
    assert client.get("/api/productos", headers=_h(_login_token(client, "vuelve", "ClaveSegura2026"))).status_code == 200
    assert len(_auditoria(sf, "reactivar")) == 1


def test_cerrar_sesiones_saca_al_usuario_sin_tocar_su_clave_y_tampoco_renueva(auth_client) -> None:
    client, sf = auth_client
    super_h = _super(client)
    usuario_id = _crear(client, username="cerrado").json()["id"]
    token = _h(_login_token(client, "cerrado", "ClaveSegura2026"))  # deja tambien su cookie de refresh en el cliente

    cierre = client.post(f"/api/superadmin/usuarios/vendedores/{usuario_id}/cerrar-sesiones", headers=super_h)

    assert cierre.status_code == 200
    assert client.get("/api/productos", headers=token).status_code == 401
    assert client.post("/api/auth/refresh").status_code == 401
    time.sleep(1.1)
    assert client.get("/api/productos", headers=_h(_login_token(client, "cerrado", "ClaveSegura2026"))).status_code == 200
    assert len(_auditoria(sf, "cerrar_sesiones")) == 1


def test_no_se_puede_tocar_un_usuario_de_otro_rol_ni_sin_ser_superadmin(auth_client) -> None:
    client, sf = auth_client
    with sf() as db:
        vendedor_id = db.execute(select(UsuarioModel.id).where(UsuarioModel.username == "vendedor1")).scalar_one()
        admin_id = db.execute(select(UsuarioModel.id).where(UsuarioModel.username == "angelly_admin")).scalar_one()

    assert client.delete(f"/api/superadmin/usuarios/admins/{vendedor_id}", headers=_super(client)).status_code == 404
    assert client.delete(f"/api/superadmin/usuarios/vendedores/{admin_id}", headers=_super(client)).status_code == 404
    assert client.get("/api/superadmin/usuarios/vendedores", headers=_admin(client)).status_code == 403
    assert client.delete(f"/api/superadmin/usuarios/vendedores/{vendedor_id}", headers=_admin(client)).status_code == 403
    assert client.delete(f"/api/superadmin/usuarios/vendedores/{vendedor_id}", headers=_vendedor(client)).status_code == 403


def test_ya_no_existe_el_segundo_juego_de_endpoints_de_vendedores(auth_client) -> None:
    client, _ = auth_client

    assert client.get("/api/usuarios/vendedores", headers=_super(client)).status_code in (404, 405)
    assert client.post("/api/usuarios/vendedores", headers=_super(client), json={"username": "x_x_x", "password": "ClaveSegura2026"}).status_code in (404, 405)
