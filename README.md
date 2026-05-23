# Variedades-Angelly

Sistema full-stack para ventas, cartera, inventario, proveedores, gastos, fidelización y auditoría. El repositorio ya está organizado como monorepo de producción.

## Equipo

- Juan Manuel Londoño Gonzalez
- Danilo Tangarife Bustamante
- Gilar Valentina Castaño


## Estructura Actual

```
Variedades-Angelly/
├── apps/
│   ├── api/        # FastAPI + SQLAlchemy + Alembic + pytest/behave
│   └── web/        # React + Vite + Tailwind + Vitest
├── infra/          # docker-compose, Dockerfiles, nginx
├── docs/           # documentación del proyecto
├── scripts/        # utilidades de automatización
├── .github/        # CI/CD
├── .env.example    # plantilla canónica de variables
└── README.md
```

## Stack

### Backend
- FastAPI 0.135.2
- SQLAlchemy 2.0.48
- Pydantic 2.12.5
- PostgreSQL en producción / SQLite en CI y tests
- JWT (HS256) + bcrypt

### Frontend
- React 19
- Vite 7.3.1
- Tailwind CSS
- Vitest + Testing Library

### Infra y automatización
- Alembic para migraciones
- Docker / Docker Compose
- GitHub Actions para CI

## Entorno

La plantilla canónica está en [`.env.example`](.env.example). Las variables reales se usan por capa:

- [apps/api/.env](apps/api/.env) para backend
- [apps/web/.env](apps/web/.env) para frontend

Ejemplo de valores frontend:

```env
VITE_API_URL=http://127.0.0.1:8000
VITE_COBRO_BANCO=
VITE_COBRO_TIPO_CUENTA=
VITE_COBRO_NUMERO_CUENTA=
VITE_COBRO_TITULAR_CUENTA=
VITE_COBRO_NEQUI_NUMERO=
VITE_COBRO_NEQUI_TITULAR=
```

## Instalación

### Requisitos
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+ o Neon Cloud

### Backend

```powershell
Set-Location apps/api
python -m venv .venv
& .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Frontend

```powershell
Set-Location apps/web
npm ci
```

## Ejecución local

### Backend

```powershell
Set-Location apps/api
& .\.venv\Scripts\Activate.ps1
python -m alembic -c alembic.ini upgrade head
uvicorn src.main:app --reload
```

### Frontend

```powershell
Set-Location apps/web
npm run dev
```

### URLs
- Frontend: http://localhost:5173
- Backend API: http://127.0.0.1:8000
- Swagger: http://127.0.0.1:8000/docs

## Validación

### Backend

```powershell
Set-Location apps/api
python -m pytest -q
```

### Frontend

```powershell
Set-Location apps/web
npm run lint
npm run test
npm run build
```

### Docker

```powershell
docker compose -f infra/docker-compose.yml up --build
```

## Base de datos

### Instalar dependencias
```bash
pip install -r requirements.txt
```

### Aplicar migraciones
```bash
cd apps/api
alembic upgrade head
```

### Verificar estado
```bash
alembic current
alembic history --verbose
```

## CI / CD

El workflow de GitHub Actions vive en [.github/workflows/backend-ci.yml](.github/workflows/backend-ci.yml) y ejecuta:
- backend tests y drift de Alembic
- frontend lint, tests y build


### Roles y Permisos

**Admin** (`role: admin`)
- Acceso completo a todas las funcionalidades
- Crear/editar/eliminar todos los registros
- Ver reportes y auditoría

**Vendedor** (`role: vendedor`)
- Registrar ventas (POS + cartera)
- Consultar inventario
- Ver cartera de clientes
- Acceso limitado a otros módulos

---

## Documentación de APIs

### 1. Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Autenticar con usuario/contraseña, retorna JWT |

**Ejemplo Request:**
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "angelly_admin",
    "password": "cambiame123"
  }'
```

---

### 2. Productos (Inventario)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/productos` | Listar todos los productos |
| POST | `/api/productos` | Crear nuevo producto |
| PATCH | `/api/productos/{producto_id}` | Editar datos del producto |
| DELETE | `/api/productos/{producto_id}` | Eliminar producto |
| PATCH | `/api/productos/{producto_id}/stock` | Ajustar stock (delta) |
| PATCH | `/api/productos/{producto_id}/precio_venta` | Actualizar precio venta |

