"""Pruebas unitarias para la entidad Cliente."""

from __future__ import annotations

import pytest

from src.domain.cliente import Cliente
from src.domain.producto import ItemVenta, Producto
from src.domain.transaccion import Venta


def test_limite_credito_excedido_lanza_error(
    cliente_con_deuda: Cliente,
    producto_ejemplo: Producto,
) -> None:
    """Valida que no se puedan registrar fiados por encima del limite.

    Args:
        cliente_con_deuda: Cliente con deuda base registrada en fixture.
        producto_ejemplo: Producto base para construir una venta adicional.
    """
    venta_grande = Venta(concepto="Mercado mensual fiado", es_credito=True)
    venta_grande.agregar_item(ItemVenta(producto=producto_ejemplo, cantidad=20))

    with pytest.raises(ValueError, match="excedido"):
        cliente_con_deuda.registrar_venta_credito(venta_grande)

    assert cliente_con_deuda.deuda_total == pytest.approx(7000.0)


def test_abono_exitoso_recalcula_deuda_total(cliente_con_deuda: Cliente) -> None:
    """Comprueba que un abono valido disminuye el saldo pendiente.

    Args:
        cliente_con_deuda: Cliente con deuda inicial para probar abonos.
    """
    assert cliente_con_deuda.deuda_total == pytest.approx(7000.0)

    cliente_con_deuda.registrar_abono(2000.0)

    assert cliente_con_deuda.deuda_total == pytest.approx(5000.0)
    assert len(cliente_con_deuda.abonos) == 1
    assert cliente_con_deuda.abonos[0].monto == pytest.approx(2000.0)


def test_abono_mayor_a_deuda_lanza_error(cliente_con_deuda: Cliente) -> None:
    """Verifica que no se acepten abonos por encima de la deuda total.

    Args:
        cliente_con_deuda: Cliente con deuda inicial para validar restriccion.
    """
    with pytest.raises(ValueError, match="supera la deuda"):
        cliente_con_deuda.registrar_abono(7100.0)

    assert cliente_con_deuda.deuda_total == pytest.approx(7000.0)
    assert len(cliente_con_deuda.abonos) == 0


def test_abono_con_monto_negativo_lanza_error(cliente_con_deuda: Cliente) -> None:
    """Valida que abono con monto <= 0 sea rechazado."""
    from src.domain.cliente import Abono

    with pytest.raises(ValueError, match="positivo"):
        Abono(monto=-100.0)

    with pytest.raises(ValueError, match="positivo"):
        Abono(monto=0.0)


def test_establecer_deuda_negativa_lanza_error() -> None:
    """Valida que deuda negativa sea rechazada."""
    cliente = Cliente(nombre="Test", limite_credito=50000.0)
    with pytest.raises(ValueError, match="negativa"):
        cliente.establecer_deuda(-100.0)


def test_registrar_venta_no_credito_lanza_error() -> None:
    """Valida que solo ventas marcadas como credito sean registrables."""
    from src.domain.transaccion import Venta
    from src.domain.producto import ItemVenta, Producto

    cliente = Cliente(nombre="Test", limite_credito=50000.0)
    producto = Producto(nombre="Test", precio_costo=1000.0, precio_venta=2000.0)
    venta = Venta(concepto="Contado", es_credito=False)
    venta.agregar_item(ItemVenta(producto=producto, cantidad=1))

    with pytest.raises(ValueError, match="crédito"):
        cliente.registrar_venta_credito(venta)
