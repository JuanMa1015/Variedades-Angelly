"""completa columnas de canje de puntos, monto recibido y consentimiento de datos

La migracion a8b9c0d1e2f3 se amplio despues de que algunas bases ya la habian aplicado: esas
bases tienen las columnas de anulacion pero no estas. Aqui se agregan solo las que falten, de modo
que sirve igual para una base que aplico la version corta y para una que aplico la completa.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-11-10 20:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNAS = {
    "ventas": (
        ("monto_recibido", lambda: sa.Column("monto_recibido", sa.Numeric(14, 2), nullable=True)),
        ("puntos_canjeados", lambda: sa.Column("puntos_canjeados", sa.Integer(), nullable=False, server_default="0")),
        ("descuento_puntos", lambda: sa.Column("descuento_puntos", sa.Numeric(14, 2), nullable=False, server_default="0")),
    ),
    "clientes_fidelizacion": (
        ("acepta_datos", lambda: sa.Column("acepta_datos", sa.Boolean(), nullable=False, server_default=sa.false())),
        ("acepta_datos_en", lambda: sa.Column("acepta_datos_en", sa.DateTime(), nullable=True)),
    ),
}


def _existentes(tabla: str) -> set[str]:
    if op.get_context().as_sql:  # al solo generar el SQL no hay base que inspeccionar
        return set()
    return {col["name"] for col in sa.inspect(op.get_bind()).get_columns(tabla)}


def upgrade() -> None:
    for tabla, columnas in COLUMNAS.items():
        existentes = _existentes(tabla)
        faltantes = [crear for nombre, crear in columnas if nombre not in existentes]
        if not faltantes:
            continue
        with op.batch_alter_table(tabla) as batch:
            for crear in faltantes:
                batch.add_column(crear())


def downgrade() -> None:
    # Los datos de canje y consentimiento no se pierden al bajar solo esta revision: las columnas
    # pertenecen tambien a a8b9c0d1e2f3 en las bases nuevas, que las elimina al bajar esa.
    pass
