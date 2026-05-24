from enum import Enum


class RolUsuario(Enum):
    """Roles disponibles para el acceso al sistema."""

    SUPERADMIN = "SUPERADMIN"
    ADMIN = "ADMIN"
    VENDEDOR = "VENDEDOR"
    TRABAJADOR = "TRABAJADOR"  # retrocompatibilidad"


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
