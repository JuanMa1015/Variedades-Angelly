"""Steps BDD para escenarios de fiados de clientes."""

from __future__ import annotations

from behave import given, then, when

from src.domain.cliente import Cliente
from src.domain.producto import ItemVenta, Producto
from src.domain.transaccion import Venta


@given("existe un cliente con limite de credito de {limite_credito}")
def step_crear_cliente_con_limite(context, limite_credito: str) -> None:
    """Crea un cliente con cupo de credito para el escenario.

    Args:
        context: Contexto compartido entre steps de Behave.
        limite_credito: Valor maximo permitido para compras fiadas.
    """
    context.cliente = Cliente(
        nombre="Cliente Frecuente",
        limite_credito=float(limite_credito),
    )


@given("el cliente tiene una venta fiada de {valor_venta}")
def step_registrar_venta_fiada(context, valor_venta: str) -> None:
    """Registra una venta fiada inicial para generar deuda.

    Args:
        context: Contexto compartido entre steps de Behave.
        valor_venta: Total de la venta fiada a registrar.
    """
    producto = Producto(
        nombre="Canasta basica",
        precio_costo=4000.0,
        precio_venta=float(valor_venta),
        stock=20,
    )
    venta = Venta(concepto="Fiado inicial", es_credito=True)
    venta.agregar_item(ItemVenta(producto=producto, cantidad=1))
    context.cliente.registrar_venta_credito(venta)


@when("registra un abono de {monto_abono}")
def step_registrar_abono(context, monto_abono: str) -> None:
    """Ejecuta un abono sobre la cuenta del cliente.

    Args:
        context: Contexto compartido entre steps de Behave.
        monto_abono: Valor del abono a aplicar.
    """
    context.cliente.registrar_abono(float(monto_abono))


@then("el saldo pendiente del cliente es {saldo_esperado}")
def step_validar_saldo(context, saldo_esperado: str) -> None:
    """Verifica el saldo pendiente luego del abono.

    Args:
        context: Contexto compartido entre steps de Behave.
        saldo_esperado: Valor esperado de deuda despues del abono.
    """
    saldo = float(saldo_esperado)
    assert abs(context.cliente.deuda_total - saldo) < 1e-9
