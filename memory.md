# memory.md — Conocimiento detallado de Variedades Angelly

Sistema de punto de venta y administración para una tienda. Este documento es
la referencia técnica profunda: modelo de datos, flujos, endpoints, seguridad y
gotchas. Para instalación y troubleshooting ver `README.md`.

---

## 1. Arquitectura

### Monorepo

| Ruta | Contenido |
|------|-----------|
| `apps/api` | FastAPI + SQLAlchemy 2 + Alembic + pytest/behave |
| `apps/web` | React 19 + Vite 7 + Tailwind + Vitest |
| `infra/` | Dockerfiles, docker-compose, nginx |
| `.github/workflows/` | `backend-ci.yml` (CI), `cd.yml` (CD a ghcr.io) |
| `scripts/` | `release_api.sh`, `check_tests.sh`, `backup_db.ps1` |

### Capas del backend (hexagonal / DDD-lite)

```
src/domain/          entidades puras + enums + puertos de repositorio
src/application/     casos de uso (DashboardService, ventas_service)
src/api/             routers, schemas Pydantic, dependencies, limiter
src/infrastructure/  modelos ORM, conexión, repositorios SQLAlchemy
src/auth/            JWT HS256, bcrypt, bootstrap, password_policy, blacklist
```

Regla de dependencia: `api → application → domain`. `infrastructure` implementa
los puertos declarados en `domain/repositories/`. `domain` no importa nada de
SQLAlchemy ni de FastAPI.

---

## 2. Modelo de datos

Definido en `src/infrastructure/database/models.py`. Todas las fechas son
`DateTime(timezone=False)` y se llenan con `_utcnow_naive()` (UTC naive).

### Identidad y roles

**`usuarios`**
| columna | tipo | notas |
|---------|------|-------|
| `id` | int PK | |
| `username` | str(50) unique, not null | |
| `password_hash` | str(255) not null | bcrypt |
| `rol` | str(20) not null | `superadmin` / `admin` / `vendedor` |
| `activo` | bool default True | borrado lógico |

### Catálogos

**`productos`**
| columna | tipo | notas |
|---------|------|-------|
| `id` | int PK | |
| `nombre` | str(120) unique not null | |
| `codigo_barras` | str(64) unique nullable | captura por scanner |
| `precio_costo` | float not null | |
| `precio_venta` | float not null | |
| `catalogo` | str(20) default `tienda` | `tienda` o `cartera` |
| `stock_actual` | int default 0 | |
| `stock_minimo` | int default 0 | `stock_critico` = `stock_actual <= stock_minimo` |
| `activo` | bool default True | |
| `imagen_url` | str(500) nullable | |
| `proveedor_id` | FK → `proveedores.id` nullable | |

**`proveedores`**: `id`, `nombre` (unique), `contacto`, `telefono`, `activo`.

### Clientes — **tres sistemas distintos, no los mezcles**

**A) Cartera (admin) — `clientes`**
| columna | tipo | notas |
|---------|------|-------|
| `id` | int PK | |
| `nombre` | str(120) not null | |
| `documento` | str(30) unique nullable | |
| `telefono_whatsapp` | str(25) nullable | |
| `limite_credito` | float not null | cupo máximo |
| `deuda_total` | float default 0 | saldo vigente |
| `activo` | bool | |

**B) Fiado de tienda (vendedor) — `clientes_fiado_tienda`**
| columna | notas |
|---------|-------|
| `id`, `nombre`, `telefono_whatsapp` | sin documento, **sin** `limite_credito` |
| `deuda_total` | float default 0 |
| `activo` | bool |

> No tiene cupo de crédito: el fiado de tienda es libre y se controla solo con
> deuda. La cartera sí valida contra `limite_credito`.

**C) Fidelización — `clientes_fidelizacion`**
| columna | notas |
|---------|-------|
| `id`, `nombre` | |
| `telefono_whatsapp` | **unique**, not null (es la identidad del cliente) |
| `puntos_acumulados` | int default 0 |
| `activo` | bool |

### Ventas

**`ventas`**
| columna | notas |
|---------|-------|
| `id` | PK |
| `creado_por` | str(50) nullable (username del vendedor) |
| `cliente_id` | FK → `clientes.id` nullable (flujo cartera) |
| `cliente_tienda_id` | FK → `clientes_fiado_tienda.id` nullable (flujo tienda) |
| `tipo_fiado` | str(20) nullable — `cartera` o `tienda` |
| `metodo_pago` | str(20) nullable — `efectivo` / `transferencia` |
| `es_fiado` | bool default False |
| `total` | float not null |
| `saldo_pendiente` | float default 0 |
| `fecha` | datetime |

