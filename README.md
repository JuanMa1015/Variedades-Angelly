# Variedades-Angelly

> Sistema integrado para gestión de ventas, cartera de crédito, inventario, proveedores, gastos operacionales, programa de fidelización y auditoría en tiendas de barrio.

## � Equipo
## Juan Manuel Londoño Gonzalez 
## Danilo Tangarife Bustamante
## Gilar Valentina Castaño


## 🎯 Visión General

Variedades-Angelly es una aplicación full-stack diseñada para pequeños negocios de barrio. Integra:
- **Punto de Venta (POS)** con soporte para cartera de crédito
- **Gestión de Inventario** con alertas de stock
- **Cartera de Crédito** para clientes recurrentes
- **Sistema de Proveedores** con pedidos y gastos
- **Fidelización** de clientes con programa de bonos
- **Auditoría** completa de operaciones

---

## 🛠 Stack Tecnológico

### Backend
- **Framework**: FastAPI 0.135.2
- **ORM**: SQLAlchemy 2.0.48
- **Validación**: Pydantic 2.12.5
- **Base de Datos**: PostgreSQL (Neon Cloud)
- **Autenticación**: JWT (HS256) + bcrypt

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite 7.3.1
- **Styling**: Tailwind CSS
- **HTTP Client**: Centralizado con interceptores
- **Iconos**: Lucide React

### Testing
- **Unit Tests**: pytest 8.3.5 + pytest-cov
- **BDD**: Behave
- **Coverage Target**: >80%

---

## 💾 Variables de Entorno

Crear archivo `.env` en la raíz del proyecto con:

```env
# Base de Datos
DATABASE_URL=postgresql://user:password@host:port/dbname?sslmode=require

# JWT & Seguridad
JWT_SECRET_KEY=angelly-local-jwt-secret-2026-very-strong
APP_ENV=development

# Bootstrap de usuarios por defecto
AUTH_BOOTSTRAP_ENABLED=true
AUTH_ADMIN_USERNAME=angelly_admin
AUTH_ADMIN_PASSWORD=cambiame123
AUTH_SELLER_USERNAME=vendedor1
AUTH_SELLER_PASSWORD=ventas123
```

**⚠️ Notas Críticas:**
- `JWT_SECRET_KEY` es **obligatorio**; la API no inicia sin él
- Las credenciales se crean automáticamente en el primer inicio si `AUTH_BOOTSTRAP_ENABLED=true`
- Las credenciales demo solo se muestran en frontend en `APP_ENV=development`
- Cambiar `JWT_SECRET_KEY` invalidará todos los tokens existentes

---

## 🚀 Instalación

### Requisitos Previos
- Python 3.10+ (verificar: `python --version`)
- Node.js 18+ (verificar: `npm --version`)
- PostgreSQL 14+ (local o Neon Cloud)

### Backend Setup

```powershell
# 1. Navegar al directorio backend
Set-Location backend

# 2. Crear entorno virtual
python -m venv .venv

# 3. Activar entorno (Windows)
& .\.venv\Scripts\Activate.ps1

# 4. Instalar dependencias
pip install -r requirements.txt

# 5. Aplicar migraciones (si existen)
# python src/infrastructure/database/apply_migration.py
```

### Frontend Setup

```powershell
# 1. Navegar al directorio frontend
Set-Location frontend

# 2. Instalar dependencias
npm install

# 3. Verificar configuración de Vite
# vite.config.js debe tener proxy para /api -> http://127.0.0.1:8000
```

---

## ⚡ Ejecución Local

### Terminal 1: Backend
```powershell
Set-Location backend
& .\.venv\Scripts\Activate.ps1
uvicorn src.main:app --reload
```

**Salida esperada:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Terminal 2: Frontend
```powershell
Set-Location frontend
npm run dev
```

**Salida esperada:**
```
➜ Local: http://localhost:5173/
```

### Acceso
- **Frontend**: http://localhost:5173
- **Backend API**: http://127.0.0.1:8000
- **API Docs Swagger**: http://127.0.0.1:8000/docs

---

## 📁 Estructura del Proyecto

