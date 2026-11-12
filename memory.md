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
| `precio_costo` | numeric(14,2) not null | |
| `precio_venta` | numeric(14,2) not null | |
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
| `limite_credito` | numeric(14,2) not null | cupo máximo; un fiado no puede superarlo |
| `deuda_total` | numeric(14,2) default 0 | saldo vigente |
| `activo` | bool | |

**B) Fiado de tienda (vendedor) — `clientes_fiado_tienda`**
| columna | notas |
|---------|-------|
| `id`, `nombre`, `telefono_whatsapp` | sin documento, **sin** `limite_credito` |
| `deuda_total` | numeric(14,2) default 0 |
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
| `total` | numeric(14,2) not null |
| `saldo_pendiente` | numeric(14,2) default 0 | fiado de tienda: saldo de ESA venta (total − abono inicial); cartera: deuda del cliente tras la venta |
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
`created_at`. Se purga al arrancar con una fecha UTC (`expires_at < :ahora`).

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
   `saldo_pendiente` en la venta. El fiado de cartera respeta `limite_credito`;
   productos y clientes desactivados se rechazan; toda venta con cobro exige
   `metodo_pago`.
5. Si se envía `cliente_fidelizacion_id`, acumula 1 punto por cada
   `FIDELIZACION_PESOS_POR_PUNTO` (1000) realmente cobrados (en fiado, solo el
   abono inicial) y guarda `puntos_otorgados`; al eliminar la venta se revierten.
6. Editar o eliminar una venta fiada de tienda reajusta la deuda del cliente
   (`src/api/services/deuda.py`); editar/borrar un abono de cartera también.

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
- **Efectivo esperado** = base + ventas en efectivo − gastos (las transferencias no
  están en el cajón). Solo cuenta lo cobrado (`infrastructure/repositories/ingresos.py`):
  un fiado cuenta su abono; las ventas de cartera entran por `abonos_cartera`.
- **Cierre ciego**: mientras la caja está abierta el vendedor recibe
  `saldo_esperado = null`; el superadmin sí lo ve. Al cerrar, la respuesta trae el descuadre.
- Se puede abrir con base $0.
- La entidad de dominio **rechaza** cerrar dos veces (`ValueError` si
  `fecha_cierre is not None`).

### 3.6 Compras

Pedidos: `GET/POST/PATCH/DELETE /api/proveedores/pedidos`
Facturas: `GET/POST/PATCH/DELETE /api/facturas-compra` (además
`/api/facturas-compra/paginadas`, `/api/facturas-compra/config` con `iva_rate`).
Al crear una factura de compra: suma el **stock**, deja el **último costo**
(precio + IVA si aplica) y, solo si la línea trae `actualizar_precio`, cambia el
`precio_venta` (el enviado o el sugerido). `porcentaje_ganancia` es el factor
costo/venta (0.70 = 30 % de margen) y el precio sugerido se redondea hacia
arriba a múltiplos de $50 (`api/services/compras.py`). Eliminar una factura
resta el stock que sumó (409 si ya se vendió). Solo admin/superadmin.

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
- El usuario, su estado `activo` y su **rol se revalidan en BD en cada request**
  (el token solo prueba identidad) y en cada refresh; el `jti` del refresh se
  consume de forma atómica. El login respeta `activo` e iguala tiempos.
- Cookies: `SameSite` por defecto `none` en producción y `lax` en desarrollo;
  `COOKIE_SAMESITE` lo fuerza (usar `lax` si front y API comparten dominio).
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
`PATCH`, `DELETE`):

1. **Origin**: si el navegador envía `Origin`, debe ser el propio host o estar en
   `CORS_ALLOW_ORIGINS` (o casar con `CORS_ALLOW_ORIGIN_REGEX`). Aplica también a
   login/refresh/logout. Sin `Origin` (clientes que no son navegador) se permite.
2. Exige el header `X-Requested-With: XMLHttpRequest`.

Exentos del punto 2 (`_CSRF_EXEMPT_PREFIXES`):
`/api/auth/login`, `/api/auth/refresh`, `/health`, `/docs`, `/openapi.json`,
`/uploads`.

> En `APP_ENV=test` solo se salta el punto 2. En `production` `/docs`,
> `/redoc` y `/openapi.json` no se publican.

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
| `CORS_ALLOW_ORIGIN_REGEX` | backend | opcional; **no** usar `*.vercel.app` (cualquiera registra un subdominio) |
| `COOKIE_SAMESITE` | backend | `lax`/`strict`/`none`; por defecto `none` en producción |
| `TRUST_PROXY_HEADERS` | backend | `false` si la API no está detrás de nuestro proxy (default `true`) |
| `FIDELIZACION_UMBRAL_BONO` / `FIDELIZACION_PESOS_POR_PUNTO` | backend | 100 / 1000 |
| `IVA_RATE` | backend | default `0.19`; el frontend lo lee de `/api/facturas-compra/config` |
| `VITE_CONTACTO_NIT` | frontend | NIT que se imprime en el comprobante del POS |
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
API en `http://127.0.0.1:8000`, Swagger en `/docs` (solo fuera de producción).

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
d4e5f6a7b8c9  dinero a NUMERIC(14,2) (solo PostgreSQL)
e5f6a7b8c9d0  puntos y cliente de fidelización en ventas
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
- Cache en memoria de **GETs** con TTL de 10 s; cualquier request no-GET la vacía
  por completo (una escritura puede cambiar stock, deudas y caja a la vez).
