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
                    "CHECK (rol IN ('admin', 'vendedor'));",
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
                    "cliente_tienda_id INTEGER REFERENCES clientes_fiado_tienda(id), "
                    "tipo_fiado VARCHAR(20), "
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
                    "saldo_cliente DOUBLE PRECISION NOT NULL, "
                    "referencia VARCHAR(255), "
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
                    "UPDATE clientes "
                    "SET telefono_whatsapp = :telefono_whatsapp "
                    "WHERE nombre = :nombre "
                    "AND (telefono_whatsapp IS NULL OR telefono_whatsapp = '');",
                ),
                {
                    "telefono_whatsapp": "3001112233",
                    "nombre": "Cliente Test",
                },
            )

            conn.execute(
                text(
                    "INSERT INTO clientes_fidelizacion "
                    "(nombre, telefono_whatsapp, puntos_acumulados) "
                    "VALUES (:nombre, :telefono_whatsapp, :puntos_acumulados) "
                    "ON CONFLICT (telefono_whatsapp) DO UPDATE "
                    "SET nombre = EXCLUDED.nombre, "
                    "puntos_acumulados = EXCLUDED.puntos_acumulados;",
                ),
                {
                    "nombre": "Lina Rojas",
                    "telefono_whatsapp": "3001234567",
                    "puntos_acumulados": 120,
                },
            )

            conn.execute(
                text(
                    "INSERT INTO clientes_fiado_tienda (nombre, telefono_whatsapp) "
                    "SELECT :nombre_value, :telefono_whatsapp_value "
                    "WHERE NOT EXISTS ("
                    "SELECT 1 FROM clientes_fiado_tienda WHERE nombre = :nombre_filter"
                    ");",
                ),
                {
                    "nombre_value": "Fiado Tienda 1",
                    "nombre_filter": "Fiado Tienda 1",
                    "telefono_whatsapp_value": "3008889900",
                },
            )

            conn.execute(
                text(
                    "INSERT INTO clientes_fiado_tienda (nombre, telefono_whatsapp) "
                    "SELECT :nombre_value, :telefono_whatsapp_value "
                    "WHERE NOT EXISTS ("
                    "SELECT 1 FROM clientes_fiado_tienda WHERE nombre = :nombre_filter"
                    ");",
                ),
                {
                    "nombre_value": "Fiado Tienda 2",
                    "nombre_filter": "Fiado Tienda 2",
                    "telefono_whatsapp_value": "3017776655",
                },
            )

            conn.execute(
                text(
                    "INSERT INTO proveedores (nombre, contacto, telefono, activo) "
                    "VALUES (:nombre, :contacto, :telefono, TRUE) "
                    "ON CONFLICT (nombre) DO NOTHING;",
                ),
                {
                    "nombre": "Distribuciones La Central",
                    "contacto": "Diana",
                    "telefono": "3101002000",
                },
            )

            conn.execute(
                text(
                    "INSERT INTO proveedores (nombre, contacto, telefono, activo) "
                    "VALUES (:nombre, :contacto, :telefono, TRUE) "
                    "ON CONFLICT (nombre) DO NOTHING;",
                ),
                {
                    "nombre": "Mayorista El Bodegon",
                    "contacto": "Carlos",
                    "telefono": "3112003000",
                },
            )

            conn.execute(
                text(
                    "INSERT INTO gastos (categoria, descripcion, monto, registrado_por) "
                    "SELECT :categoria_value, :descripcion_value, :monto_value, :registrado_por_value "
                    "WHERE NOT EXISTS ("
                    "SELECT 1 FROM gastos WHERE categoria = :categoria_filter "
                    "AND descripcion = :descripcion_filter"
                    ");",
                ),
                {
                    "categoria_value": "arriendo",
                    "categoria_filter": "arriendo",
                    "descripcion_value": "Arriendo mensual del local",
                    "descripcion_filter": "Arriendo mensual del local",
                    "monto_value": 1200000,
                    "registrado_por_value": "angelly_admin",
                },
            )

            conn.execute(
                text(
                    "INSERT INTO gastos (categoria, descripcion, monto, registrado_por) "
                    "SELECT :categoria_value, :descripcion_value, :monto_value, :registrado_por_value "
                    "WHERE NOT EXISTS ("
                    "SELECT 1 FROM gastos WHERE categoria = :categoria_filter "
                    "AND descripcion = :descripcion_filter"
                    ");",
                ),
                {
                    "categoria_value": "servicios",
                    "categoria_filter": "servicios",
                    "descripcion_value": "Pago de energia y agua",
                    "descripcion_filter": "Pago de energia y agua",
                    "monto_value": 320000,
                    "registrado_por_value": "angelly_admin",
                },
            )

            conn.execute(
                text(
                    "INSERT INTO clientes_fidelizacion "
                    "(nombre, telefono_whatsapp, puntos_acumulados) "
                    "VALUES (:nombre, :telefono_whatsapp, :puntos_acumulados) "
                    "ON CONFLICT (telefono_whatsapp) DO UPDATE "
                    "SET nombre = EXCLUDED.nombre, "
                    "puntos_acumulados = EXCLUDED.puntos_acumulados;",
                ),
                {
                    "nombre": "Camilo Perez",
                    "telefono_whatsapp": "3012345678",
                    "puntos_acumulados": 65,
                },
            )

            conn.execute(
                text(
                    "INSERT INTO clientes_fidelizacion "
                    "(nombre, telefono_whatsapp, puntos_acumulados) "
                    "VALUES (:nombre, :telefono_whatsapp, :puntos_acumulados) "
                    "ON CONFLICT (telefono_whatsapp) DO UPDATE "
                    "SET nombre = EXCLUDED.nombre, "
                    "puntos_acumulados = EXCLUDED.puntos_acumulados;",
                ),
                {
                    "nombre": "Monica Salazar",
                    "telefono_whatsapp": "3023456789",
                    "puntos_acumulados": 180,
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

        print("Migracion aplicada correctamente: clientes, ventas, proveedores y gastos normalizados.")
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