**`detalle_ventas`**: `id`, `venta_id` FK, `producto_id` FK, `nombre_producto`
(**copia del nombre, no FK al nombre**), `cantidad`, `precio_unitario`,
`subtotal`.

> `nombre_producto` y `precio_unitario` se desnormalizan a propósito: el recibo
> histórico debe reflejar lo que se vendió, no el nombre/precio actual del
> producto.

### Abonos — **dos tablas paralelas**

| Cartera | Tienda |
|---------|--------|
| `abonos_cartera.cliente_id` → `clientes.id` | `abonos_tienda.cliente_id` → `clientes_fiado_tienda.id` |

Ambas: `monto`, `metodo_pago`, `saldo_cliente` (saldo **después** del abono),
`referencia`, `fecha`.

> El mismo nombre de columna `cliente_id` apunta a **tablas distintas** en cada
> una. Un error aquí cruza los dos flujos de fiado.

### Compras

**`pedidos_proveedor`**: `id`, `proveedor_id` FK, `descripcion`,
`monto_estimado`, `estado` (default `enviado`), `creado_por`, `aprobado_por`,
`fecha_creacion`, `fecha_resolucion`.

**`facturas_compra`**: `id`, `proveedor_id` FK, `creado_por`, `subtotal`,
`total_iva` (default 0), `total_factura`, `numero_factura` (str(20) nullable —
nullable a propósito, las facturas internas pueden no tener número),
`encomienda` (default 0), `porcentaje_ganancia` (default **0.70**), `fecha_creacion`.

**`factura_compra_detalles`**: `id`, `factura_id` FK, `producto_id` FK,
`nombre_producto`, `cantidad`, `aplica_iva` (bool default False),
`precio_unitario`, `precio_total`, `precio_venta_sugerido` (nullable),
`ganancia_estimada` (nullable).

> `porcentaje_ganancia` = 0.70 significa que el precio de venta sugerido se
> calcula como `precio_unitario / 0.70` (margen sobre costo del 70% ⇒ markup
> ~42.8%). Verifica la fórmula real en el router antes de asumir.

### Operación

**`gastos`**: `id`, `categoria` (str(50) — ver `CategoriaGasto`: `SERVICIOS`,
`PROVEEDORES`, `NOMINA`, `OTROS`), `descripcion`, `monto`, `fecha`,
`registrado_por`.

**`cierres_caja`**: `id`, `usuario`, `fecha_apertura`, `fecha_cierre` (nullable =
caja abierta), `monto_inicial`, `monto_ventas_efectivo`,
`monto_ventas_transferencia`, `monto_gastos`, `monto_efectivo_real`,
`esperado_vs_real`, `estado`, `observaciones`, `monto_cierre`, `abierto_por`,
`cerrado_por`.

Fórmulas de la entidad de dominio `src/domain/caja.py`:
```
total_ingresos  = monto_ventas_efectivo + monto_ventas_transferencia
saldo_esperado  = monto_inicial + total_ingresos - monto_gastos
esta_abierta    = fecha_cierre is None
```

**`auditorias`**: `id`, `modulo`, `entidad`, `entidad_id`, `accion`, `detalle`,
`usuario`, `fecha`.

**`refresh_token_blacklist`**: `jti` (PK, Text), `expires_at` (index),
`created_at`. Se purga al arrancar: `DELETE WHERE expires_at < NOW()`.

---

## 3. Flujos

### 3.1 Venta POS (vendedor)

`POST /api/ventas`

Payload típico (fiado de tienda):

```json
{
  "cliente_tienda_id": 12,
  "items": [{ "producto_id": 3, "cantidad": 2 }],
  "es_fiado": true,
  "fiado_origen": "tienda",
  "metodo_pago": "efectivo"
}
```

Efectos:
1. Valida stock de cada producto (`stock_actual >= cantidad`).
2. Crea `ventas` + `detalle_ventas`, descontando `precio_unitario` **snapshot**.
3. Decrementa `productos.stock_actual`.
4. Si `es_fiado`, incrementa `deuda_total` del cliente correspondiente y deja
   `saldo_pendiente` en la venta.