- Solo los **GET** se reintentan (hasta 2 veces, 502/503/504 y errores de red);
  POST/PATCH/DELETE nunca, para no duplicar ventas o abonos.
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
    las cifras citadas en el `README` (37/37, 12/12) están desactualizadas: el
    frontend corre `vitest` y el backend `pytest` + `behave`. Los tests del
    backend usan SQLite en memoria; la CI también corre `ruff` (F, E9).

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

---

## 14. Imágenes, operación y POS (actualización)

- **Las imágenes subidas se guardan en Vercel Blob** cuando `BLOB_READ_WRITE_TOKEN` está definido
  (contrato verificado contra el SDK oficial `@vercel/blob` 2.9: `PUT <BLOB_API_URL>/?pathname=productos/<archivo>`,
  headers `authorization: Bearer`, `x-api-version: 13`, `x-vercel-blob-access: public`, `x-add-random-suffix: 1`;
  `BLOB_API_URL` por defecto `https://vercel.com/api/blob`). **Sin el token se guardan en `/uploads` del
  servidor, que en Render (disco efímero) se borra en cada despliegue o reinicio.** `imagen_url` guarda la URL
  completa de Blob o la ruta relativa `/uploads/...`.
- **Migraciones pendientes:** en producción `/health` devuelve `migraciones: {actual, esperada, al_dia}` y
  `status: "degraded"` si la base no está al día; el arranque también lo deja en el log como `ERROR`.
  Quien despliegue sin Docker debe ejecutar `alembic -c alembic.ini upgrade head` (lo hace `scripts/release_api.sh`).
  Un 500 en una operación que usa columnas nuevas suele significar migraciones sin aplicar.
- Los errores 500 no controlados se registran con su traza (`Error no controlado en <método> <ruta>`).
- **Token de acceso:** el frontend lo envía como `Authorization: Bearer` (en memoria) además de la cookie, para no
  depender de cookies de terceros cuando front y API están en dominios distintos. El refresh sigue usando cookie.
- **POS (`apps/web/src/pages/Ventas*`)**: una sola barra para buscar o escanear (F2; Enter agrega el código o el
  único resultado), tarjetas con foto o icono/iniciales si la imagen falta, ticket con total y botón Cobrar siempre
  visibles (F9), tickets en espera (F4, guardados en `localStorage`), favoritos/frecuentes por equipo, aviso de caja
  cerrada, pago en efectivo vacío = exacto, barra fija en móvil. La lógica de validación/payload está en
  `Ventas/posHelpers.js` y los datos en `Ventas/useVentasData.js`.

---

## 15. Turno de caja, tarjeta y huso horario

- **Turno de caja:** `ventas`, `abonos_cartera`, `abonos_tienda` y `gastos` tienen `caja_id` (FK a `cierres_caja`,
  `ON DELETE SET NULL`). Se asigna solo al insertar (listener `before_insert` al final de `models.py`) si hay una caja
  abierta y la fecha de la operación no es anterior a su apertura. Lo hecho con la caja cerrada queda sin turno.
  Los totales del turno salen de `calcular_metricas` (`api/services/caja_calculos.py`) filtrando por `caja_id`,
  ya no por rango de fechas.
- **Tarjeta ≠ transferencia:** `MetodoPago = efectivo | transferencia | tarjeta`. Nequi se envía como `transferencia`.
  `cierres_caja.monto_ventas_tarjeta`; el dashboard devuelve `pagos_tarjeta`. El efectivo esperado sigue siendo
  base + efectivo − gastos (ni transferencias ni tarjeta están en el cajón).
- **Dashboard:** los pagos por medio incluyen ahora también los abonos de tienda (antes solo los de cartera).
- **Huso horario:** la base guarda UTC sin zona. Los cortes de día/semana/mes del dashboard son a medianoche hora de
  Colombia (`domain/zona_horaria.py`, `APP_UTC_OFFSET_HOURS`, por defecto -5). En el frontend `parseApiDate`
  (`utils/format.js`) toma como UTC las fechas del servidor sin "Z" antes de mostrarlas.
- **Saldar deuda de un cliente de tienda** abre el diálogo de abono con el monto completo para elegir el medio de pago.
- **Comprobante del POS:** se imprime desde un iframe oculto (`Ventas/printReceipt.js` + `receiptHtml.js`), una sola
  hoja, `@page { margin: 0 }` (sin fecha ni URL del navegador). En contado siempre muestra Pago y Cambio.