**Ejemplo - Crear Producto:**
```bash
curl -X POST http://127.0.0.1:8000/api/productos \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Arroz Diana 500g",
    "descripcion": "Arroz blanco de calidad",
    "precio_costo": 2800,
    "precio_venta": 3500,
    "stock": 50,
    "stock_minimo": 10
  }'
```

---

### 3. Clientes & Cartera

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/clientes` | Listar todos los clientes |
| GET | `/api/cartera/clientes` | Clientes en cartera (paginado) |
| POST | `/api/cartera/clientes` | Crear nuevo cliente |
| PATCH | `/api/cartera/clientes/{cliente_id}` | Actualizar cliente |
| DELETE | `/api/cartera/clientes/{cliente_id}` | Eliminar cliente |
| GET | `/api/clientes/{cliente_id}/movimientos` | Historial de movimientos |
| POST | `/api/cartera/clientes/{cliente_id}/abonos` | Registrar abono/pago |
| POST | `/api/cartera/ventas` | Registrar venta en cartera |

---

### 4. Ventas & Fidelización

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/ventas` | Registrar venta (POS) |
| GET | `/api/dashboard/resumen` | Resumen de ventas del día |
| GET | `/api/clientes/tienda-fiado` | Clientes tienda-fiado |
| POST | `/api/clientes/tienda-fiado` | Crear cliente tienda-fiado |
| GET | `/api/fidelizacion/clientes` | Clientes fidelización |
| POST | `/api/fidelizacion/clientes/{cliente_id}/canjear-bono` | Canjear bono |

---

### 5. Operaciones (Proveedores & Gastos)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/proveedores` | Listar proveedores |
| POST | `/api/proveedores` | Crear proveedor |
| PATCH | `/api/proveedores/{proveedor_id}` | Actualizar proveedor |
| DELETE | `/api/proveedores/{proveedor_id}` | Eliminar proveedor |
| GET | `/api/proveedores/pedidos` | Listar pedidos |
| POST | `/api/proveedores/pedidos` | Crear pedido |
| GET | `/api/gastos` | Listar gastos operacionales |
| POST | `/api/gastos` | Registrar gasto |

---

### 6. Auditoría

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/auditorias` | Listar registros de auditoría |
| POST | `/api/auditorias` | Crear registro manual |
| PATCH | `/api/auditorias/{auditoria_id}` | Actualizar registro |
| DELETE | `/api/auditorias/{auditoria_id}` | Eliminar registro |

---

## Pruebas

### Unit Tests (pytest)
```powershell
# Ejecutar todos los tests
cd backend
pytest

# Ejecutar con cobertura
pytest --cov=src --cov-report=term-missing

# Ejecutar específico
pytest tests/test_auth_api.py -v

# Modo watch (reinicia al cambiar código)
pytest-watch tests/
```

### BDD (Behave)
```powershell
# Desde raíz del proyecto
behave

# Modo verbose
behave -v

# Solo features específicas
behave backend/features/clientes.feature
```

**Estados Esperados:**
- [OK] pytest: 37/37 tests pasando
- [OK] behave: 12/12 escenarios pasando


---

## Troubleshooting

### 1. "RuntimeError: JWT_SECRET_KEY no está definido"
**Causa**: Variable de entorno faltante
```bash
# Solución: Agregar a .env
JWT_SECRET_KEY=angelly-local-jwt-secret-2026-very-strong
```

### 2. "Connection refused a 127.0.0.1:8000"
**Causa**: Backend no está corriendo
```bash
# Solución: Iniciar backend
cd backend
uvicorn src.main:app --reload
```

### 3. Login se queda cargando infinitamente
**Causa**: Proxy de Vite no configurado
```bash
# Solución: Verificar vite.config.js tiene:
proxy: {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  }
}
```

### 4. "No default auth users created"
**Causa**: `AUTH_BOOTSTRAP_ENABLED=false` o falta `.env`
```bash
# Solución: Agregar a .env
APP_ENV=development
AUTH_BOOTSTRAP_ENABLED=true
AUTH_ADMIN_USERNAME=angelly_admin
AUTH_ADMIN_PASSWORD=cambiame123
```

### 5. Errores de CORS
**Causa**: Frontend URL no autorizada en backend
```bash
# Check: main.py CORS config incluye localhost:5173 y 5174
```

### 6. "ModuleNotFoundError: No module named 'src'"
**Causa**: Python path incorrecto
```bash
# Solución: Estar en directorio backend
cd backend
python -m uvicorn src.main:app --reload
```

---

## Guía de Desarrollo

### Estructura de commit

Usar formato convencional:
```
feat: descripción breve de feature
fix: solución de bug
refactor: cambio de código sin afectar funcionalidad
test: cambios en tests
docs: documentación
```

Ejemplo:
```
git commit -m "feat: agregar endpoint de reportes montlies"
```

### Flujo de trabajo

1. Crear rama: `git checkout -b feat/nombre-feature`
2. Implementar cambios
3. Pasar tests: `pytest` y `behave`
4. Commit: `git commit -m "feat: ..."`
5. Push: `git push origin feat/nombre-feature`
6. Pull Request y review
7. Merge a `main`

### Agregar nuevo endpoint

**Ejemplo: Crear endpoint de reporte**

1. Crear archivo en `backend/src/api/routers/reportes.py`:
```python
from fastapi import APIRouter, Depends
from src.api.dependencies import get_current_user

