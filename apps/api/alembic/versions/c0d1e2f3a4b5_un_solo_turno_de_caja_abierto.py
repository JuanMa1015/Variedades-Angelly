"""cierres_caja: indice unico que permite un solo turno abierto

Dos aperturas simultaneas podian dejar dos turnos abiertos (la API revisaba y luego creaba, y entre
ambos pasos otra peticion podia crear el suyo). El indice unico parcial lo impide en la base de datos.

Si ya hubiera mas de un turno abierto la migracion se detiene sin tocar nada: son registros de dinero
y debe decidirlos una persona (cerrar o eliminar los sobrantes) antes de reintentar.

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-11-10 23:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c0d1e2f3a4b5"
down_revision: Union[str, None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDICE = "ux_cierres_caja_un_turno_abierto"


def _turnos_abiertos() -> list[int]:
    if op.get_context().as_sql:  # al solo generar el SQL no hay base que revisar
        return []
    filas = op.get_bind().execute(sa.text("SELECT id FROM cierres_caja WHERE fecha_cierre IS NULL ORDER BY id"))
    return [fila[0] for fila in filas]


def upgrade() -> None:
    abiertos = _turnos_abiertos()
    if len(abiertos) > 1:
        raise RuntimeError(
            "Hay mas de un turno de caja abierto (ids: "
            f"{', '.join(map(str, abiertos))}). Cierra o elimina los sobrantes y vuelve a ejecutar la migracion.",
        )
    op.create_index(
        INDICE,
        "cierres_caja",
        [sa.text("(1)")],
        unique=True,
        postgresql_where=sa.text("fecha_cierre IS NULL"),
        sqlite_where=sa.text("fecha_cierre IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(INDICE, table_name="cierres_caja")