```
Variedades-Angelly/
├── backend/
│   ├── src/
│   │   ├── main.py                    # Composición FastAPI + CORS + routers
│   │   ├── api/
│   │   │   ├── routers/               # 6 routers modulares por dominio
│   │   │   │   ├── auth.py           # Autenticación y login
│   │   │   │   ├── productos.py      # Gestión de inventario
│   │   │   │   ├── clientes_cartera.py  # Crédito y movimientos
│   │   │   │   ├── ventas_fidelizacion.py # Ventas y fidelización
│   │   │   │   ├── operaciones.py    # Proveedores y gastos
│   │   │   │   └── auditorias.py     # Logs de auditoría
│   │   │   └── dependencies.py        # Autenticación compartida
│   │   ├── application/services/      # Lógica de aplicación
│   │   ├── domain/                    # Modelos de dominio
│   │   │   ├── cliente.py
│   │   │   ├── producto.py
│   │   │   ├── usuario.py
│   │   │   ├── transaccion.py
│   │   │   └── enums.py
│   │   ├── auth/
│   │   │   ├── bootstrap.py          # Seed de usuarios por entorno
│   │   │   └── security.py           # JWT + bcrypt
│   │   └── infrastructure/
│   │       ├── database/
│   │       │   ├── models.py         # Modelos SQLAlchemy
│   │       │   ├── connection.py     # Configuración DB
│   │       │   └── seed_db.py        # Datos iniciales
│   │       └── repositories/
│   │           └── sqlalchemy_repository.py
│   ├── tests/                         # Tests unitarios
│   ├── features/                      # Escenarios BDD
│   ├── requirements.txt
│   └── pytest.ini
├── frontend/
│   ├── src/
│   │   ├── main.jsx                   # Entry point
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── httpClient.js         # Cliente HTTP centralizado
│   │   ├── auth/
│   │   │   ├── AuthContext.jsx       # JWT + ciclo de vida
│   │   │   └── PrivateRoute.jsx      # Rutas protegidas
│   │   ├── components/               # Componentes reutilizables
│   │   ├── layouts/
│   │   │   └── MainLayout.jsx        # Layout principal
│   │   └── pages/                    # Páginas por módulo
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Ventas.jsx
│   │       ├── Cartera.jsx
│   │       ├── Inventario.jsx
│   │       ├── Fidelizacion.jsx
│   │       ├── Gastos.jsx
│   │       ├── Proveedores.jsx
│   │       └── Admin.jsx
│   ├── vite.config.js                # Proxy para /api
│   ├── package.json
│   └── tailwind.config.js
├── .env                               # Variables de entorno COMPARTIDAS
├── .gitignore
├── behave.ini
└── README.md
```

---

## 🔐 Autenticación

### Flujo JWT

```
1. Usuario envía credenciales
   POST /api/auth/login
   {
     "username": "angelly_admin",
     "password": "cambiame123"
   }

2. Backend valida y retorna token JWT
   Response 200:
   {
     "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "role": "admin",
     "username": "angelly_admin",
     "expires_in": 28800
   }

3. Frontend almacena token en localStorage
   localStorage.setItem('angelly.auth.token', token)

4. Frontend incluye token en todas las requests
   Authorization: Bearer <token>

5. Backend valida token y autoriza según rol
```

### Ciclo de Vida del Token
- **Duración**: 8 horas (28800 segundos)
- **Almacenamiento**: localStorage del navegador
- **Validación**: En cada request a través del header `Authorization`
- **Token expirado**: Automáticamente limpia sesión y redirige a login

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

## 📡 Documentación de APIs

### 1️⃣ Autenticación

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

### 2️⃣ Productos (Inventario)

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

### 3️⃣ Clientes & Cartera

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

### 4️⃣ Ventas & Fidelización

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/ventas` | Registrar venta (POS) |
| GET | `/api/dashboard/resumen` | Resumen de ventas del día |
| GET | `/api/clientes/tienda-fiado` | Clientes tienda-fiado |
| POST | `/api/clientes/tienda-fiado` | Crear cliente tienda-fiado |
| GET | `/api/fidelizacion/clientes` | Clientes fidelización |
| POST | `/api/fidelizacion/clientes/{cliente_id}/canjear-bono` | Canjear bono |

---

### 5️⃣ Operaciones (Proveedores & Gastos)

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

### 6️⃣ Auditoría

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/auditorias` | Listar registros de auditoría |
| POST | `/api/auditorias` | Crear registro manual |
| PATCH | `/api/auditorias/{auditoria_id}` | Actualizar registro |
| DELETE | `/api/auditorias/{auditoria_id}` | Eliminar registro |

---

## 🧪 Pruebas

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
- ✅ pytest: 37/37 tests pasando
- ✅ behave: 12/12 escenarios pasando

---

## 🐛 Troubleshooting

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

## 🛣 Guía de Desarrollo

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


## 📊 Status del Proyecto

| Componente | Estado | Ver |
|-----------|--------|-----|
| Backend API | ✅ Activo | [Swagger](http://127.0.0.1:8000/docs) |
| Frontend | ✅ Activo | http://localhost:5173 |
| Tests Unit | ✅ 37/37 | `pytest` |
| Tests BDD | ✅ 12/12 | `behave` |
| Auth | ✅ JWT + RBAC | `.env` |
| DB | ✅ PostgreSQL | Neon Cloud |

---




