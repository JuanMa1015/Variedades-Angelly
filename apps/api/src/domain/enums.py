from enum import Enum


class RolUsuario(Enum):
    """Roles disponibles para el acceso al sistema."""

    ADMIN = "ADMIN"
    TRABAJADOR = "TRABAJADOR"


class CategoriaGasto(Enum):
    """Categorías para la clasificación de egresos."""

    SERVICIOS = "SERVICIOS"
    PROVEEDORES = "PROVEEDORES"
    NOMINA = "NOMINA"
    OTROS = "OTROS"


class TipoMovimiento(Enum):
    """Tipos de afectación financiera en cuentas."""

    CARGO = "CARGO"
    ABONO = "ABONO"
