from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List

from .enums import CategoriaGasto
from .producto import ItemVenta


class Transaccion(ABC):
    """Interfaz abstracta para movimientos financieros."""

    def __init__(self, concepto: str) -> None:
        self.fecha = datetime.now()
        self.concepto = concepto

    @abstractmethod
    def obtener_total(self) -> float:
        """Metodo polimorfico para obtener el valor de la operacion."""


class DetalleVenta:
    """Representa una linea del comprobante de venta."""

    def __init__(
        self,
        producto_id: int,
        nombre_producto: str,
        cantidad: int,
        precio_unitario: float,
    ) -> None:
        if producto_id <= 0:
            raise ValueError("producto_id invalido")
        if not nombre_producto.strip():
            raise ValueError("El nombre del producto es obligatorio")
        if cantidad <= 0:
            raise ValueError("La cantidad debe ser mayor a cero")
        if precio_unitario < 0:
            raise ValueError("El precio unitario no puede ser negativo")

        self.producto_id = producto_id
        self.nombre_producto = nombre_producto.strip()
        self.cantidad = cantidad
        self.precio_unitario = float(precio_unitario)

    @property
    def subtotal(self) -> float:
        """Total parcial de la linea."""
        return self.cantidad * self.precio_unitario


class Venta(Transaccion):
    """Entidad de dominio para una venta con sus detalles."""

    def __init__(
        self,
        concepto: str = "Venta",
        es_credito: bool = False,
        *,
        cliente_id: int | None = None,
        venta_id: int | None = None,
        es_fiado: bool | None = None,
    ) -> None:
        super().__init__(concepto)
        self.id = venta_id
        self.cliente_id = cliente_id
        self.es_fiado = es_credito if es_fiado is None else es_fiado
        # Retrocompatibilidad con pruebas existentes de ItemVenta.
        self.items: List[ItemVenta] = []
        self.detalles: List[DetalleVenta] = []

    @property
    def es_credito(self) -> bool:
        """Alias retrocompatible para el flujo de fiados."""
        return self.es_fiado

    def agregar_item(self, item: ItemVenta) -> None:
        """Mantiene compatibilidad con las pruebas unitarias existentes."""
        self.items.append(item)

    def agregar_detalle(self, detalle: DetalleVenta) -> None:
        """Agrega una linea formal al comprobante de venta."""
        self.detalles.append(detalle)

    def obtener_total(self) -> float:
        """Suma subtotales de detalles o items segun el flujo usado."""
        if self.detalles:
            return sum(detalle.subtotal for detalle in self.detalles)
        return sum(item.subtotal() for item in self.items)


class Gasto(Transaccion):
    """Registro de egresos del negocio."""

    def __init__(self, concepto: str, monto: float, categoria: CategoriaGasto) -> None:
        super().__init__(concepto)
        self._monto = monto
        self.categoria = categoria

    def obtener_total(self) -> float:
        """Retorna el monto del gasto."""
        return self._monto
