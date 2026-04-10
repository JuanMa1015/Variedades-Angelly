"""Contrato de persistencia para clientes."""

from __future__ import annotations

from abc import abstractmethod

from src.domain.cliente import Cliente
from src.domain.repositories.base_repository import BaseRepository


class ClienteRepository(BaseRepository[Cliente, int]):
    """Extiende el repositorio base con consultas de cliente."""

    @abstractmethod
    def get_by_nombre(self, nombre: str) -> Cliente | None:
        """Retorna un cliente por nombre exacto, si existe."""