- Migración `f6a7b8c9d0e1` (turno + tarjeta). Asocia a la caja abierta lo hecho desde su apertura.

## 16. Importar imágenes desde una URL

- `POST /api/upload-imagen-url` (`{url}`): el **servidor** descarga la imagen, la valida/optimiza igual que una subida y la
  guarda en el almacenamiento propio (Blob). Así el producto no depende de que el sitio de origen la conserve.
  Límite: 20 por minuto por IP (`importar_imagen_rate_limit`).
- **Protección SSRF** (`api/services/imagen_remota.py`): solo http/https, sin credenciales en la URL, solo puertos 80/443,
  todas las IP resueltas deben ser públicas (nada privado, loopback, link-local, CGNAT, multicast ni IPv4 mapeado en IPv6),
  sin redirecciones automáticas (cada salto, máximo 3, se valida de nuevo), tope de 5 MB mientras se descarga, tiempo límite,
  solo `Content-Type: image/*` y el contenido debe ser JPG/PNG/WEBP/GIF reales (SVG rechazado). No se envían cookies ni
  autorización. Riesgo residual conocido: la IP se valida al resolver el nombre y la conexión vuelve a resolverlo (ventana
  mínima de *DNS rebinding*); el endpoint exige sesión y está limitado por IP.
- Frontend: `api/imagesApi.js`; Inventario importa toda URL http(s) que no sea ya del Blob propio antes de guardar el producto.

## 17. Anulación de ventas y caja obligatoria

- `POST /api/ventas/{id}/anular` (`{motivo, autorizador_usuario?, autorizador_password?}`): **no borra** la venta; la marca
  (`anulada`, `anulada_en`, `anulada_por`, `autorizada_por`, `motivo_anulacion`; migración `a8b9c0d1e2f3`). Devuelve stock,
  revierte puntos de fidelización y la deuda de fiado de tienda, y deja auditoría (`accion=anular`).
- Autorización: admin/superadmin se autorizan solos; el vendedor debe enviar usuario y clave de un admin/superadmin
  activo (403 si falla; mismo límite por IP que el login). Lógica en `api/services/anulacion.py`.
- Solo se anulan ventas del **turno de caja abierto** (409 si el turno ya cerró) y no las de cartera (se gestionan en cartera).
  `DELETE /api/ventas/{id}` sigue existiendo para admin.
- Las anuladas valen 0 en `cobrado_en_venta` (caja/dashboard) y se excluyen de informes de superadmin, export y detalle de
  fiado de tienda. El listado las devuelve con `anulada=true` para mostrarlas tachadas.
- **Vender exige caja abierta**: `POST /api/ventas` responde 409 si no hay turno (`exigir_caja_abierta`). `/api/cartera/ventas`
  no lo exige (permite fecha de venta pasada). Admin ahora también puede ver estado/abrir/cerrar caja por API.
- Frontend: el POS muestra `CajaGate` (abrir caja con efectivo inicial) en vez de vender sin turno, y un "Historial de ventas"
  con reimprimir y anular. En pruebas `auth_client` abre un turno; las que manejan la caja usan `@pytest.mark.sin_turno`.

## 18. Fidelización: canje de puntos como descuento

- Ganar: 1 punto por cada `FIDELIZACION_PESOS_POR_PUNTO` ($1.000) cobrados. Canjear: 1 punto = `FIDELIZACION_VALOR_PUNTO` ($20, es decir 2%).
  Mínimo para canjear: `FIDELIZACION_UMBRAL_BONO` (100 puntos). `GET /api/fidelizacion/config` devuelve las tres reglas.
- `POST /api/ventas` acepta `puntos_a_canjear` (exige `cliente_fidelizacion_id`): el total baja `puntos*valor`, nunca más que el total.
  La venta guarda `puntos_canjeados` y `descuento_puntos`; los puntos ganados se calculan sobre lo realmente cobrado.
  Anular o borrar la venta devuelve los puntos canjeados y quita los ganados (`revertir_puntos_de_venta`).
- `POST /api/fidelizacion/clientes` ahora lo puede usar el vendedor, pero exige `acepta_datos=true` (se guarda `acepta_datos_en`)
  y un vendedor no puede fijar puntos iniciales. El antiguo "canjear bono" (endpoint y botón) se eliminó: los puntos solo se canjean como descuento en la venta.
- `ventas.monto_recibido`: efectivo entregado por el cliente; permite reimprimir el comprobante con su cambio real.
- Anulación: tras 5 autorizaciones fallidas en 15 min (por cuenta probada y por quien prueba) responde 429 (en memoria: se reinicia
  con el servidor y no se comparte entre instancias). No se anula un fiado de tienda con abonos posteriores.
