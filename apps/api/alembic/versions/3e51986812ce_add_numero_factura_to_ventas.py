"""add numero_factura to ventas

Revision ID: 3e51986812ce
Revises: 40e7f89dbe26
Create Date: 2026-05-26 00:29:40.559067

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "3e51986812ce"
down_revision: Union[str, None] = "40e7f89dbe26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ventas", sa.Column("numero_factura", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("ventas", "numero_factura")
