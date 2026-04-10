"""baseline_schema

Revision ID: 73b065969db9
Revises: 
Create Date: 2026-04-09 21:59:27.601173

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = '73b065969db9'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Baseline intencional: no altera esquema existente."""
    pass


def downgrade() -> None:
    """Sin cambios reversibles para baseline inicial."""
    pass
