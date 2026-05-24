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


def test_producto_nombre_vacio_lanza_error() -> None:
    """Valida que el nombre del producto sea obligatorio."""
    with pytest.raises(ValueError, match="nombre"):
        Producto(
            nombre="",
            precio_costo=1000.0,
            precio_venta=2000.0,
        )


def test_producto_precios_negativos_lanza_error() -> None:
    """Valida que precios negativos sean rechazados."""
    with pytest.raises(ValueError, match="precios"):
        Producto(
            nombre="Producto Test",
            precio_costo=-100.0,
            precio_venta=2000.0,
        )


def test_producto_precio_venta_negativo_lanza_error() -> None:
    with pytest.raises(ValueError, match="precios"):
        Producto(
            nombre="Producto Test",
            precio_costo=1000.0,
            precio_venta=-2000.0,
        )


def test_producto_stock_negativo_lanza_error() -> None:
    """Valida que stock inicial negativo sea rechazado."""
    with pytest.raises(ValueError, match="stock"):
        Producto(
            nombre="Producto Test",
            precio_costo=1000.0,
            precio_venta=2000.0,
            stock=-5,
        )


def test_producto_stock_minimo_negativo_lanza_error() -> None:
    """Valida que stock minimo negativo sea rechazado."""
    with pytest.raises(ValueError, match="stock minimo"):
        Producto(
            nombre="Producto Test",
            precio_costo=1000.0,
            precio_venta=2000.0,
            stock_minimo=-1,
        )


def test_producto_reducir_stock_cantidad_negativa_lanza_error() -> None:
    """Valida que reducir stock con cantidad negativa sea rechazado."""
    producto = Producto(
        nombre="Test",
        precio_costo=1000.0,
        precio_venta=2000.0,
        stock=10,
    )
    with pytest.raises(ValueError, match="negativa"):
        producto.reducir_stock(-5)


def test_producto_aumentar_stock_cantidad_negativa_lanza_error() -> None:
    """Valida que aumentar stock con cantidad negativa sea rechazado."""
    producto = Producto(
        nombre="Test",
        precio_costo=1000.0,
        precio_venta=2000.0,
        stock=10,
    )
    with pytest.raises(ValueError, match="negativa"):
        producto.aumentar_stock(-5)


def test_producto_actualizar_precio_venta_negativo_lanza_error() -> None:
    """Valida que precio venta negativo sea rechazado."""
    producto = Producto(
        nombre="Test",
        precio_costo=1000.0,
        precio_venta=2000.0,
    )
    with pytest.raises(ValueError, match="negativo"):
        producto.actualizar_precio_venta(-1.0)


def test_producto_stock_critico() -> None:
    """Valida la propiedad stock_critico."""
    producto = Producto(
        nombre="Test",
        precio_costo=1000.0,
        precio_venta=2000.0,
        stock=3,
        stock_minimo=5,
    )
    assert producto.stock_critico is True

    producto2 = Producto(
        nombre="Test2",
        precio_costo=1000.0,
        precio_venta=2000.0,
        stock=10,
        stock_minimo=5,
    )
    assert producto2.stock_critico is False
