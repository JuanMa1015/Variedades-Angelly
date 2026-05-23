"""agregar vendedor a ventas y endpoint de informes

Revision ID: c9a7e5b2f1d4
Revises: 7b6c4bd1030a
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9a7e5b2f1d4'
down_revision: Union[str, None] = '7b6c4bd1030a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ventas', sa.Column('creado_por', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('ventas', 'creado_por')
