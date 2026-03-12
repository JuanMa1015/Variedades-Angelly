"""Fixtures compartidas para pruebas del dominio de Variedades Angelly."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Permite importar el paquete src incluso cuando pytest se ejecuta como script.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domain.cliente import Cliente
from src.domain.enums import RolUsuario
from src.domain.producto import ItemVenta, Producto
from src.domain.transaccion import Venta
from src.domain.usuario import Usuario


@pytest.fixture(scope="module")
def usuario_ejemplo() -> Usuario:
    """Crea un usuario valido para escenarios de autenticacion.

    Returns:
        Usuario: Usuario de rol administrador para pruebas base.
    """
    return Usuario(
        username="cajero01",
        email="cajero01@angelly.com",
        rol=RolUsuario.ADMIN,
        nombre_completo="Cajero Principal",
    )


@pytest.fixture(scope="function")
def producto_ejemplo() -> Producto:
    """Crea un producto base para pruebas de venta e inventario.

    Returns:
        Producto: Producto de uso frecuente en la tienda.
    """
    return Producto(
        nombre="Arroz Diana 500g",
        precio_costo=2800.0,
        precio_venta=3500.0,
        stock=40,
    )


@pytest.fixture(scope="function")
def cliente_ejemplo() -> Cliente:
    """Construye un cliente valido para pruebas unitarias de dominio."""
    return Cliente(
        nombre="Dona Marta",
        documento="1000000001",
        limite_credito=60000.0,
    )


@pytest.fixture(scope="function")
def venta_ejemplo(producto_ejemplo: Producto) -> Venta:
    """Construye una venta a credito con un item de prueba.

    Args:
        producto_ejemplo: Producto que se agregara al detalle de venta.

    Returns:
        Venta: Venta con un item y total calculable.
    """
    venta = Venta(concepto="Venta de mercado semanal", es_credito=True)
    venta.agregar_item(ItemVenta(producto=producto_ejemplo, cantidad=2))
    return venta


@pytest.fixture(scope="function")
def cliente_con_deuda(cliente_ejemplo: Cliente, venta_ejemplo: Venta) -> Cliente:
    """Prepara un cliente con una deuda inicial por venta fiada.

    Args:
        venta_ejemplo: Venta fiada para generar saldo pendiente.

    Returns:
        Cliente: Cliente con deuda activa para pruebas de abonos.
    """
    cliente = cliente_ejemplo
    cliente.registrar_venta_credito(venta_ejemplo)
    return cliente
