from datetime import datetime
from typing import Optional
from .enums import RolUsuario


class Usuario:
    """Representa un usuario con acceso al sistema.

    Attributes:
        username: Identificador único alfanumérico.
        email: Correo electrónico validado.
        rol: Nivel de permisos.
    """

    def __init__(
        self,
        username: str,
        email: str,
        rol: RolUsuario,
        nombre_completo: Optional[str] = None,
    ) -> None:
        """Inicializa el usuario con validaciones de seguridad."""
        if len(username) < 3:
            raise ValueError("Username debe tener al menos 3 caracteres")
        if not username.isalnum():
            raise ValueError("Username solo puede contener letras y números")

        self._username = username
        self._email = None
        self.email = email
        self.nombre_completo = nombre_completo
        self.rol = rol
        self.activo = True
        self.fecha_registro = datetime.now()

    @property
    def username(self) -> str:
        """Retorna el identificador inmutable."""
        return self._username

    @property
    def email(self) -> str:
        """Retorna el correo electrónico."""
        return self._email

    @email.setter
    def email(self, valor: str) -> None:
        """Valida que el correo contenga los caracteres básicos."""
        if "@" not in valor or "." not in valor:
            raise ValueError(f"Email inválido: {valor}")
        self._email = valor

    def activar(self) -> None:
        """Cambia el estado del usuario a activo."""
        self.activo = True

    def desactivar(self) -> None:
        """Cambia el estado del usuario a inactivo."""
        self.activo = False

    def __str__(self) -> str:
        return f"@{self.username} ({self.rol.value})"
