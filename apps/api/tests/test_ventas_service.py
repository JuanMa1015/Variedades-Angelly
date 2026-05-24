"""Pruebas unitarias para servicios de aplicacion de ventas."""

from __future__ import annotations

import pytest

from src.application.services.ventas_service import build_recibo_text


class DetalleStub:
    """Stub del protocolo ReciboDetalle para pruebas."""

    def __init__(self, cantidad: int, nombre_producto: str, subtotal: float) -> None:
        self.cantidad = cantidad
        self.nombre_producto = nombre_producto
        self.subtotal = subtotal


def test_recibo_con_detalles_y_cliente() -> None:
    """Valida que el recibo incluya datos de cliente y productos."""
    detalles = [
        DetalleStub(cantidad=2, nombre_producto="Arroz", subtotal=7000.0),
        DetalleStub(cantidad=1, nombre_producto="Leche", subtotal=3600.0),
    ]
    resultado = build_recibo_text(
        venta_id=1,
        detalles=detalles,
        total=10600.0,
        saldo_pendiente=0.0,
        cliente_nombre="Don Pepe",
    )
    assert "Recibo #1" in resultado
    assert "Don Pepe" in resultado
    assert "Arroz" in resultado
    assert "Leche" in resultado
    assert "$10600" in resultado


def test_recibo_sin_cliente() -> None:
    """Valida que sin cliente use 'Mostrador'."""
    detalles = [
        DetalleStub(cantidad=1, nombre_producto="Jabon", subtotal=2500.0),
    ]
    resultado = build_recibo_text(
        venta_id=5,
        detalles=detalles,
        total=2500.0,
        saldo_pendiente=0.0,
        cliente_nombre=None,
    )
    assert "Mostrador" in resultado
    assert "$2500" in resultado


def test_recibo_con_saldo_pendiente() -> None:
    """Valida que se muestre el saldo pendiente en fiados."""
    detalles = [
        DetalleStub(cantidad=1, nombre_producto="Camisa", subtotal=25000.0),
    ]
    resultado = build_recibo_text(
        venta_id=10,
        detalles=detalles,
        total=25000.0,
        saldo_pendiente=15000.0,
        cliente_nombre="Cliente Fiado",
    )
    assert "$15000" in resultado


def test_recibo_sin_detalles() -> None:
    """Valida que se maneje lista vacia de detalles."""
    resultado = build_recibo_text(
        venta_id=0,
        detalles=[],
        total=0.0,
        saldo_pendiente=0.0,
        cliente_nombre=None,
    )
    assert "Sin productos" in resultado
