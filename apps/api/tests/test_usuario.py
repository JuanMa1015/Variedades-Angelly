"""Pruebas unitarias para la entidad Usuario."""

from __future__ import annotations

import pytest

from src.domain.enums import RolUsuario
from src.domain.usuario import Usuario


def test_crear_usuario_valido(usuario_ejemplo: Usuario) -> None:
    """Valida el estado inicial de un usuario creado correctamente.

    Args:
        usuario_ejemplo: Fixture de usuario valido para pruebas base.
    """
    assert usuario_ejemplo.username == "cajero01"
    assert usuario_ejemplo.email == "cajero01@angelly.com"
    assert usuario_ejemplo.rol is RolUsuario.ADMIN
    assert usuario_ejemplo.activo is True


@pytest.mark.parametrize(
    ("username_invalido", "mensaje_esperado"),
    [
        ("ab", "al menos 3"),
        ("cajero_1", "letras y números"),
        ("juan p", "letras y números"),
        ("@admin", "letras y números"),
    ],
)
def test_username_invalido_lanza_error(
    username_invalido: str,
    mensaje_esperado: str,
) -> None:
    """Verifica que el username invalido dispare una excepcion de dominio.

    Args:
        username_invalido: Username que incumple reglas de validacion.
        mensaje_esperado: Fragmento del mensaje de error esperado.
    """
    with pytest.raises(ValueError, match=mensaje_esperado):
        Usuario(
            username=username_invalido,
            email="vendedor@angelly.com",
            rol=RolUsuario.TRABAJADOR,
        )


@pytest.mark.parametrize(
    "email_invalido",
    [
        "sin-arroba.com",
        "correo@sinpunto",
        "",
    ],
)
def test_email_invalido_lanza_error(email_invalido: str) -> None:
    """Confirma que emails invalidos se rechazan en la creacion.

    Args:
        email_invalido: Correo electronico sin formato valido.
    """
    with pytest.raises(ValueError, match="Email inválido"):
        Usuario(
            username="vendedor10",
            email=email_invalido,
            rol=RolUsuario.TRABAJADOR,
        )


def test_activar_y_desactivar_usuario() -> None:
    """Comprueba que el estado activo cambia con los metodos de negocio."""
    usuario = Usuario(
        username="cobrador9",
        email="cobrador9@angelly.com",
        rol=RolUsuario.TRABAJADOR,
    )

    usuario.desactivar()
    assert usuario.activo is False

    usuario.activar()
    assert usuario.activo is True