- La migración `a8b9c0d1e2f3` (aún sin aplicar en producción) incluye todas las columnas nuevas de estos puntos.
- **Migración `b9c0d1e2f3a4`** (idempotente): completa `monto_recibido`, `puntos_canjeados`, `descuento_puntos` y el consentimiento
  (`acepta_datos`, `acepta_datos_en`) solo si faltan. Existe porque `a8b9c0d1e2f3` se aplicó en producción en su versión corta y luego
  se amplió: Alembic no la repite aunque `/health` diga `al_dia`. Lección: nunca editar una migración ya aplicada en alguna base;
  agregar siempre una nueva.

## 19. Caja: movimientos, historial vivo y cierre

- `GET /api/caja/{id}/movimientos` (admin/vendedor/superadmin): ventas (lo realmente cobrado; las anuladas con `anulada=true`),
  abonos de tienda/cartera y gastos del turno. Turnos viejos sin `caja_id` se listan por rango de fechas (`services/caja_movimientos.py`).
  Es lo que explica el efectivo esperado: `inicial + efectivo (ventas+abonos) - gastos`.
- `GET /api/caja` ya suma lo vivo en el turno abierto (antes mostraba ceros) y lo puede ver admin. `POST /api/caja/cierre` acepta
  `observaciones` (nota que explica un descuadre) y bloquea la fila (`FOR UPDATE`) para no cerrar dos veces. Editar el monto de un
  cierre recalcula su descuadre.
- Cierre ciego: el vendedor no ve el efectivo esperado, pero el historial de ventas del POS le deja deducirlo: es una ayuda de
  presentación, no una barrera de seguridad.
- Frontend (`pages/Caja/*`): tarjetas por medio de pago, movimientos del turno, cierre con confirmación y nota, último cierre visible con
  reporte imprimible (`buildCierreHtml`), historial en tarjetas (responsive) con detalle desplegable, lectura sin caché (`skipCache`) y
  recarga al volver a la pestaña. `MoneyInput` permite apertura en 0 (antes `min=1` lo impedía).

## 20. Clientes de tienda (fiado): dinero y trazabilidad

- Ajustar `deuda_total` por `PATCH /api/clientes/tienda-fiado/{id}` exige `motivo_ajuste` (mín. 3 letras) si el valor cambia; queda en
  auditoría (`modulo=clientes_tienda`, `accion=ajustar_deuda`, valor anterior -> nuevo y motivo). Por decisión del dueño sigue disponible
  para el vendedor (hoy es el mismo admin); si algún día hay vendedores distintos, exigir autorización de admin como en las anulaciones.
- No se elimina (desactiva) un cliente con deuda > 0 (409); sigue sin poder eliminarse si tiene ventas. Crear, editar, eliminar, reactivar
  y cada abono quedan en auditoría.
- `POST /api/clientes/tienda/{id}/abonos` exige caja abierta (409 "La caja esta cerrada. Abre la caja para registrar abonos").
  `exigir_caja_abierta(db, operacion)` es compartido con las ventas. Los abonos de cartera (`/api/cartera/...`) aún no lo exigen.
- **Paso 2 (flujo y pantalla):** una sola lista (`GET /api/clientes/tienda/lista`: búsqueda `q`, `filtro` todos/con_deuda/alerta/moroso,
  `orden` deuda/antigüedad/nombre, paginación; `inactivos=true` solo admin/superadmin) con el botón principal "Abonar".
  Semáforo por **antigüedad** (`services/antiguedad_deuda.py`): los pagos se aplican a lo más viejo, así que la deuda actual son las
  ventas fiadas más recientes; la última necesaria marca desde cuándo se debe. Al día ≤30 días, alerta 31-60, moroso >60; una deuda
  sin ventas (ajustada a mano) no tiene fecha y no se marca morosa. El resumen (`/resumen`) cuenta con la misma regla.
- Teléfono en un solo formato (`services/telefono.py`): se guarda `57` + 10 dígitos (acepta 7, 10 o 12; otra longitud = 422). Los datos
  viejos no se migraron: el frontend y wa.me aceptan ambos formatos.
- Nombre libre (sin apellido obligatorio). Mismo nombre (sin tildes/mayúsculas) con otro WhatsApp = homónimo: 409 `{homonimo: true,
  coincidencias}` y se registra con `confirmar_homonimo=true`; mismo nombre y mismo WhatsApp = mismo cliente (409 sin confirmación).
- `GET /api/clientes/tienda/{id}/movimientos`: una fila por venta fiada (con sus productos y lo que quedó fiado) y por abono (medio,
  referencia, saldo después). `POST /api/clientes/tienda/abonos/{id}/anular` (migración `d1e2f3a4b5c6`, columnas `anulado*`): devuelve la
  deuda, mismas reglas que anular ventas (autorización de admin, solo turno abierto, motivo, auditoría); el abono anulado no cuenta en caja.
- El abono responde con `cliente_nombre` y `deuda_anterior` para el comprobante imprimible y el aviso por WhatsApp.
- Pendiente: cupo de crédito para clientes de tienda (decisión del dueño), abonos de cartera con caja abierta.

## 21. Inventario: stock con historial, ajustes con motivo y búsqueda en servidor