5. Si la venta es de un cliente de fidelización, acumula puntos.

### 3.2 Cartera (admin)

- `GET/POST/PATCH/DELETE /api/cartera/clientes`
- `POST /api/cartera/ventas` — venta a crédito, valida contra `limite_credito`
- `POST /api/cartera/clientes/{cliente_id}/abonos` — reduce `deuda_total`
- `GET /api/cartera/resumen` — totales de cartera
- `GET /api/cartera/clientes` y `GET /api/clientes/cartera` — paginado

### 3.3 Fiado de tienda (vendedor)

- `GET/POST/PATCH/DELETE /api/clientes/tienda-fiado`
- `GET /api/clientes/tienda/resumen`
- `GET /api/clientes/tienda/cobro` — clientes con deuda para cobranza
- `POST /api/clientes/tienda/{cliente_id}/abonos`
- `GET /api/clientes/tienda/{cliente_id}/movimientos`

### 3.4 Fidelización

- Alta/edición/baja: **solo admin** (`POST /api/fidelizacion/clientes` con
  vendedor → 403).
- Consulta: vendedor puede leer.
- `POST /api/fidelizacion/clientes/{cliente_id}/canjear-bono` — descuenta puntos.

### 3.5 Caja

- `GET /api/caja/estado` — caja abierta actual
- `POST /api/caja/apertura` — abre turno
- `POST /api/caja/cierre` — cierra turno, calcula `esperado_vs_real`
- `GET /api/caja` — historial
- La entidad de dominio **rechaza** cerrar dos veces (`ValueError` si
  `fecha_cierre is not None`).

### 3.6 Compras

Pedidos: `GET/POST/PATCH/DELETE /api/proveedores/pedidos`
Facturas: `GET/POST/PATCH/DELETE /api/facturas-compra` (además
`/api/facturas-compra/paginadas`). Al crear una factura de compra se puede
actualizar el `precio_venta` del producto y calcular `precio_venta_sugerido` /
`ganancia_estimada` según `porcentaje_ganancia`.

### 3.7 Superadmin

`/api/superadmin/*` — usuarios (vendedores y admins), productos, proveedores,
auditorías, informes, caja, facturas. **Ruta por rol en el frontend: solo
superadmin.**

### 3.8 Exportación CSV

`GET /api/export/productos`, `/api/export/ventas`, `/api/export/gastos`.

---

## 4. Seguridad

### Autenticación

- JWT HS256. Access token (`type: "access"`, default 8 h) y refresh token
  (`type: "refresh"`, 30 días, con `jti`).
- Passwords con bcrypt.
- `src/api/dependencies.py:get_current_user` acepta **Bearer** o **cookie
  httpOnly** `access_token` (prioriza el header Bearer).
- Logout rota el refresh: el `jti` se inserta en `refresh_token_blacklist` y un
  refresh con `jti` revocado se rechaza.
- `src/auth/password_policy.py` valida contraseñas; `PWNED_PASSWORD_CHECK=true`
  consulta HIBP al crear/editar usuarios.
- Bootstrap: `src/auth/bootstrap.py` siembra superadmin/admin/vendedor si
  `AUTH_BOOTSTRAP_ENABLED` está activo y el username no existe. Por defecto se
  activa solo en `development`/`test` — **en producción hay que habilitarlo
  explícitamente y luego rotar las contraseñas.**

### CSRF

Middleware en `src/main.py`. En peticiones de escritura (`POST`, `PUT`,
`PATCH`, `DELETE`) exige el header `X-Requested-With: XMLHttpRequest`.

Exentos (`_CSRF_EXEMPT_PREFIXES`):
`/api/auth/login`, `/api/auth/refresh`, `/health`, `/docs`, `/openapi.json`,
`/uploads`.

> En `APP_ENV=test` el middleware se salta por completo.

El frontend lo cumple solo: `apps/web/src/api/httpClient.js` inyecta el header
en cada request y en `apiUpload`.

### Roles

`RolUsuario` (en `src/domain/enums.py`) usa **mayúsculas**:
`SUPERADMIN`, `ADMIN`, `VENDEDOR`, `TRABAJADOR` (retrocompat).

`src/api/dependencies.py:_normalize_role` convierte a **minúsculas** y solo
reconoce `superadmin`, `admin`, `vendedor`; cualquier otro valor (incluido
`TRABAJADOR`) devuelve `""` y termina en 401.

