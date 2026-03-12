"""Migraciones SQL rapidas para clientes, productos y ventas en Neon."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from src.infrastructure.database.connection import engine


def apply_migration() -> None:
    """Normaliza clientes, productos y estructura transaccional de ventas."""
    try:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE clientes "
                    "ADD COLUMN IF NOT EXISTS documento VARCHAR;",
                ),
            )

            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_documento "
                    "ON clientes (documento) "
                    "WHERE documento IS NOT NULL;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE clientes "
                    "ADD COLUMN IF NOT EXISTS deuda_total DOUBLE PRECISION NOT NULL DEFAULT 0;",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS productos ("
                    "id SERIAL PRIMARY KEY, "
                    "nombre VARCHAR(120) NOT NULL UNIQUE, "
                    "precio_costo DOUBLE PRECISION NOT NULL, "
                    "precio_venta DOUBLE PRECISION NOT NULL, "
                    "stock_actual INTEGER NOT NULL DEFAULT 0, "
                    "stock_minimo INTEGER NOT NULL DEFAULT 0"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE productos "
                    "ADD COLUMN IF NOT EXISTS stock_minimo INTEGER NOT NULL DEFAULT 0;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE productos "
                    "ADD COLUMN IF NOT EXISTS stock_actual INTEGER NOT NULL DEFAULT 0;",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS ventas ("
                    "id SERIAL PRIMARY KEY, "
                    "cliente_id INTEGER REFERENCES clientes(id), "
                    "es_fiado BOOLEAN NOT NULL DEFAULT FALSE, "
                    "total DOUBLE PRECISION NOT NULL, "
                    "saldo_pendiente DOUBLE PRECISION NOT NULL DEFAULT 0, "
                    "fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE ventas "
                    "ALTER COLUMN cliente_id DROP NOT NULL;",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS detalle_ventas ("
                    "id SERIAL PRIMARY KEY, "
                    "venta_id INTEGER NOT NULL REFERENCES ventas(id), "
                    "producto_id INTEGER NOT NULL REFERENCES productos(id), "
                    "nombre_producto VARCHAR(120) NOT NULL, "
                    "cantidad INTEGER NOT NULL, "
                    "precio_unitario DOUBLE PRECISION NOT NULL, "
                    "subtotal DOUBLE PRECISION NOT NULL"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "UPDATE clientes "
                    "SET documento = :documento "
                    "WHERE nombre = :nombre "
                    "AND (documento IS NULL OR documento = '');",
                ),
                {
                    "documento": "1000000000",
                    "nombre": "Cliente Test",
                },
            )

            conn.execute(
                text(
                    "INSERT INTO productos "
                    "(nombre, precio_costo, precio_venta, stock_actual, stock_minimo) "
                    "VALUES "
                    "(:nombre, :precio_costo, :precio_venta, :stock_actual, :stock_minimo) "
                    "ON CONFLICT (nombre) DO NOTHING;",
                ),
                {
                    "nombre": "Arroz Diana 500g",
                    "precio_costo": 2800.0,
                    "precio_venta": 3500.0,
                    "stock_actual": 40,
                    "stock_minimo": 10,
                },
            )

            conn.execute(
                text(
                    "INSERT INTO productos "
                    "(nombre, precio_costo, precio_venta, stock_actual, stock_minimo) "
                    "VALUES "
                    "(:nombre, :precio_costo, :precio_venta, :stock_actual, :stock_minimo) "
                    "ON CONFLICT (nombre) DO NOTHING;",
                ),
                {
                    "nombre": "Leche Entera 1L",
                    "precio_costo": 3000.0,
                    "precio_venta": 3900.0,
                    "stock_actual": 8,
                    "stock_minimo": 10,
                },
            )

            conn.commit()

        print("Migracion aplicada correctamente: clientes, productos y ventas normalizados.")
    except OperationalError as exc:
        print(
            "Error de conexion al aplicar migracion "
            "(revisa Neon, SSL o DATABASE_URL).",
        )
        print(f"Detalle tecnico: {exc}")
    except SQLAlchemyError as exc:
        print("Error SQLAlchemy al aplicar migracion.")
        print(f"Detalle tecnico: {exc}")


if __name__ == "__main__":
    apply_migration()