- **Todo cambio de stock pasa por `services/stock.mover_stock`**, que registra un `MovimientoStockModel` (tabla `movimientos_stock`,
  migración `e2f3a4b5c6d7`): tipo (`venta`, `venta_cartera`, `anulacion_venta`, `eliminacion_venta`, `factura_compra`,
  `eliminacion_factura`, `stock_inicial`, `ajuste`), delta, stock resultante, motivo, usuario y referencia (venta/factura). No escribir
  `producto.stock_actual` directamente. El historial empieza con esta migración: no hay movimientos anteriores.
- `POST /api/productos/{id}/ajustes-stock` (admin/vendedor/superadmin, por decisión del dueño: hoy el vendedor es el mismo admin):
  `modo` sumar/restar/contar + `cantidad` + `motivo` (ingreso_sin_factura, conteo, merma, dano, devolucion_proveedor, correccion,
  otro). Solo valen las combinaciones modo-motivo de `MOTIVOS_POR_MODO`; "otro" exige nota. "Contar" calcula la diferencia sobre el
  stock bloqueado en ese instante (no pisa ventas hechas mientras se contaba). Queda además en auditoría (`ajuste_stock`).
  `GET /api/productos/{id}/movimientos-stock` pagina el historial.
- `PATCH /api/productos/{id}` **ya no cambia el stock** (el campo se ignora): corregía con el valor viejo y pisaba ventas. Solo cambia
  lo enviado (`model_fields_set`): `proveedor_id: null` e `imagen_url: null` los quitan. Audita lo que cambió (antes -> después).
  `precio_venta` debe ser > 0 (crear, editar e inline); los nombres se comparan sin importar mayúsculas.
- Lista: `GET /api/productos/paginados` con `q` (nombre, código o proveedor), `estado` (agotado = 0, bajo = 1..mínimo, ok), `proveedor_id`,
  `orden` (nombre, stock, precio), `solo_inactivos`. `GET /api/productos/resumen` cuenta todo el catálogo (antes la pantalla cargaba solo
  200 productos y los demás eran inalcanzables). Frontend: `pages/Inventario/*`, `api/inventarioApi.js`.
- El ingreso por código de barras busca el producto en todo el catálogo y suma con motivo `ingreso_sin_factura`.
- Paso 2 (hecho): alta de producto con etiquetas, miles y margen (`CrearProductoModal`, `ImagenCampo`); lista en tabla (md+) y tarjetas (celular) en `ProductosLista`; filtro por proveedor y «Desactivados» (solo admin) con reactivar; historial de movimientos por producto (`HistorialStockModal`); «Reponer stock» (`ReposicionModal`) agrupa por proveedor con `GET /api/productos/reposicion` (sugerido = max(1, minimo*2 - stock)), registra el pedido en `/api/proveedores/pedidos` y abre WhatsApp (`utils/whatsapp.js`). Los productos sin proveedor no se pueden pedir.
- Pruebas: `tests/conftest.py` fuerza `DATABASE_URL` a un SQLite temporal; antes el arranque de la app en los tests usaba la base del `.env` (Neon). Nunca quitar esa guarda.

## 22. Proveedores: reglas, auditoría y pedidos (paso 1)

- Proveedor: el nombre no se repite sin importar mayúsculas ni espacios (409) y el teléfono se guarda como `57`+dígitos (mismo `services/telefono.py` de clientes); no puede repetirse entre proveedores (409 con el nombre de quien lo tiene). Un número viejo con formato raro no bloquea altas nuevas. Teléfono vacío = sin WhatsApp.
- Crear, editar y activar/desactivar dejan auditoría (módulo `proveedores`, entidad `proveedor`); guardar sin cambios no escribe nada. Borrar sigue siendo solo admin/superadmin y se bloquea si hay pedidos o facturas.
- Pedidos: `descripcion` pasó de 255 a 1000 (migración `f3a4b5c6d7e8`, aplicar tras `e2f3a4b5c6d7`); no se puede pedir a un proveedor desactivado (409); crear un pedido deja auditoría (entidad `pedido_proveedor`).
- Pantalla `Proveedores.jsx`: pide `?include_inactivos=true` y muestra pestañas Activos/Inactivos (antes los inactivos desaparecían y no se podían reactivar); el selector de pedidos solo ofrece activos y no preselecciona; crear el pedido lo registra y abre WhatsApp en un solo paso (`utils/whatsapp.js`); formulario `Proveedores/ProveedorFormModal.jsx` con etiquetas y errores dentro del cuadro; botón eliminar solo admin con confirmación.
- Paso 2 (hecho): el pedido tiene ciclo de vida `enviado` (pendiente) -> `recibido` | `cancelado` (columnas `resuelto_por`, `nota`, `factura_id`; migración `g4b5c6d7e8f9`, aplicar tras `f3a4b5c6d7e8`). `PUT /api/proveedores/pedidos/{id}/estado` lo cambia (vendedor también); reabrir solo si no tiene factura; `aprobado_por` ya no se usa.
- `POST /api/facturas-compra` acepta `pedido_id` (mismo proveedor, pedido pendiente): el pedido queda `recibido` y enlazado; al eliminar la factura el pedido vuelve a pendiente. `Facturas.jsx` ofrece los pedidos pendientes del proveedor elegido.
- `GET /api/proveedores/pedidos/paginados` filtra por `estado`, `proveedor_id` y `q` (proveedor o detalle). La pantalla `Proveedores.jsx` quedó: Pedidos (chips Pendientes/Recibidos/Cancelados/Todos + buscador + paginación) arriba y listado de proveedores con buscador y pestañas Activos/Inactivos abajo; componentes en `pages/Proveedores/` (`NuevoPedidoModal`, `PedidosLista`, `ProveedoresLista`, `usePedidos`).
- «Nuevo pedido» reemplaza el formulario por líneas: al elegir proveedor carga sus productos (`/api/productos/paginados?proveedor_id=`), marca los que faltan con la cantidad sugerida (`cantidadSugerida`: doble del mínimo) y comparte con «Reponer stock» la utilería `utils/pedidosProveedor.js` (descripción, monto, mensajes) y `api/proveedoresApi.js` (`registrarPedido`, `cambiarEstadoPedido`, `fetchPedidos`).

