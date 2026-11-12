"""movimientos_puntos: historial de puntos de cada cliente de fidelizacion

Revision ID: j7e8f9a0b1c2
Revises: i6d7e8f9a0b1
Create Date: 2026-11-12 09:00:00

Idempotente: si la tabla ya existe no se vuelve a crear. A los clientes que ya tienen puntos se les registra
un movimiento "saldo_inicial" para que el historial sume siempre el saldo actual.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "j7e8f9a0b1c2"
down_revision: Union[str, None] = "i6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDICE = "ix_movimientos_puntos_cliente_fecha"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "movimientos_puntos" not in inspector.get_table_names():
        op.create_table(
            "movimientos_puntos",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes_fidelizacion.id"), nullable=False),
            sa.Column("fecha", sa.DateTime(), nullable=False),
            sa.Column("tipo", sa.String(length=30), nullable=False),
            sa.Column("puntos", sa.Integer(), nullable=False),
            sa.Column("saldo", sa.Integer(), nullable=False),
            sa.Column("motivo", sa.String(length=200), nullable=True),
            sa.Column("usuario", sa.String(length=50), nullable=False),
            sa.Column("referencia_tipo", sa.String(length=30), nullable=True),
            sa.Column("referencia_id", sa.Integer(), nullable=True),
        )
        inspector = sa.inspect(op.get_bind())
    if INDICE not in {i["name"] for i in inspector.get_indexes("movimientos_puntos")}:
        op.create_index(INDICE, "movimientos_puntos", ["cliente_id", "fecha"])

    # Solo a quien aun no tiene ningun movimiento: repetir la migracion no duplica nada.
    op.execute(sa.text(
        "INSERT INTO movimientos_puntos (cliente_id, fecha, tipo, puntos, saldo, motivo, usuario) "
        "SELECT id, CURRENT_TIMESTAMP, 'saldo_inicial', puntos_acumulados, puntos_acumulados, "
        "'Saldo anterior al historial', 'sistema' "
        "FROM clientes_fidelizacion "
        "WHERE puntos_acumulados > 0 AND id NOT IN (SELECT cliente_id FROM movimientos_puntos)"
    ))


def downgrade() -> None:
    op.drop_index(INDICE, table_name="movimientos_puntos")
    op.drop_table("movimientos_puntos")
