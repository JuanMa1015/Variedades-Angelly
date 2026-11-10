---
name: migrar-base-datos
description: Use when the user asks to create, generate, or apply Alembic migrations ("migración", "migrate", "alembic", "agrega una columna", "cambia el esquema"). Also use when tests/test_alembic_drift.py fails because models and migrations diverged.
---

# Migraciones de base de datos

Genera y aplica migraciones Alembic sobre `apps/api`.

## Regla de oro: fija `DATABASE_URL` explícitamente

`src/infrastructure/database/connection.py` hace `load_dotenv()` y resuelve el
`.env` de la raíz del monorepo, que normalmente apunta a **Neon producción**.
Si corres Alembic sin fijar la variable, estás a un comando de mutar la base de
producción.

Siempre exporta `DATABASE_URL` en la misma invocación:

```powershell
$env:DATABASE_URL = "postgresql+psycopg2://usuario:pass@localhost:5432/db_local"; Set-Location apps\api; ..\..\apps\api\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
```

Para **aplicar** migraciones contra Neon (producción) se requiere permiso
explícito del dueño. Para generarlas no hace falta tocar la BD.

## Ver el estado actual

```powershell
Set-Location apps\api
$env:DATABASE_URL = "<tu BD local>"; ..\..\apps\api\.venv\Scripts\python.exe -m alembic -c alembic.ini current
..\..\apps\api\.venv\Scripts\python.exe -m alembic -c alembic.ini history
```

## Generar una migración

Después de tocar `src/infrastructure/database/models.py`:

```powershell
Set-Location apps\api
$env:DATABASE_URL = "<tu BD local>"; ..\..\apps\api\.venv\Scripts\python.exe -m alembic -c alembic.ini revision --autogenerate -m "descripcion corta"
```

## Aplicar migraciones

```powershell
$env:DATABASE_URL = "<tu BD local>"; Set-Location apps\api; ..\..\apps\api\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
```

## Gotchas

- **Historia con ramas paralelas**: existe `bef1fe795a51_merge_heads.py`. Si
  `alembic heads` devuelve más de un head, genera una revisión de merge; no
  borres la revisión de merge existente.
- **SQLite vs PostgreSQL**: los tests usan SQLite en memoria
  (`sqlite+pysqlite://` con `StaticPool`), pero producción es PostgreSQL.
  `--autogenerate` contra SQLite puede generar tipos que no sirven en Postgres
  (p. ej. `VARCHAR` sin longitud). Revisa el archivo generado.
- **`APP_ENV` importa**: en `development`/`test`, `src/main.py` ejecuta
  `create_all` + `ALTER TABLE` al arrancar, así que tu schema local puede quedar
  desalineado con las migraciones sin que te des cuenta. Para validar la
  realidad, ejecútalo con `APP_ENV=production` (solo Alembic) o rely en la
  skill `verify`.
- **CHECK constraints**: existen muchos `ck_*` (precios no negativos, stock no
  negativo, cantidades > 0, montos > 0). `main.py` los traduce a mensajes en
  español al recibir un `IntegrityError`. Si agregas una constraint, actualiza
  también el diccionario de `_extract_integrity_detail` en `src/main.py`.
- **Drift**: `tests/test_alembic_drift.py` falla si los modelos y el schema
  Alembic divergen. Es la señal de que falta una migración.
