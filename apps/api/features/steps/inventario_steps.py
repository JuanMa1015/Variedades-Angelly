"""Steps BDD para escenarios de inventario."""

from __future__ import annotations

from behave import given, then, when

from src.domain.producto import Producto


def _parse_number(value: str) -> float:
    """Convierte montos con formato local a float."""
    cleaned = value.strip().replace(".", "").replace(",", ".")
    return float(cleaned)


@given(
    "existe un producto \"{nombre}\" con precio costo {precio_costo} precio venta {precio_venta} stock {stock} y minimo {stock_minimo}",
)
def step_crear_producto(
    context,
    nombre: str,
    precio_costo: str,
    precio_venta: str,
    stock: str,
    stock_minimo: str,
) -> None:
    """Crea un producto de dominio para pruebas de inventario."""
    context.producto = Producto(
        nombre=nombre,
        precio_costo=_parse_number(precio_costo),
        precio_venta=_parse_number(precio_venta),
        stock=int(stock),
        stock_minimo=int(stock_minimo),
    )
    context.error_inventario = None


@when("se agregan {cantidad} unidades al inventario")
def step_agregar_stock(context, cantidad: str) -> None:
    """Aumenta inventario con una entrada de stock."""
    context.producto.aumentar_stock(int(cantidad))


@when("se descuentan {cantidad} unidades del inventario")
def step_descontar_stock(context, cantidad: str) -> None:
    """Intenta reducir inventario y captura errores esperados."""
    context.error_inventario = None
    try:
        context.producto.reducir_stock(int(cantidad))
    except ValueError as exc:
        context.error_inventario = str(exc)


@then("el stock actual del producto es {stock_esperado}")
def step_validar_stock(context, stock_esperado: str) -> None:
    """Verifica stock final tras una operacion."""
    assert context.producto.stock_actual == int(stock_esperado)


@then("se obtiene un error de stock insuficiente")
def step_validar_error_stock(context) -> None:
    """Valida error de dominio cuando se intenta sobredescontar inventario."""
    assert context.error_inventario is not None
    assert "Stock insuficiente" in context.error_inventario


@then("el producto queda en alerta de stock bajo")
def step_validar_alerta_stock_bajo(context) -> None:
    """Verifica bandera de stock critico en el dominio."""
    assert context.producto.stock_critico is True