`require_roles(...)` da acceso total a `superadmin` siempre.

Matriz de rutas del frontend (`apps/web/src/App.jsx`):

| Rol | Rutas |
|-----|-------|
| `superadmin` | `/admin/:moduleKey` + todo lo de admin y vendedor |
| `admin` | `/cartera/*` (dashboard, clientes, venta, productos, cobrar) |
| `vendedor` | `/ventas`, `/caja`, `/inventario`, `/proveedores`, `/facturas`, `/fidelizacion`, `/gastos`, `/dashboard`, `/clientes` |

### Headers de seguridad

`SecurityHeadersMiddleware` en `src/main.py` fija `X-Content-Type-Options`,
`X-Frame-Options: DENY`, `X-XSS-Protection`, `Strict-Transport-Security` y un
**CSP dinámico**:

- En `production`: `script-src 'self'` (sin `unsafe-inline`/`unsafe-eval`) +
  `upgrade-insecure-requests`.
- En desarrollo: permite `unsafe-inline`/`unsafe-eval`.
- Si detecta `VITE_GTM_ID`, `VITE_GA_MEASUREMENT_ID` o `VITE_PLAUSIBLE_*` en
  el entorno, agrega automáticamente los hosts de `script-src`, `connect-src`,
  `img-src` y `frame-src` correspondientes.
- Se puede sobreescribir con `CSP_SCRIPT_SRC`, `CSP_CONNECT_SRC`, `CSP_IMG_SRC`.

> El CSP lo emite el **backend**, pero las variables se leen del entorno del
> backend. Si activas GTM/Plausible, asegúrate de que las mismas variables
> existan donde corre la API, o los scripts se bloquearán.

### Rate limiting

`slowapi` + `SlowAPIMiddleware`. Login limitado por `LOGIN_RATE_LIMIT`
(default `10/minute`).

### Manejo de errores

Handlers globales en `src/main.py`:
- `RequestValidationError` / `ValidationError` → 422 con detalle por campo
- `IntegrityError` → 409, con `_extract_integrity_detail` traduciendo cada
  CHECK constraint (`ck_*`) a un mensaje en español
- `StarletteHTTPException` → su status
- `Exception` → 500; si es `ValueError` expone el mensaje (los errores de
  dominio son `ValueError`)

Todos pasan por `_cors_response`, que reinyecta headers CORS para que el
frontend pueda leer el error.

---

## 5. Entorno

### Variables

Plantilla canónica: `.env.example` (raíz). El `.env` real **no** se versiona.

| Variable | Dónde | Para qué |
|----------|-------|----------|
| `DATABASE_URL` | backend | PostgreSQL. `connection.py` convierte `postgresql://` → `postgresql+psycopg2://` |
| `APP_ENV` | backend | `development` / `test` / `production`. En prod solo Alembic |
| `JWT_SECRET_KEY` | backend | **obligatoria**; la app no arranca sin ella |
| `JWT_EXPIRE_MINUTES` | backend | default 480 (8 h) |
| `JWT_REFRESH_EXPIRE_DAYS` | backend | default 30 |
| `AUTH_BOOTSTRAP_ENABLED` | backend | seeds de usuarios |
| `AUTH_{SUPERADMIN,ADMIN,SELLER}_{USERNAME,PASSWORD}` | backend | credenciales semilla |
| `PWNED_PASSWORD_CHECK` | backend | consulta HIBP |
| `LOGIN_RATE_LIMIT` | backend | default `10/minute` |
| `CORS_ALLOW_ORIGINS` | backend | lista separada por comas |
| `CORS_ALLOW_ORIGIN_REGEX` | backend | default `.*\.vercel\.app$` |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` / `DB_POOL_RECYCLE` | backend | 5 / 10 / 3600 |
| `CSP_SCRIPT_SRC` / `CSP_CONNECT_SRC` / `CSP_IMG_SRC` | backend | override del CSP |
| `VITE_API_URL` | frontend | base URL de la API |
| `VITE_COBRO_*` | frontend | datos de cobro mostrados al cliente |
| `VITE_SITE_URL`, `VITE_CONTACTO_*` | frontend | páginas legales |
| `VITE_PLAUSIBLE_SCRIPT_ID`, `VITE_PLAUSIBLE_DOMAIN`, `VITE_GTM_ID`, `VITE_GA_MEASUREMENT_ID` | ambos | analítica self-managed |

### Dónde se lee el `.env`

- Backend: `connection.py:_resolve_dotenv_path()` busca `apps/api/.env` y luego
  sube hasta encontrar un `.env` en un directorio padre (la raíz del monorepo).
- Frontend: `vite.config.js` fija `envDir` a la raíz del monorepo, así que
  `apps/web/.env` **no** se usa para builds. Solo `VITE_*` se expone al bundle.

### Arranque local

```powershell
# Backend
Set-Location apps\api
& .\.venv\Scripts\Activate.ps1
python -m alembic -c alembic.ini upgrade head
uvicorn src.main:app --reload

