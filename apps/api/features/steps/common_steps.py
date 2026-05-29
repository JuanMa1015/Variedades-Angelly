import json

from behave import given, when, then
from sqlalchemy import select

from src.domain.enums import RolUsuario
from src.infrastructure.database.models import (
    ClienteFiadoTiendaModel,
    ClienteModel,
    ProductoModel,
    UsuarioModel,
)


def _login(context, username, password):
    response = context.client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    payload = response.json()
    context.token = payload["access_token"]
    context.current_user = username


def _producto_id(context, nombre):
    with context.db_session() as session:
        producto = session.execute(
            select(ProductoModel).where(ProductoModel.nombre == nombre),
        ).scalar_one_or_none()
        assert producto is not None, f"Producto '{nombre}' no encontrado"
        return producto.id


@given("el sistema esta listo con usuarios semilla")
def step_sistema_listo(context):
    pass


@given('estoy autenticado como "{usuario}" con password "{password}"')
def step_autenticado(context, usuario, password):
    _login(context, usuario, password)


@given("existen los siguientes productos:")
def step_existen_productos(context):
    with context.db_session() as session:
        for row in context.table:
            producto = ProductoModel(
                nombre=row["nombre"],
                precio_costo=int(row["precio_costo"]),
                precio_venta=int(row["precio_venta"]),
                stock_actual=int(row["stock_actual"]),
                stock_minimo=int(row["stock_minimo"]),
            )
            session.add(producto)
        session.commit()


@given("existe un cliente de tienda:")
def step_existe_cliente_tienda(context):
    with context.db_session() as session:
        for row in context.table:
            cliente = ClienteFiadoTiendaModel(
                nombre=row["nombre"],
                telefono_whatsapp=row["telefono_whatsapp"],
            )
            session.add(cliente)
        session.commit()


@given("existe un cliente de cartera:")
def step_existe_cliente_cartera(context):
    with context.db_session() as session:
        for row in context.table:
            cliente = ClienteModel(
                nombre=row["nombre"],
                documento=row["documento"],
                limite_credito=int(row["limite_credito"]),
                deuda_total=0,
            )
            session.add(cliente)
        session.commit()


@when('hago login con usuario "{usuario}" y password "{password}"')
def step_hago_login(context, usuario, password):
    context.response = context.client.post(
        "/api/auth/login",
        json={"username": usuario, "password": password},
    )


@when('hago GET a "{endpoint}" sin token')
def step_get_sin_token(context, endpoint):
    context.response = context.client.get(endpoint)


@when('hago GET a "{endpoint}"')
def step_get_autenticado(context, endpoint):
    context.response = context.client.get(
        endpoint,
        headers={"Authorization": f"Bearer {context.token}"},
    )


@when("creo una venta de contado con items:")
def step_crear_venta_contado(context):
    items = [{"producto_id": _producto_id(context, r["producto_nombre"]), "cantidad": int(r["cantidad"])} for r in context.table]
    context.response = context.client.post(
        "/api/ventas",
        headers={"Authorization": f"Bearer {context.token}"},
        json={"items": items, "es_fiado": False},
    )


@when('creo un fiado de tienda para "{cliente_nombre}" con items:')
def step_crear_fiado_tienda(context, cliente_nombre):
    with context.db_session() as session:
        cliente = session.execute(
            select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.nombre == cliente_nombre),
        ).scalar_one_or_none()
        assert cliente is not None, f"Cliente de tienda '{cliente_nombre}' no encontrado"

    items = [{"producto_id": _producto_id(context, r["producto_nombre"]), "cantidad": int(r["cantidad"])} for r in context.table]
    context.response = context.client.post(
        "/api/ventas",
        headers={"Authorization": f"Bearer {context.token}"},
        json={
            "cliente_tienda_id": cliente.id,
            "items": items,
            "es_fiado": True,
            "fiado_origen": "tienda",
        },
    )


@when('intento crear un fiado de cartera para "{cliente_nombre}" con items:')
def step_intentar_fiado_cartera(context, cliente_nombre):
    with context.db_session() as session:
        cliente = session.execute(
            select(ClienteModel).where(ClienteModel.nombre == cliente_nombre),
        ).scalar_one_or_none()
        assert cliente is not None, f"Cliente de cartera '{cliente_nombre}' no encontrado"

    items = [{"producto_id": _producto_id(context, r["producto_nombre"]), "cantidad": int(r["cantidad"])} for r in context.table]
    context.response = context.client.post(
        "/api/ventas",
        headers={"Authorization": f"Bearer {context.token}"},
        json={
            "cliente_id": cliente.id,
            "items": items,
            "es_fiado": True,
            "fiado_origen": "cartera",
        },
    )


