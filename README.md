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
