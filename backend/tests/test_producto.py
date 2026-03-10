"""Pruebas unitarias para la entidad Producto."""

from __future__ import annotations

import pytest

from src.domain.producto import Producto


def test_reducir_stock_tras_venta(producto_ejemplo: Producto) -> None:
    """Valida que el inventario se descuente cuando se vende producto.

    Args:
        producto_ejemplo: Producto base con stock inicial para la prueba.
    """
    stock_inicial = producto_ejemplo.stock

    producto_ejemplo.reducir_stock(5)

    assert producto_ejemplo.stock == stock_inicial - 5


def test_reducir_stock_sin_existencias_suficientes_lanza_error(
    producto_ejemplo: Producto,
) -> None:
    """Confirma que se dispare error cuando la venta supera el inventario.

    Args:
        producto_ejemplo: Producto base para validar control de stock.
    """
    stock_actual = producto_ejemplo.stock

    with pytest.raises(ValueError, match="Stock insuficiente"):
        producto_ejemplo.reducir_stock(stock_actual + 1)

    assert producto_ejemplo.stock == stock_actual
