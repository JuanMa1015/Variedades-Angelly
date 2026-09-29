# Reglas de trabajo para asistentes/agentes

Reglas acordadas con el dueño del repositorio. NO negociables.

## Git y despliegue

- Nunca commitear ni pushear directo a `main`. Todo trabajo va en una rama
  con nombre descriptivo (`feat/...`, `fix/...`, `chore/...`, `refactor/...`,
  `docs/...`). El dueño revisa y aprueba los Pull Requests desde GitHub.
- Nada delicado sin permiso explícito previo, incluyendo (no limitado a):
  - Push a `main` o merge a `main`.
  - Force push o reescritura de historia.
  - Migraciones ejecutadas contra la base de datos de producción (Neon).
  - Cambios de variables de entorno o configuración de Vercel/Neon.
  - Borrado de datos, ramas o archivos en el remoto.

## Verificación antes de proponer merge

Usa la skill `verify` (cubre backend + frontend). Manualmente:

- Backend (desde `apps/api`, usando el venv local):

  ```powershell
  apps\api\.venv\Scripts\python.exe -m pytest -q
  apps\api\.venv\Scripts\python.exe -m behave features/
  ```

- Frontend (desde `apps/web`): `npm run lint`, `npm run test`, `npm run build`.

## Entorno

- Windows PowerShell. El venv del backend vive en `apps/api/.venv`.
- `connection.py` hace `load_dotenv()` (busca `.env` en `apps/api` y luego en la
  raíz del monorepo). Al correr `alembic` o scripts locales, fijar siempre
  `DATABASE_URL` explícito para no apuntar a la base de datos de producción.
- `main.py` en `APP_ENV=development|test` ejecuta `create_all` + `ALTER TABLE`
  al arrancar; en `production` salta esa lógica y solo aplica Alembic
  (ver `scripts/release_api.sh`, que es el ENTRYPOINT del contenedor).
- El frontend lee el `.env` de la raíz del monorepo (`envDir` en
  `apps/web/vite.config.js`). Solo las variables con prefijo `VITE_` se exponen
  al cliente.

## Contexto del proyecto

"Variedades Angelly": sistema de punto de venta y administración para una tienda
(ventas, cartera/fiado, inventario, proveedores, facturas de compra, gastos,
fidelización, caja y auditoría).

- Monorepo: `apps/api` (FastAPI + SQLAlchemy 2 + Alembic + pytest/behave),
  `apps/web` (React 19 + Vite + Tailwind + Vitest), `infra/` (Docker),
  `.github/workflows` (CI + CD), `scripts/`.
- Backend con arquitectura hexagonal (DDD-lite):
  `src/domain` (entidades + enums + repos abstractos),
  `src/application` (servicios de caso de uso),
  `src/api` (routers + schemas + dependencias),
  `src/infrastructure` (modelos ORM + repos SQLAlchemy + conexión),
  `src/auth` (JWT HS256 + bcrypt, rotación de refresh tokens con blacklist).
- Despliegue: Neon (PostgreSQL), Vercel (frontend). La CI publica imágenes
  Docker a `ghcr.io`; el backend se sirve vía Docker/nginx.
- Python objetivo: 3.11 (`backend.Dockerfile` y CI). Node: 20 (CI).
- Roles: `superadmin`, `admin`, `vendedor` (en `src/domain/enums.py` están en
  mayúsculas, pero `src/api/dependencies.py` los normaliza a minúsculas).
- Seguridad relevante: el CSRF exige el header `X-Requested-With: XMLHttpRequest`
  en peticiones de escritura (excepto `login`, `refresh`, `health`, `docs`,
  `openapi.json` y `/uploads`). Auth acepta Bearer o cookie httpOnly.
- Hay dos flujos de "fiado" distintos: cartera (`clientes` + `abonos_cartera`)
  y tienda (`clientes_fiado_tienda` + `abonos_tienda`). No mezclarlos.

## Notas útiles

- El conocimiento detallado (modelo de datos, flujos, endpoints, seguridad,
  gotchas) está en [`memory.md`](memory.md). Léelo antes de tocar el modelo de
  datos o los flujos de fiado.
- `README.md` cubre instalación, troubleshooting y roles.
- `scripts/` tiene utilidades: `backup_db.ps1` (dump PostgreSQL),
  `check_tests.sh` (pytest + cobertura + behave), `release_api.sh`
  (ENTRYPOINT del backend: `alembic upgrade head` + `uvicorn`).
- `docs/INFORME_TESTING.md` resume el estado de pruebas del proyecto.

## Skills disponibles

Skills funcionales de opencode en `.opencode/skills/`:

- **verify** — correr la verificación completa (tests backend + lint/test/build frontend).
- **migrar-base-datos** — generar y aplicar migraciones Alembic con `DATABASE_URL` explícito.
- **backup-db** — generar un dump comprimido de la base de datos (`scripts/backup_db.ps1`).
