"""Contrato de persistencia para usuarios."""

from __future__ import annotations

from abc import abstractmethod

from src.domain.usuario import Usuario
from src.domain.repositories.base_repository import BaseRepository


class UsuarioRepository(BaseRepository[Usuario, int]):
    """Extiende el repositorio base con consultas de usuario."""

    @abstractmethod
    def get_by_username(self, username: str) -> Usuario | None:
        """Retorna un usuario por username unico, si existe."""

    @abstractmethod
    def get_by_email(self, email: str) -> Usuario | None:
        """Retorna un usuario por correo, si existe."""
