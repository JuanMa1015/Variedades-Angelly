"""add numero_factura to facturas_compra

Revision ID: 40e7f89dbe26
Revises: bef1fe795a51
Create Date: 2026-05-26 00:22:22.429224

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "40e7f89dbe26"
down_revision: Union[str, None] = "bef1fe795a51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("facturas_compra", sa.Column("numero_factura", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("facturas_compra", "numero_factura")
