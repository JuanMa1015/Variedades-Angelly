"""Contrato base para repositorios del dominio."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Generic, TypeVar

TEntity = TypeVar("TEntity")
TId = TypeVar("TId")


class BaseRepository(ABC, Generic[TEntity, TId]):
    """Define operaciones CRUD basicas para cualquier agregado."""

    @abstractmethod
    def add(self, entity: TEntity) -> TEntity:
        """Guarda una entidad nueva en persistencia."""

    @abstractmethod
    def get_by_id(self, entity_id: TId) -> TEntity | None:
        """Obtiene una entidad por su identificador."""

    @abstractmethod
    def list_all(self) -> list[TEntity]:
        """Lista todas las entidades disponibles."""

    @abstractmethod
    def update(self, entity: TEntity) -> TEntity:
        """Actualiza una entidad existente."""

    @abstractmethod
    def delete(self, entity_id: TId) -> None:
        """Elimina una entidad segun su identificador."""