# Frontend
Set-Location apps\web
npm run dev
```

Frontend en `http://localhost:5173` (proxy `/api` y `/uploads` → `127.0.0.1:8000`),
API en `http://127.0.0.1:8000`, Swagger en `/docs`.

### Qué hace el arranque

`lifespan` → `_run_startup_tasks()`:

1. Si `APP_ENV` es `development`/`test`: `Base.metadata.create_all`, luego un
   bucle `ALTER TABLE ... ADD COLUMN` por cada columna faltante, luego suelta el
   `NOT NULL` de `facturas_compra.numero_factura` y sanea
   `clientes_fiado_tienda.deuda_total` nulos.
2. Purga `refresh_token_blacklist` expirados (todos los entornos).
3. `_seed_auth_users()`.

En `production` se salta el paso 1 y solo corre Alembic vía
`scripts/release_api.sh` (ENTRYPOINT del contenedor).

---

## 6. Migraciones

11 revisiones en `apps/api/alembic/versions/`, incluida una de merge de heads
(`bef1fe795a51_merge_heads.py`) por historia con ramas paralelas.

Orden de dependencias (aprox.):

```
7b6c4bd1030a  schema relaciones E4
a1b2c3d4e5f6  tabla cierres_caja
a2b3c4d5e6f7  proveedor_id en productos
f7e8d9c0b1a2  columna activo (usuarios, productos, clientes)
c9a7e5b2f1d4  vendedor en ventas e informes
683d65d3108c  CHECK constraints no-negativos
43ccde97f38f  índices en FK
3e51986812ce  numero_factura en ventas
40e7f89dbe26  numero_factura en facturas_compra
bef1fe795a51  merge heads
```

> Ejecuta `alembic history` para el orden real: los identificadores de revisión
> son **hashes**, no secuencia.

`tests/test_alembic_drift.py` falla si los modelos y el schema Alembic
divergen. Correr la skill `migrar-base-datos` cuando agregues columnas.

---

## 7. Frontend

### Estructura

```
src/
  api/            httpClient.js, carteraApi.js, cajaApi.js
  auth/           AuthContext, PrivateRoute, roleRoutes
  components/     Modal, Sidebar, toasts, ErrorBoundary, useConfirm...
  layouts/        MainLayout
  pages/          Ventas, Inventario, Cartera, Caja, Proveedores, Facturas,
                  Fidelizacion, ClientesTienda, Gastos, Dashboard, Admin,
                  Login, legales, 404
  hooks/          usePageTitle, ...
  utils/          analytics.js
```

### `httpClient.js`

- Base URL: `import.meta.env.VITE_API_URL ?? ''` (vacío = mismo origen, útil
  detrás del proxy de Vercel o nginx).
- Cache en memoria de **GETs** con TTL de 10 s; se invalida al hacer cualquier
  request no-GET.
- Reintenta hasta 2 veces con backoff en 502/503/504 y errores de red.
- Ante un 401 hace un único refresh compartido (`isRefreshing`) y reintenta; si
  falla, dispara el evento `auth:unauthorized` en `window`.
- Envía `credentials: 'include'` (cookie httpOnly) e inyecta
  `X-Requested-With: XMLHttpRequest`.

### Roles y navegación

`getDefaultRouteForRole(user?.role)` en `src/auth/roleRoutes.js` decide a dónde
va el usuario tras login. `PrivateRoute` acepta `allowedRoles`; `superadmin`
pasa siempre.

### Analítica

- `src/utils/analytics.js` (cargado en `main.jsx` vía `initAnalytics()`) inyecta
  Plausible, GTM o GA4 **solo** si sus variables `VITE_*` están definidas.