## 23. Gastos: efectivo vs otros medios, anulación y auditoría (paso 1)

- Cada gasto tiene `medio_pago` (`efectivo` | `transferencia` | `tarjeta`, por defecto efectivo; migración `h5c6d7e8f9a0`, aplicar tras `g4b5c6d7e8f9`; los gastos viejos quedan como efectivo). Solo el gasto **vigente en efectivo** resta del efectivo esperado (`caja_calculos.calcular_metricas`); los pagados por transferencia o tarjeta quedan registrados sin descuadrar el cierre.
- Un gasto en efectivo exige caja abierta (409 si está cerrada); transferencia y tarjeta no. La fecha propia (`fecha`, no futura) solo vale para transferencia/tarjeta; un gasto en efectivo siempre es de hoy. El listener `_asignar_turno_abierto` sigue enlazando el gasto al turno abierto.
- Categoría normalizada (minúsculas, espacios simples), monto con tope 999.999.999, descripción mínima 4 letras tras limpiar.
- Anular: `POST /api/gastos/{id}/anular` (motivo + autorización de admin como ventas y abonos; el vendedor da usuario y clave de un admin). Un gasto en efectivo de un turno ya cerrado no se anula ni se le cambia el monto (el cierre quedó guardado); uno por transferencia/tarjeta se anula siempre. Un gasto que ya pertenece a un turno no se borra (409: se anula); `DELETE` solo para los que no tienen turno. Todo deja auditoría (módulo `gastos`).
- Los movimientos del turno muestran el medio de cada gasto y los anulados tachados; el CSV de gastos trae `medio_pago` y `estado`.
- Pantalla `Gastos.jsx` + `pages/Gastos/` (`GastoForm`, `gastosHelpers`): etiquetas, `MoneyInput` con miles, «Pagado con», aviso de caja cerrada, anular con el formulario compartido `Ventas/AnularVentaForm`; el resumen del mes excluye anulados.
- Paso 2 (hecho): `GET /api/gastos/paginados` filtra por `mes` (AAAA-MM con hora de Bogota, UTC-5 fijo), `categoria`, `medio_pago`, `estado` (todos/vigentes/anulados) y `q` (detalle, categoría o quién lo registró). `GET /api/gastos/resumen?mes=` calcula sobre TODO el mes (no la página): total, registros, anulados, `por_categoria`, efectivo vs otros medios, mes anterior y `variacion_pct` (None si el anterior fue cero); los anulados no cuentan. Los meses se cuentan con la hora de Bogota: un gasto a las 22:00 del 31 va al mes que termina.
- Pantalla: `pages/Gastos/` (`useGastos` con debounce de 300 ms y mes por defecto el actual, `GastosResumen` con selector de mes y comparación, `GastosLista` con filtros, tabla en escritorio y tarjetas en celular), `api/gastosApi.js`. El formulario de anular se dibuja en tabla y tarjeta a la vez (una está oculta por CSS).
- El diálogo de gastos del panel de superadmin (`CreateGastoDialog`) ya pide «Pagado con»; un gasto que ya está en un turno no se borra desde ahí (409): se anula en Gastos.

## 24. Facturas de compra: pago, caja, anulación y duplicados (paso 1)