router = APIRouter(prefix="/api/reportes", tags=["reportes"])

@router.get("/diarios")
async def get_reportes_diarios(current_user = Depends(get_current_user)):
    """Obtener reportes del día"""
    # implementación
    return {}
```

2. Registrar en `backend/src/main.py`:
```python
from src.api.routers.reportes import router as reportes_router
# ...
app.include_router(reportes_router)
```

3. Crear tests en `backend/tests/test_reportes.py`


## Status del Proyecto

| Componente | Estado | Ver |
|-----------|--------|-----|
| Backend API | [OK] Activo | [Swagger](http://127.0.0.1:8000/docs) |
| Frontend | [OK] Activo | http://localhost:5173 |
| Tests Unit | [OK] 37/37 | `pytest` |
| Tests BDD | [OK] 12/12 | `behave` |
| Auth | [OK] JWT + RBAC | `.env` |
| DB | [OK] PostgreSQL | Neon Cloud |

---




## Despliegue

Breve guía para desplegar la aplicación via Docker (self-host) o plataformas serverless (Vercel/Netlify para frontend, backend en un host o serverless con Neon como BD).

- Docker (local / staging):

```powershell
# desde la carpeta raíz del repo
Set-Location infra
docker compose up -d --build
```

- Variables de entorno mínimas (crear en el servicio / panel de la plataforma):

  - `DATABASE_URL` : URL de Postgres/Neon. Ejemplo: `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`
  - `JWT_SECRET_KEY` : clave secreta para firmar JWT (HS256).
  - `APP_ENV` : `production` o `development`.
  - `AUTH_BOOTSTRAP_ENABLED` : `true|false` (habilita seed de usuarios iniciales).
  - `AUTH_SUPERADMIN_USERNAME`, `AUTH_SUPERADMIN_PASSWORD` (solo para bootstrap; no los guardes en el repo si son secretos)
  - `AUTH_ADMIN_USERNAME`, `AUTH_ADMIN_PASSWORD`
  - `AUTH_SELLER_USERNAME`, `AUTH_SELLER_PASSWORD`
  - `CORS_ALLOW_ORIGINS` : dominios permitidos por backend (coma-separados). Ej: `https://mi-app.vercel.app`
  - `VITE_API_URL` : URL pública del backend que debe usar el frontend (p. ej. `https://api.mi-app.com`).
  - `VITE_COBRO_*` : valores públicos para texto de cobro (opcionales).

- Vercel / Netlify (Frontend):

  - Configura `VITE_API_URL` en el panel de variables de entorno de la plataforma.
  - No incluyas secrets sensibles en el cliente; el frontend solo debe exponer URLs públicas.
  - Para builds en Vercel/Netlify, define `NODE_ENV=production` y `VITE_API_URL`.

- Backend en hosting/containers:

  - Configura `DATABASE_URL`, `JWT_SECRET_KEY` y `CORS_ALLOW_ORIGINS` en el entorno del servidor.
  - Si usas Neon, crea una `DATABASE_URL` con los permisos mínimos necesarios.

Recomendación de seguridad:

- No versionar `.env` con secretos. Mantén un `.env.example` en repo.
- Para producción, utiliza el gestor de secretos de la plataforma (Vercel/Netlify env vars, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager o el panel de Neon).
- Evita mantener contraseñas reales en `AUTH_*` dentro del repo; usa un mecanismo de seed seguro y rota las contraseñas.





