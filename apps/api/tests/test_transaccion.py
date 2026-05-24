"""Pruebas unitarias para las transacciones de la tienda."""

from __future__ import annotations

import pytest

from src.domain.enums import CategoriaGasto
from src.domain.producto import ItemVenta, Producto
from src.domain.transaccion import Gasto, Venta


def test_venta_sin_items_tiene_total_cero() -> None:
    """Valida caso borde de venta sin detalle de productos."""
    venta = Venta(concepto="Venta rapida sin items", es_credito=False)

    assert len(venta.items) == 0
    assert venta.obtener_total() == pytest.approx(0.0)


def test_venta_agregar_items_calcula_total_correcto() -> None:
    """Comprueba el total acumulado al agregar multiples items."""
    arroz = Producto(
        nombre="Arroz 1kg",
        precio_costo=3000.0,
        precio_venta=4200.0,
        stock=50,
    )
    leche = Producto(
        nombre="Leche 1L",
        precio_costo=2800.0,
        precio_venta=3600.0,
        stock=50,
    )
    venta = Venta(concepto="Mercado de quincena", es_credito=True)

    venta.agregar_item(ItemVenta(producto=arroz, cantidad=2))
    venta.agregar_item(ItemVenta(producto=leche, cantidad=3))

    assert len(venta.items) == 2
    assert venta.obtener_total() == pytest.approx(19200.0)


def test_gasto_retorna_monto_configurado() -> None:
    """Verifica comportamiento normal de un gasto operativo."""
    gasto = Gasto(
        concepto="Pago de energia",
        monto=45000.0,
        categoria=CategoriaGasto.SERVICIOS,
    )

    assert gasto.obtener_total() == pytest.approx(45000.0)
    assert gasto.categoria is CategoriaGasto.SERVICIOS


def test_gasto_en_cero_se_permite_como_caso_borde() -> None:
    """Valida que monto cero no rompa la logica de transacciones."""
    gasto = Gasto(
        concepto="Ajuste de caja sin costo",
        monto=0.0,
        categoria=CategoriaGasto.OTROS,
    )

    assert gasto.obtener_total() == pytest.approx(0.0)


def test_gasto_monto_negativo_lanza_error() -> None:
    """Verifica que no se permitan gastos con monto negativo."""
    with pytest.raises(ValueError, match="negativo"):
        Gasto(
            concepto="Gasto invalido",
            monto=-100.0,
            categoria=CategoriaGasto.OTROS,
        )


def test_gasto_concepto_vacio_lanza_error() -> None:
    """Verifica que el concepto del gasto sea obligatorio."""
    with pytest.raises(ValueError, match="concepto"):
        Gasto(
            concepto="",
            monto=100.0,
            categoria=CategoriaGasto.OTROS,
        )


def test_gasto_categoria_invalida_lanza_error() -> None:
    """Verifica que la categoria sea un CategoriaGasto valido."""
    with pytest.raises(ValueError, match="Categoría"):
        Gasto(
            concepto="Gasto prueba",
            monto=100.0,
            categoria="INVALIDA",  # type: ignore[arg-type]
        )


def test_detalle_venta_nombre_vacio_lanza_error() -> None:
    """Valida que DetalleVenta rechace nombre vacio."""
    from src.domain.transaccion import DetalleVenta

    with pytest.raises(ValueError, match="nombre"):
        DetalleVenta(
            producto_id=1,
            nombre_producto="",
            cantidad=1,
            precio_unitario=100.0,
        )
