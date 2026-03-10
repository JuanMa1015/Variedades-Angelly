"""Pruebas unitarias para los enums del dominio."""

from __future__ import annotations

import pytest

from src.domain.enums import CategoriaGasto, RolUsuario, TipoMovimiento


@pytest.mark.parametrize(
    ("rol", "valor_esperado"),
    [
        (RolUsuario.ADMIN, "ADMIN"),
        (RolUsuario.TRABAJADOR, "TRABAJADOR"),
    ],
)
def test_rol_usuario_tiene_valores_esperados(
    rol: RolUsuario,
    valor_esperado: str,
) -> None:
    """Verifica que cada rol tenga el valor de negocio correcto.

    Args:
        rol: Miembro del enum RolUsuario a validar.
        valor_esperado: Texto esperado para el rol evaluado.
    """
    assert rol.value == valor_esperado


def test_categoria_gasto_tiene_valores_esperados() -> None:
    """Comprueba que las categorias de gasto configuradas sean las oficiales."""
    categorias = {categoria.value for categoria in CategoriaGasto}
    assert categorias == {"SERVICIOS", "PROVEEDORES", "NOMINA", "OTROS"}


@pytest.mark.parametrize(
    ("movimiento", "valor_esperado"),
    [
        (TipoMovimiento.CARGO, "CARGO"),
        (TipoMovimiento.ABONO, "ABONO"),
    ],
)
def test_tipo_movimiento_tiene_valores_esperados(
    movimiento: TipoMovimiento,
    valor_esperado: str,
) -> None:
    """Valida los valores del enum para movimientos contables.

    Args:
        movimiento: Miembro del enum TipoMovimiento a evaluar.
        valor_esperado: Valor esperado de salida para el miembro.
    """
    assert movimiento.value == valor_esperado
