from abc import ABC, abstractmethod
from datetime import datetime
from typing import List
from .producto import ItemVenta
from .enums import CategoriaGasto


class Transaccion(ABC):
    """Interfaz abstracta para movimientos financieros."""

    def __init__(self, concepto: str) -> None:
        self.fecha = datetime.now()
        self.concepto = concepto

    @abstractmethod
    def obtener_total(self) -> float:
        """Método polimórfico para obtener el valor de la operación."""
        pass


class Venta(Transaccion):
    """Registro de venta de productos."""

    def __init__(self, concepto: str, es_credito: bool = False) -> None:
        super().__init__(concepto)
        self.items: List[ItemVenta] = []
        self.es_credito = es_credito

    def agregar_item(self, item: ItemVenta) -> None:
        """Añade un producto al carrito de la venta."""
        self.items.append(item)

    def obtener_total(self) -> float:
        """Suma el subtotal de todos los items."""
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
