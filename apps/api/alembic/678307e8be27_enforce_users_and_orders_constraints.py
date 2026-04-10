"""enforce_users_and_orders_constraints

Revision ID: 678307e8be27
Revises: 27b7aa8b7907
Create Date: 2026-04-09 22:17:02.931615

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '678307e8be27'
down_revision: Union[str, None] = '27b7aa8b7907'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Normaliza roles legacy de usuarios y estado de pedidos antes de constraints.
    op.execute(
        "UPDATE usuarios "
        "SET rol = LOWER(COALESCE(rol, 'vendedor'));",
    )
    op.execute(
        "UPDATE usuarios "
        "SET rol = 'vendedor' "
        "WHERE rol NOT IN ('superadmin', 'admin', 'vendedor');",
    )
    op.execute(
        "UPDATE usuarios "
        "SET username = TRIM(username) "
        "WHERE username IS NOT NULL;",
    )
    op.execute(
        "UPDATE pedidos_proveedor "
        "SET estado = 'enviado' "
        "WHERE estado IS NULL OR estado <> 'enviado';",
    )

    op.execute("ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS ck_usuarios_rol_valido;")
    op.execute("ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS ck_usuarios_username_not_blank;")
    op.execute("ALTER TABLE pedidos_proveedor DROP CONSTRAINT IF EXISTS ck_pedidos_proveedor_estado_valido;")

    op.execute(
        "ALTER TABLE usuarios "
        "ADD CONSTRAINT ck_usuarios_rol_valido "
        "CHECK (rol IN ('superadmin', 'admin', 'vendedor'));",
    )
    op.execute(
        "ALTER TABLE usuarios "
        "ADD CONSTRAINT ck_usuarios_username_not_blank "
        "CHECK (LENGTH(TRIM(username)) > 0);",
    )
    op.execute(
        "ALTER TABLE pedidos_proveedor "
        "ADD CONSTRAINT ck_pedidos_proveedor_estado_valido "
        "CHECK (estado IN ('enviado'));",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE pedidos_proveedor DROP CONSTRAINT IF EXISTS ck_pedidos_proveedor_estado_valido;")
    op.execute("ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS ck_usuarios_username_not_blank;")
    op.execute("ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS ck_usuarios_rol_valido;")