- `App.jsx` monta `<Analytics />` (Vercel Web Analytics) y `<PageViewTracker />`
  para pageviews en navegación SPA.
- Los dos mecanismos conviven: Vercel Analytics es el default; las variables
  self-managed son alternativas.

### Build

`vite.config.js` define `manualChunks`: `vendor` (react, react-dom,
react-router-dom) y `ui` (lucide-react). `vercel.json` reescribe todo a
`index.html` para el routing de la SPA.

---

## 8. Gotchas conocidos

1. **Dos (tres) sistemas de clientes.** `clientes` (cartera, con cupo),
   `clientes_fiado_tienda` (sin cupo) y `clientes_fidelizacion` (por WhatsApp)
   son independientes. `abonos_cartera` y `abonos_tienda` también. No los
   mezcles ni "unifiques" sin hablar con el dueño: son flujos de negocio
   distintos.
2. **Roles en dos formatos.** `RolUsuario` en mayúsculas, `dependencies.py` en
   minúsculas, y la columna `rol` es texto libre. `TRABAJADOR` existe en el enum
   pero no está soportado por la normalización.
3. **Dominio ≠ persistencia.** `src/domain/usuario.py:Usuario` tiene `email`,
   `nombre_completo` y `fecha_registro` que **no existen** en `UsuarioModel`
   (solo `username`, `password_hash`, `rol`, `activo`). El modelo de dominio es
   más rico que el ORM; no confíes en que se persistan.
4. **`Venta` tiene dos listas.** `src/domain/transaccion.py:Venta` mantiene
   `items` (legacy, con `ItemVenta`) y `detalles` (formal, con `DetalleVenta`).
   `obtener_total()` suma `detalles` si hay, si no `items`. Mantenlas ambas si
   tocas ese código.
5. **`saldo_cliente` es histórico.** En abonos, `saldo_cliente` guarda el saldo
   **después** de aplicar el abono, no el saldo actual del cliente.
6. **`numero_factura` es nullable** a propósito (facturas internas). El
   `ALTER TABLE ... DROP NOT NULL` en el arranque de dev/test existe por esto.
7. **`porcentaje_ganancia` default 0.70** no es "70% de margen sobre el precio
   de venta" sino el factor de markup para calcular el precio de venta sugerido.
8. **`APP_ENV` development muta el schema al arrancar.** Si develops contra una
   BD y editas modelos, se crean columnas con `ALTER TABLE` aunque no exista
   migración. Eso puede desincronizar tu BD local de la de producción.
9. **El CSP lo emite el backend** y depende de variables que afectan al
   frontend. Si los analytics no cargan, revisa el CSP del backend, no el
   frontend.
10. **`_run_startup_tasks` no es idempotente en costuras.** Corre DDL
    (`ALTER TABLE`) y DML (purga de blacklist) sin transacción única; una caída
    a mitad puede dejar el schema a medias.
11. **`src/api/routers/` está partido por módulo, no por recurso.** Hay 19
    routers (`clientes_cartera_clientes`, `clientes_tienda_cobros`,
    `ventas_fidelizacion`, ...) registrados uno a uno en `main.py`. Al agregar un
    router, súmbrelo a `main.py` o no se expone (ya pasó con el upload: PR #20).
12. **Scripts sueltos en `apps/api/`**: `_calc.py` y `_schema_check.py` son
    scripts de debug, no código de la app. No los importes ni los borres sin
    preguntar.
13. **`docs/INFORME_TESTING.md`** tiene el estado de pruebas del proyecto, pero
    las cifras citadas en el `README` (37/37, 12/12) están desactualizadas: hoy
    el frontend tiene 61 tests y el backend corre `pytest` + `behave`.

---

## 9. Comandos de referencia

```powershell
# Verificación completa (skill: verify)
apps\api\.venv\Scripts\python.exe -m pytest -q          # desde apps/api
apps\api\.venv\Scripts\python.exe -m behave features/   # desde apps/api
npm run lint; npm run test; npm run build                # desde apps/web

# Cobertura + BDD
scripts\check_tests.sh   # POSIX; en Windows corre pytest y behave por separado

# Migraciones (siempre con DATABASE_URL explícito)
$env:DATABASE_URL = "<BD local>"
apps\api\.venv\Scripts\python.exe -m alembic -c apps\api\alembic.ini upgrade head

# Backup
.\scripts\backup_db.ps1
```