@when('creo un fiado de cartera para "{cliente_nombre}" con items:')
def step_crear_fiado_cartera(context, cliente_nombre):
    with context.db_session() as session:
        cliente = session.execute(
            select(ClienteModel).where(ClienteModel.nombre == cliente_nombre),
        ).scalar_one_or_none()
        assert cliente is not None, f"Cliente de cartera '{cliente_nombre}' no encontrado"

    items = [{"producto_id": _producto_id(context, r["producto_nombre"]), "cantidad": int(r["cantidad"])} for r in context.table]
    context.response = context.client.post(
        "/api/ventas",
        headers={"Authorization": f"Bearer {context.token}"},
        json={
            "cliente_id": cliente.id,
            "items": items,
            "es_fiado": True,
            "fiado_origen": "cartera",
        },
    )


@then("la respuesta es {codigo:d}")
def step_respuesta_codigo(context, codigo):
    assert context.response.status_code == codigo, (
        f"Expected {codigo}, got {context.response.status_code}: {context.response.text}"
    )


@then('el token tiene rol "{rol}"')
def step_token_rol(context, rol):
    payload = context.response.json()
    assert payload["role"] == rol, f"Expected role '{rol}', got '{payload['role']}'"


@then('el username es "{username}"')
def step_token_username(context, username):
    payload = context.response.json()
    assert payload["username"] == username, f"Expected username '{username}', got '{payload['username']}'"


@then('el detalle del error es "{mensaje}"')
def step_error_detail(context, mensaje):
    payload = context.response.json()
    assert payload["detail"] == mensaje, f"Expected detail '{mensaje}', got '{payload['detail']}'"


@then("la venta tiene total {total:d}")
def step_venta_total(context, total):
    payload = context.response.json()
    assert payload["total"] == total, f"Expected total {total}, got {payload['total']}"


@then("el saldo pendiente es {saldo:d}")
def step_saldo_pendiente(context, saldo):
    payload = context.response.json()
    assert payload["saldo_pendiente"] == saldo, f"Expected saldo {saldo}, got {payload['saldo_pendiente']}"


@then('la venta tiene origen "{origen}"')
def step_venta_origen(context, origen):
    payload = context.response.json()
    assert payload["fiado_origen"] == origen, f"Expected origen '{origen}', got '{payload['fiado_origen']}'"


@given('el cliente "{nombre}" tiene una deuda de {deuda:d}')
def step_cliente_tiene_deuda(context, nombre, deuda):
    with context.db_session() as session:
        cliente = session.execute(
            select(ClienteModel).where(ClienteModel.nombre == nombre),
        ).scalar_one_or_none()
        assert cliente is not None, f"Cliente '{nombre}' no encontrado"
        cliente.deuda_total = float(deuda)
        session.commit()


def _cliente_id(context, nombre):
    with context.db_session() as session:
        cliente = session.execute(
            select(ClienteModel).where(ClienteModel.nombre == nombre),
        ).scalar_one_or_none()
        assert cliente is not None, f"Cliente '{nombre}' no encontrado"
        return cliente.id


@when('registro un abono de {monto:d} para "{nombre}"')
def step_registrar_abono(context, monto, nombre):
    cliente_id = _cliente_id(context, nombre)
    context.response = context.client.post(
        f"/api/cartera/clientes/{cliente_id}/abonos",
        headers={"Authorization": f"Bearer {context.token}"},
        json={"monto": monto, "metodo_pago": "efectivo"},
    )


@when('intento registrar un abono de {monto:d} para "{nombre}"')
def step_intentar_abono(context, monto, nombre):
    cliente_id = _cliente_id(context, nombre)
    context.response = context.client.post(
        f"/api/cartera/clientes/{cliente_id}/abonos",
        headers={"Authorization": f"Bearer {context.token}"},
        json={"monto": monto, "metodo_pago": "efectivo"},
    )


@then('el saldo del cliente "{nombre}" es {saldo:d}')
def step_saldo_cliente(context, nombre, saldo):
    with context.db_session() as session:
        cliente = session.execute(
            select(ClienteModel).where(ClienteModel.nombre == nombre),
        ).scalar_one_or_none()
        assert cliente is not None, f"Cliente '{nombre}' no encontrado"
        assert cliente.deuda_total == float(saldo), (
            f"Expected saldo {saldo}, got {cliente.deuda_total}"
        )
