"""merge heads

Revision ID: bef1fe795a51
Revises: 43ccde97f38f, a2b3c4d5e6f7
Create Date: 2026-05-25 23:03:12.181331

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "bef1fe795a51"
down_revision: Union[str, Sequence[str], None] = ("43ccde97f38f", "a2b3c4d5e6f7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
