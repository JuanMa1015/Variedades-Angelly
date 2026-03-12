"""Steps BDD para escenarios de ventas de contado y fiado."""

from __future__ import annotations

from behave import given, then, when

from src.domain.cliente import Cliente
from src.domain.producto import ItemVenta, Producto
from src.domain.transaccion import Venta


def _parse_money(value: str) -> float:
    """Convierte valores monetarios con separadores locales a float."""
    cleaned = value.strip().replace(".", "").replace(",", ".")
    return float(cleaned)


@given(
    "un producto para venta \"{nombre}\" con precio costo {precio_costo} precio venta {precio_venta} y stock {stock}",
)
def step_producto_para_venta(
    context,
    nombre: str,
    precio_costo: str,
    precio_venta: str,
    stock: str,
) -> None:
    """Inicializa producto de dominio para flujo de ventas."""
    context.producto_venta = Producto(
        nombre=nombre,
        precio_costo=_parse_money(precio_costo),
        precio_venta=_parse_money(precio_venta),
        stock=int(stock),
        stock_minimo=0,
    )
    context.error_venta = None
    context.venta_registrada = None


@given(
    "un cliente de ventas \"{nombre}\" con limite {limite_credito} y deuda actual {deuda_actual}",
)
def step_cliente_para_venta(
    context,
    nombre: str,
    limite_credito: str,
    deuda_actual: str,
) -> None:
    """Inicializa cliente de dominio para validar reglas de fiado."""
    context.cliente_venta = Cliente(
        nombre=nombre,
        limite_credito=_parse_money(limite_credito),
        documento="1000000000",
    )
    context.cliente_venta.establecer_deuda(_parse_money(deuda_actual))
    context.error_venta = None
    context.venta_registrada = None


@when("se registra una venta de contado por {cantidad} unidades")
def step_venta_contado(context, cantidad: str) -> None:
    """Registra una venta en efectivo y descuenta inventario."""
    unidades = int(cantidad)
    venta = Venta(concepto="Venta contado", es_credito=False)
    venta.agregar_item(ItemVenta(producto=context.producto_venta, cantidad=unidades))
    context.producto_venta.reducir_stock(unidades)
    context.venta_registrada = venta
    context.error_venta = None


@when("se registra una venta fiada por {cantidad} unidades")
def step_venta_fiada(context, cantidad: str) -> None:
    """Registra una venta fiada respetando el limite del cliente."""
    _registrar_venta_fiada(context, cantidad)


@when("se intenta registrar una venta fiada por {cantidad} unidades")
def step_intento_venta_fiada(context, cantidad: str) -> None:
    """Alias para escenarios donde se espera fallo por credito."""
    _registrar_venta_fiada(context, cantidad)


def _registrar_venta_fiada(context, cantidad: str) -> None:
    """Ejecuta logica comun de venta fiada para escenarios happy/error."""
    unidades = int(cantidad)
    venta = Venta(concepto="Venta fiada", es_credito=True)
    venta.agregar_item(ItemVenta(producto=context.producto_venta, cantidad=unidades))

    context.error_venta = None
    context.venta_registrada = None

    try:
        context.cliente_venta.registrar_venta_credito(venta)
        context.producto_venta.reducir_stock(unidades)
        context.venta_registrada = venta
    except ValueError as exc:
        context.error_venta = str(exc)


@then("el total de la venta registrada es {total_esperado}")
def step_total_venta(context, total_esperado: str) -> None:
    """Valida el total calculado para una venta creada."""
    assert context.venta_registrada is not None
    assert context.venta_registrada.obtener_total() == _parse_money(total_esperado)


@then("la venta fiada se registra correctamente")
def step_venta_fiada_ok(context) -> None:
    """Confirma venta fiada exitosa sin error de dominio."""
    assert context.error_venta is None
    assert context.venta_registrada is not None


@then("la deuda del cliente de ventas es {deuda_esperada}")
def step_deuda_cliente(context, deuda_esperada: str) -> None:
    """Valida saldo pendiente tras venta fiada aprobada."""
    assert context.cliente_venta.deuda_total == _parse_money(deuda_esperada)


@then("se obtiene un error por limite de credito excedido")
def step_error_limite(context) -> None:
    """Valida rechazo de venta fiada cuando supera cupo."""
    assert context.error_venta is not None
    assert "excedido" in context.error_venta.lower()


@then("el stock del producto en venta es {stock_esperado}")
def step_stock_producto_venta(context, stock_esperado: str) -> None:
    """Verifica stock final despues del escenario de ventas."""
    assert context.producto_venta.stock_actual == int(stock_esperado)