- La factura tiene `medio_pago` (`efectivo` | `transferencia` | `tarjeta` | `credito`; NULL = sin dato, las viejas) y `caja_id` (el listener `_asignar_turno_abierto` la enlaza al turno abierto); migración `i6d7e8f9a0b1`, aplicar tras `h5c6d7e8f9a0`. Una compra en efectivo exige caja abierta y su total se suma a `monto_gastos` del turno (`caja_calculos.calcular_metricas`), así que resta del efectivo esperado; los otros medios y las facturas sin dato no tocan la caja. En la pantalla de caja eso se rotula «Gastos y compras». Los movimientos del turno traen el tipo `compra`.
- `encomienda` se sigue RESTANDO del total (así estaba); solo se rotuló en pantalla «Encomienda (−)». Pendiente decidir con el dueño si es un flete que debería sumar al costo.
- Anular: `POST /api/facturas-compra/{id}/anular` (motivo + autorización de admin; el vendedor da usuario y clave de un admin). Devuelve el stock (movimiento `eliminacion_factura`, motivo «Factura de compra anulada»), libera el pedido que cumplía y NO restaura el costo ni el precio de venta que dejó. No se anula si ya se vendió parte de la mercancía; una compra en efectivo de un turno cerrado no se anula ni se le cambia el total; una factura anulada no se edita. `DELETE` sigue siendo solo admin y bloquea las compras en efectivo que ya están en un turno.
- Reglas al crear: número de factura limpio, de 3+ caracteres y único por proveedor entre las no anuladas (409 con el id de la repetida; anular libera el número); no se compra un producto desactivado (409); un precio de venta nuevo bajo el costo se rechaza salvo `permitir_bajo_costo` por línea (la pantalla lo confirma); las líneas repetidas del mismo producto siguen permitidas; el filtro `fecha_hasta` incluye todo ese día.
- Pantalla `Facturas.jsx`: sin proveedor preseleccionado, «Pagado con» obligatorio, aviso de caja cerrada, confirmación antes de guardar (y segunda si hay precio bajo el costo), «Anular» con el formulario compartido `Ventas/AnularVentaForm`, columna «Pagada con» y anuladas marcadas.
- Paso 2 (hecho): `GET /api/facturas-compra/paginadas` filtra por `q` (número de factura o proveedor), `proveedor_id`, `medio_pago`, `estado` (todas/vigentes/anuladas) y fechas (la final incluye todo el día); cada factura trae sus líneas. La pantalla usa `pages/Facturas/` (`useFacturas` con debounce de 300 ms y pagina de 10, `FacturasLista` con filtros, tabla/tarjetas y «Detalle» con las líneas, `ProductoBuscador` con teclado, `facturasHelpers`) y `api/facturasApi.js`; ya no carga todas las facturas.
- «Producto nuevo» reutiliza `Inventario/CrearProductoModal` en modo `soloManual` (sin pestaña de código de barras, que suma stock, y sin stock inicial: lo suma la factura, así no se cuenta doble); el producto creado entra a la primera línea vacía. Los campos de la cabecera tienen etiqueta y la encomienda usa `MoneyInput`.
- Pendiente: «cuentas por pagar» si se decide; definir si la encomienda es un flete que debe sumar al costo.

## 25. Fidelización: historial de puntos, ajustes con motivo y teléfono único (paso 1)

- Los puntos de un cliente solo cambian por `services/fidelizacion.mover_puntos` y cada cambio deja un movimiento en `movimientos_puntos` (tipo, puntos realmente aplicados, saldo resultante, motivo, usuario y referencia a la venta; migración `j7e8f9a0b1c2`, aplicar tras `i6d7e8f9a0b1`). Tipos: `inicial`, `saldo_inicial` (la migración lo crea una vez para quien ya tenía puntos, así el historial siempre suma el saldo), `venta`, `canje`, `anulacion_venta`, `eliminacion_venta`, `ajuste`. Los puntos nunca bajan de cero: se registra lo aplicado. Un movimiento de venta o canje recibe `referencia_id` después del flush, como el stock.
- `acumular_puntos`, `canjear_puntos` y `revertir_puntos_de_venta` ahora piden `usuario`; anular o eliminar una venta devuelve lo canjeado y quita lo ganado como movimientos separados.
- Ajuste manual: `POST /api/fidelizacion/clientes/{id}/ajustes` (solo admin/superadmin) con `modo` sumar/restar/fijar, puntos y motivo obligatorio (3+ caracteres limpios); no se resta más de lo que hay ni se ajusta a lo mismo. Queda en la auditoría (módulo `fidelizacion`). Editar los puntos desde el panel (`PATCH`) sigue funcionando pero ahora también registra movimiento y auditoría. Crear con puntos iniciales (solo admin), desactivar y reactivar también se auditan.
- `GET /api/fidelizacion/clientes/{id}/movimientos` (paginado, del más nuevo al más antiguo).
- Teléfono: se guarda como `57`+10 dígitos (`services/telefono.py`, igual que clientes de tienda y proveedores) y no puede repetirse aunque se escriba distinto o el viejo esté guardado sin el 57 (409 con el nombre de quien lo tiene); los inválidos dan 400. Los clientes viejos conservan su formato hasta que se editen. El nombre se guarda con espacios simples.
- Decisiones por defecto (sin respuesta del dueño): los puntos no vencen; solo el admin ajusta puntos; «eliminar» sigue siendo desactivar (no anonimiza).
- Paso 2 (hecho): pantalla `Fidelizacion.jsx` reescrita con `pages/Fidelizacion/*` y `api/fidelizacionApi.js`. Búsqueda en vivo (nombre o ≥3 dígitos de WhatsApp) y paginación en el servidor: `GET /api/fidelizacion/clientes/paginados` (`q`, `estado` activos|canjeables|desactivados|todos, `page`, `limit`; desactivados/todos solo admin → 403) y `GET /api/fidelizacion/resumen` (totales de todo el programa, no de la página). El listado original `/api/fidelizacion/clientes` NO cambió (lo usa el POS). Tabla en escritorio y tarjetas en celular, valor en pesos, «Puede canjear / Faltan N», historial y ajuste (con vista previa del saldo) desde la pantalla, filtro Desactivados + reactivar (admin), inscribir con autorización de datos, aviso si no cargan las reglas (usa 100 pts y $20 por defecto).
- Pendiente: la tabla genérica de Fidelización en el panel Admin sigue mostrando teléfonos crudos.

