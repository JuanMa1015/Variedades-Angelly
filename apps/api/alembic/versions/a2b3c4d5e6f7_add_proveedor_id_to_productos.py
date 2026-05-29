"""add proveedor_id FK to productos table

Revision ID: a2b3c4d5e6f7
Revises: 43ccde97f38f
Create Date: 2026-05-25 23:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, None] = "43ccde97f38f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("productos", sa.Column("proveedor_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_productos_proveedor_id",
        "productos",
        "proveedores",
        ["proveedor_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_productos_proveedor_id", "productos", type_="foreignkey")
    op.drop_column("productos", "proveedor_id")
