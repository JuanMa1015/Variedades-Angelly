"""Migraciones SQL rapidas para clientes, productos y ventas en Neon."""

from __future__ import annotations

import os

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from src.infrastructure.database.connection import engine

MIGRATION_VERSION = "2026_04_09_core_schema_v1"


def _ensure_migrations_table(conn) -> None:
    conn.execute(
        text(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "id SERIAL PRIMARY KEY, "
            "version VARCHAR(80) NOT NULL UNIQUE, "
            "applied_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP"
            ");",
        ),
    )


def _is_migration_applied(conn, version: str) -> bool:
    row = conn.execute(
        text(
            "SELECT 1 FROM schema_migrations "
            "WHERE version = :version "
            "LIMIT 1;",
        ),
        {"version": version},
    ).first()
    return row is not None


def _mark_migration_applied(conn, version: str) -> None:
    conn.execute(
        text(
            "INSERT INTO schema_migrations (version) "
            "VALUES (:version) "
            "ON CONFLICT (version) DO NOTHING;",
        ),
        {"version": version},
    )


def apply_migration() -> bool:
    """Normaliza clientes, productos y estructura transaccional de ventas."""
    try:
        with engine.connect() as conn:
            _ensure_migrations_table(conn)
            if _is_migration_applied(conn, MIGRATION_VERSION):
                print(f"Migracion ya aplicada: {MIGRATION_VERSION}")
                return False

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS clientes ("
                    "id SERIAL PRIMARY KEY, "
                    "nombre VARCHAR(120) NOT NULL, "
                    "documento VARCHAR, "
                    "deuda_total DOUBLE PRECISION NOT NULL DEFAULT 0, "
                    "telefono_whatsapp VARCHAR(25)"
                    ");",
                ),
            )

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
                    "ALTER TABLE clientes "
                    "ADD COLUMN IF NOT EXISTS telefono_whatsapp VARCHAR(25);",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS clientes_fidelizacion ("
                    "id SERIAL PRIMARY KEY, "
                    "nombre VARCHAR(120) NOT NULL, "
                    "telefono_whatsapp VARCHAR(25) NOT NULL, "
                    "puntos_acumulados INTEGER NOT NULL DEFAULT 0"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS clientes_fiado_tienda ("
                    "id SERIAL PRIMARY KEY, "
                    "nombre VARCHAR(120) NOT NULL, "
                    "telefono_whatsapp VARCHAR(25)"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE clientes_fidelizacion "
                    "ADD COLUMN IF NOT EXISTS puntos_acumulados INTEGER NOT NULL DEFAULT 0;",
                ),
            )

            conn.execute(
                text(
                    "UPDATE clientes_fidelizacion "
                    "SET puntos_acumulados = 0 "
                    "WHERE puntos_acumulados IS NULL OR puntos_acumulados < 0;",
                ),
            )

            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_fidelizacion_telefono "
                    "ON clientes_fidelizacion (telefono_whatsapp);",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS usuarios ("
                    "id SERIAL PRIMARY KEY, "
                    "username VARCHAR(50) NOT NULL UNIQUE, "
                    "password_hash VARCHAR(255) NOT NULL, "
                    "rol VARCHAR(20) NOT NULL"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "ADD COLUMN IF NOT EXISTS rol VARCHAR(20);",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "DROP COLUMN IF EXISTS email;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "DROP COLUMN IF EXISTS nombre_completo;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "DROP COLUMN IF EXISTS activo;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "DROP COLUMN IF EXISTS fecha_registro;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "ALTER COLUMN rol TYPE VARCHAR(20) "
                    "USING LOWER(rol::text);",
                ),
            )

            conn.execute(
                text(
                    "UPDATE usuarios SET rol = 'admin' "
                    "WHERE LOWER(COALESCE(rol, '')) = 'admin';",
                ),
            )

            conn.execute(
                text(
                    "UPDATE usuarios SET rol = 'vendedor' "
                    "WHERE LOWER(COALESCE(rol, '')) IN ('trabajador', 'vendedor', '') "
                    "OR rol IS NULL;",
                ),
            )

            conn.execute(
                text(
                    "UPDATE usuarios SET password_hash = '' "
                    "WHERE password_hash IS NULL;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "ALTER COLUMN password_hash SET NOT NULL;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "ALTER COLUMN rol SET NOT NULL;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "DROP CONSTRAINT IF EXISTS ck_usuarios_rol_valido;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "ADD CONSTRAINT ck_usuarios_rol_valido "
                    "CHECK (rol IN ('superadmin', 'admin', 'vendedor'));",
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
                    "stock_minimo INTEGER NOT NULL DEFAULT 0, "
                    "catalogo VARCHAR(20) NOT NULL DEFAULT 'tienda'"
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
                    "ALTER TABLE productos "
                    "ADD COLUMN IF NOT EXISTS catalogo VARCHAR(20) NOT NULL DEFAULT 'tienda';",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE productos "
                    "ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(64);",
                ),
            )

            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_codigo_barras "
                    "ON productos (codigo_barras) "
                    "WHERE codigo_barras IS NOT NULL;",
                ),
            )

            conn.execute(
                text(
                    "UPDATE productos "
                    "SET catalogo = 'tienda' "
                    "WHERE catalogo IS NULL OR catalogo NOT IN ('tienda', 'cartera');",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS ventas ("
                    "id SERIAL PRIMARY KEY, "
                    "cliente_id INTEGER REFERENCES clientes(id), "
                    "cliente_tienda_id INTEGER REFERENCES clientes_fiado_tienda(id), "
                    "tipo_fiado VARCHAR(20), "
                    "metodo_pago VARCHAR(20), "
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
                    "ADD COLUMN IF NOT EXISTS cliente_tienda_id INTEGER REFERENCES clientes_fiado_tienda(id);",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE ventas "
                    "ADD COLUMN IF NOT EXISTS tipo_fiado VARCHAR(20);",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE ventas "
                    "ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(20);",
                ),
            )

            conn.execute(
                text(
                    "UPDATE ventas "
                    "SET tipo_fiado = 'cartera' "
                    "WHERE es_fiado = TRUE "
                    "AND cliente_id IS NOT NULL "
                    "AND (tipo_fiado IS NULL OR tipo_fiado = '');",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE ventas "
                    "DROP CONSTRAINT IF EXISTS ck_ventas_tipo_fiado_valido;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE ventas "
                    "ADD CONSTRAINT ck_ventas_tipo_fiado_valido "
                    "CHECK (tipo_fiado IS NULL OR tipo_fiado IN ('cartera', 'tienda'));",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS proveedores ("
                    "id SERIAL PRIMARY KEY, "
                    "nombre VARCHAR(120) NOT NULL UNIQUE, "
                    "contacto VARCHAR(120), "
                    "telefono VARCHAR(25), "
                    "activo BOOLEAN NOT NULL DEFAULT TRUE"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS pedidos_proveedor ("
                    "id SERIAL PRIMARY KEY, "
                    "proveedor_id INTEGER NOT NULL REFERENCES proveedores(id), "
                    "descripcion VARCHAR(255) NOT NULL, "
                    "monto_estimado DOUBLE PRECISION NOT NULL, "
                    "estado VARCHAR(20) NOT NULL DEFAULT 'enviado', "
                    "creado_por VARCHAR(50) NOT NULL, "
                    "aprobado_por VARCHAR(50), "
                    "fecha_creacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                    "fecha_resolucion TIMESTAMP WITHOUT TIME ZONE"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS facturas_compra ("
                    "id SERIAL PRIMARY KEY, "
                    "proveedor_id INTEGER NOT NULL REFERENCES proveedores(id), "
                    "creado_por VARCHAR(50) NOT NULL, "
                    "subtotal DOUBLE PRECISION NOT NULL, "
                    "total_iva DOUBLE PRECISION NOT NULL DEFAULT 0, "
                    "total_factura DOUBLE PRECISION NOT NULL, "
                    "fecha_creacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS factura_compra_detalles ("
                    "id SERIAL PRIMARY KEY, "
                    "factura_id INTEGER NOT NULL REFERENCES facturas_compra(id), "
                    "producto_id INTEGER NOT NULL REFERENCES productos(id), "
                    "nombre_producto VARCHAR(120) NOT NULL, "
                    "cantidad INTEGER NOT NULL, "
                    "aplica_iva BOOLEAN NOT NULL DEFAULT FALSE, "
                    "precio_unitario DOUBLE PRECISION NOT NULL, "
                    "precio_total DOUBLE PRECISION NOT NULL"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE pedidos_proveedor "
                    "ALTER COLUMN estado SET DEFAULT 'enviado';",
                ),
            )

            conn.execute(
                text(
                    "UPDATE pedidos_proveedor "
                    "SET estado = 'enviado' "
                    "WHERE estado IS DISTINCT FROM 'enviado';",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE pedidos_proveedor "
                    "DROP CONSTRAINT IF EXISTS ck_pedidos_proveedor_estado_valido;",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE pedidos_proveedor "
                    "ADD CONSTRAINT ck_pedidos_proveedor_estado_valido "
                    "CHECK (estado IN ('enviado'));",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS gastos ("
                    "id SERIAL PRIMARY KEY, "
                    "categoria VARCHAR(50) NOT NULL, "
                    "descripcion VARCHAR(255) NOT NULL, "
                    "monto DOUBLE PRECISION NOT NULL, "
                    "fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                    "registrado_por VARCHAR(50) NOT NULL"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS auditorias ("
                    "id SERIAL PRIMARY KEY, "
                    "modulo VARCHAR(50) NOT NULL, "
                    "entidad VARCHAR(80) NOT NULL, "
                    "entidad_id INTEGER, "
                    "accion VARCHAR(30) NOT NULL, "
                    "detalle VARCHAR(500), "
                    "usuario VARCHAR(50) NOT NULL, "
                    "fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS abonos_cartera ("
                    "id SERIAL PRIMARY KEY, "
                    "cliente_id INTEGER NOT NULL REFERENCES clientes(id), "
                    "monto DOUBLE PRECISION NOT NULL, "
                    "metodo_pago VARCHAR(20), "
                    "saldo_cliente DOUBLE PRECISION NOT NULL, "
                    "referencia VARCHAR(255), "
                    "fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP"
                    ");",
                ),
            )

            conn.execute(
                text(
                    "ALTER TABLE abonos_cartera "
                    "ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(20);",
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

            _mark_migration_applied(conn, MIGRATION_VERSION)

            conn.commit()

        print(f"Migracion aplicada correctamente: {MIGRATION_VERSION}")
        return True
    except OperationalError as exc:
        print(
            "Error de conexion al aplicar migracion "
            "(revisa Neon, SSL o DATABASE_URL).",
        )
        print(f"Detalle tecnico: {exc}")
        return False
    except SQLAlchemyError as exc:
        print("Error SQLAlchemy al aplicar migracion.")
        print(f"Detalle tecnico: {exc}")
        return False


def _is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on", "si"}


def main() -> int:
    """Ejecuta migracion de forma explicita desde CLI con guardas basicas de entorno."""
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    allow_prod = _is_truthy(os.getenv("ALLOW_SCHEMA_MIGRATION"))

    if app_env in {"prod", "production"} and not allow_prod:
        print(
            "Migracion bloqueada: define ALLOW_SCHEMA_MIGRATION=true "
            "para ejecutar en produccion.",
        )
        return 2

    apply_migration()

    if _is_truthy(os.getenv("RUN_DB_SEED")):
        from src.infrastructure.database.seed_db import seed_db

        seed_db()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