## 26. Clientes de cartera (rol admin): datos únicos, auditoría y semáforo por antigüedad (paso 1)

- Rol admin = solo módulos de Cartera; vendedor = sus módulos; superadmin = todo (por el Panel de gerencia). No mezclar.
- `routers/clientes_cartera_clientes.py`: crear/editar/desactivar/reactivar quedan en auditoría (`modulo=clientes_cartera`, `entidad=cliente_cartera`; editar sin cambios no deja rastro). Nombre con espacios simples y único sin importar mayúsculas/tildes/espacios, **incluyendo desactivados** (el 409 dice «desactivado: reactívalo»). WhatsApp normalizado a `57`+10 dígitos (`services/telefono.py`) y único aunque el viejo esté sin 57; inválido → 422. Documento: vacío es `NULL` (antes "   " se guardaba como texto y chocaba con otro), mínimo 5, único con el nombre del dueño en el 409. PATCH usa `model_fields_set`: enviar `documento`/`telefono_whatsapp` como null o vacío los **borra** (antes se ignoraba).
- «Eliminar» = desactivar: ya no lo bloquea tener historial, solo **deuda pendiente** (409). Reactivar sigue en `PUT /api/clientes/{id}/reactivar`; `GET /api/clientes?include_inactivos=true` los lista (la pantalla aún no los muestra: paso 2).
- `ClienteResponse` ahora trae `activo`, `estado_deuda` (`sin_deuda|al_dia|alerta|moroso`) y `dias_deuda`. Semáforo por antigüedad como tienda (30/60 días) con `dias_de_deuda_cartera` (estimación: cada venta fiada aporta como máximo su total; los abonos se aplican a lo más viejo). Frontend: `pages/cartera/nivelDeudaCartera.js` (usado por la lista de clientes y el ranking del dashboard; si el servidor no lo envía cae al monto de antes). `ClienteCarteraCard` (pantalla Cobrar) sigue por monto: pendiente.
- Cupo: `limite_credito` nace en 0 y ninguna pantalla lo fija; `exigir_credito_disponible` ahora **no bloquea cuando el cupo es 0** (antes el POS rechazaba todo fiado de cartera a clientes nuevos). Con cupo > 0 se sigue exigiendo.
- Hallazgo pendiente (módulo Venta cartera): una venta de cartera **no se puede anular ni corregir en ningún lado**: `/api/ventas/{id}/anular` responde «se gestionan desde el módulo de cartera» y cartera no tiene endpoint de anulación.
- Paso 2 (hecho): `GET /api/cartera/clientes/paginados` (`q` nombre/documento/≥3 dígitos de WhatsApp, `estado` activos|con_deuda|alerta|moroso|desactivados|todos, `page`, `limit`≤100; alerta/moroso se juzgan por antigüedad; con deuda ordena por lo que deben) y `GET /api/cartera/clientes/resumen-deuda` (cifras de toda la cartera: activos, con deuda, deuda total, alerta, morosos, desactivados). Los endpoints viejos (`/api/clientes`, `/api/cartera/clientes` de cobros) no cambiaron. Pantalla: `CarteraClientesSection.jsx` es ahora un contenedor con `clientes/useClientesCartera.js` (búsqueda en vivo 300 ms, filtros, paginación; recarga cuando `reloadTick` de `useCarteraData` cambia), `ResumenDeudaClientes`, `ClientesCarteraLista` (tabla + tarjetas, compras, antigüedad, Detalle/Editar/Desactivar/Reactivar). «Detalle» reutiliza `VerDetalleModal`. `useConfirm` acepta `confirmLabel` (el botón decía «Eliminar» al desactivar; también corregido en Fidelización).
- Pendiente: `VerDetalleModal` se corta en celular (tabla más ancha que la pantalla); `ClienteCarteraCard` (Cobrar) sigue por monto; `useCarteraData` conserva `clientesCarteraFiltrados`/`searchTerm` de clientes que ya no se usan.
