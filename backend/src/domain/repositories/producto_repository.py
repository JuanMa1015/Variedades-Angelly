"""Contrato de persistencia para productos de inventario."""

from __future__ import annotations

from abc import abstractmethod

from src.domain.producto import Producto
from src.domain.repositories.base_repository import BaseRepository


class ProductoRepository(BaseRepository[Producto, int]):
    """Extiende CRUD con operaciones de inventario."""

    @abstractmethod
    def get_by_nombre(self, nombre: str) -> Producto | None:
        """Retorna un producto por nombre exacto, si existe."""

    @abstractmethod
    def update_stock(self, producto_id: int, delta: int) -> Producto | None:
        """Ajusta stock por delta y retorna el producto actualizado."""

    @abstractmethod
    def update_precio_venta(
        self,
        producto_id: int,
        precio_venta: float,
    ) -> Producto | None:
        """Actualiza precio de venta y retorna el producto actualizado."""
