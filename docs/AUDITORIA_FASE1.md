# Auditoría Fase 1 — Variedades Angelly

Alcance revisado (lectura de código, sin ejecutar nada): `main.py`, auth (login/refresh/logout/JWT/bootstrap), dependencias de roles, mapa completo de rutas vs permisos, ventas, caja, cartera (abonos), facturas de compra, productos (delete/stock/precio), upload, export CSV, modelos, `httpClient`, `AuthContext`, rutas/guards del frontend, Login, Dockerfiles, nginx, CI/CD.

**No revisado todavía:** UI de Inventario, Proveedores, Caja, Gastos, Dashboard, Admin (1108 líneas), Fidelización, ClientesTienda, POS (Ventas) a nivel UX; migraciones Alembic; contenido de los tests; `README`. No se ejecutaron tests, lint, build ni `pip-audit`/`npm audit`.

Severidad: 🔴 crítico · 🟠 alto · 🟡 medio · 🟢 bajo

---

## 1. Seguridad

| # | Sev | Hallazgo | Dónde |
|---|-----|----------|-------|
| S1 | 🔴 | **CSRF/CORS efectivamente abiertos.** `CORS_ALLOW_ORIGIN_REGEX=.*\.vercel\.app$` + `allow_credentials=True` permite que *cualquier* sitio `*.vercel.app` (los puede registrar cualquiera) haga peticiones con cookies. La única defensa CSRF es el header `X-Requested-With`, que CORS deja pasar. Con cookies `SameSite=None` en producción, un admin logueado visitando un sitio malicioso en vercel.app puede ser suplantado. | `main.py:236-262`, `auth.py:44`, `.env.example` |
| S2 | 🔴 | **Usuarios desactivados/eliminados siguen con acceso.** El access token (8 h) no consulta la BD; el refresh (30 días) tampoco revalida usuario, `activo` ni rol. Borrar un vendedor o cambiar su rol no surte efecto hasta que expire el refresh. Login tampoco valida `usuarios.activo`. | `dependencies.py:46-81`, `auth.py:112,185-193` |
| S3 | 🟠 | Rotación de refresh sin detección de reuso real (solo 401, no revoca la familia) y sin atomicidad: dos refresh simultáneos con el mismo JTI pueden pasar. | `auth.py:177-197` |
| S4 | 🟠 | Rate limit por IP confía en `X-Real-IP`/`X-Forwarded-For` enviados por el cliente si la API no está detrás de nginx (p. ej. Vercel/Render directo) → se evade el límite de login con un header falso. Sin límite por usuario ni bloqueo progresivo. | `limiter.py:7-21` |
| S5 | 🟠 | **Permisos de `vendedor` excesivos:** puede eliminar/reactivar productos, cambiar precio de venta y stock, editar/eliminar proveedores, **eliminar facturas de compra y sobrescribir `total_factura`**. | `productos.py:314-367`, `facturas_compra.py:304,338`, `proveedores.py` |
| S6 | 🟠 | **Auditoría forjable y no automática.** `POST /api/auditorias` y `/superadmin/auditorias` aceptan `usuario` del cliente; nada registra automáticamente ediciones/borrados de ventas, abonos, caja o precios. | `superadmin.py:449`, `auditorias.py` |
| S7 | 🟡 | Upload: `await file.read()` lee el archivo completo *antes* de validar tamaño (DoS de memoria); sin límite de píxeles (decompression bomb); GIF se guarda sin re-codificar; magic bytes `RIFF` no verifica `WEBP`; `.bmp` en tabla pero no permitido. | `upload.py:96-120` |
| S8 | 🟡 | Login sin hash dummy cuando el usuario no existe → enumeración por timing. Mensajes consistentes, pero tiempo no. | `auth.py:108-116` |
| S9 | 🟡 | Exportes CSV sin escapar fórmulas (`=`, `+`, `-`, `@`) en nombre/descripción → inyección CSV al abrir en Excel. Header `filename` sin comillas. | `export.py` |
| S10 | 🟡 | `/docs` y `/openapi.json` expuestos en producción; handler global devuelve `str(exc)` para `ValueError`; CSP de la API (`unsafe-inline/eval` fuera de prod) no protege el SPA (lo sirve Vercel/nginx sin cabeceras propias). | `main.py`, `vercel.json` |
| S11 | 🟡 | Cookies: `samesite` inconsistente (login `lax`, refresh `strict` en dev, `none` en prod). `SameSite=None` depende de cookies de terceros, que Safari/Chrome bloquean si front y API están en dominios distintos → login roto o inestable. | `auth.py` |
| S12 | 🟢 | `.coverage`, `_calc.py` (con factura id 8 y valores reales) y `_schema_check.py` versionados. Contenedor backend corre como root; sin volumen para `/uploads`. | repo / `backend.Dockerfile` |

## 2. Integridad de datos y lógica de negocio

| # | Sev | Hallazgo | Dónde |
|---|-----|----------|-------|
| D1 | 🔴 | **Dinero en `Float`** en todo el modelo (totales, deuda, abonos, caja, IVA). Acumula errores de redondeo y los descuadres de caja/cartera serán inexplicables. Migrar a `Numeric(12,2)`/`Decimal` o enteros en pesos. | `models.py` |
| D2 | 🔴 | **Borrar una venta fiada de tienda no revierte la deuda del cliente**; editar `total`/`saldo_pendiente` (PATCH) tampoco ajusta la deuda ni los detalles. Deuda y ventas quedan desincronizadas y sin rastro. | `ventas_fidelizacion.py:384-570` |
| D3 | 🟠 | **No se valida `limite_credito`** al vender fiado en cartera ni que el cliente/producto estén `activo`. | `ventas_fidelizacion.py:100-210` |
| D4 | 🟠 | `venta.saldo_pendiente` guarda la **deuda total del cliente**, no el saldo de esa venta. Semántica errónea que contamina reportes. | `ventas_fidelizacion.py:197-209` |
| D5 | 🟠 | Fiado de cartera: `current_user.role != "admin"` rechaza al superadmin aunque `require_roles` lo deje pasar; inconsistente. | `ventas_fidelizacion.py:103` |
| D6 | 🟠 | **Caja:** ventas sin `metodo_pago` (permitido cuando no es fiado) no entran en efectivo ni transferencia → cierre descuadrado. El `abono_inicial` de un fiado no se registra como ingreso. `saldo_esperado` suma transferencias como si fueran efectivo, y el "descuadre" se compara contra efectivo real. Apertura/cierre sin lock (dos aperturas simultáneas posibles). Una sola caja global, no por usuario. | `caja.py:32-216` |
| D7 | 🟠 | Abonos: `PATCH`/`DELETE` de un abono **no ajusta `deuda_total`** ni `saldo_cliente` del cliente. Admin puede cambiar el monto y la deuda no se entera. | `clientes_cartera_cobros.py:279-316` |
| D8 | 🟡 | Factura de compra **no actualiza stock ni `precio_costo`**; el flujo depende de ajuste manual. `porcentaje_ganancia` divide sin validar > 0 visible en el handler; `PATCH` solo permite sobrescribir `total_factura` sin recalcular. | `facturas_compra.py` |
| D9 | 🟡 | Fechas naive en UTC en BD; el front/informes por día pueden correr un día en zona Colombia (UTC-5) al filtrar por fecha. | `models.py`, filtros de ventas/caja |
| D10 | 🟡 | Posible deadlock al bloquear productos en orden del carrito en ventas concurrentes (responde 500). Ordenar `producto_id` antes de `FOR UPDATE`. | `ventas_fidelizacion.py:147` |

## 3. Frontend, flujos y UX

| # | Sev | Hallazgo | Dónde |
|---|-----|----------|-------|
| F1 | 🔴 | **Recargar la página (F5) cierra la sesión.** `/api/auth/refresh` devuelve solo `access_token` y `expires_in`, pero `AuthContext` espera `username` y `role` → `user` queda `null` → `isAuthenticated=false` → redirige a login. Solución: devolver usuario/rol en refresh (o endpoint `/api/auth/me`). | `AuthContext.jsx:59-66`, `auth.py:68-73` |
| F2 | 🔴 | **Reintentos automáticos en POST/PATCH/DELETE** ante error de red/502/503/504 sin clave de idempotencia → ventas, abonos y gastos duplicados. Además el retry duerme 2 s/4 s con la UI bloqueada. | `httpClient.js:98-160` |
| F3 | 🟠 | Caché GET de 10 s invalidada solo por prefijo del mismo recurso: tras una venta el stock (`/api/productos`), dashboard y caja siguen mostrando datos viejos. En un POS esto genera sobreventas aparentes. | `httpClient.js:36-46,163-166` |
| F4 | 🟠 | Imagen CD del frontend se construye con `VITE_API_URL=/api` y las rutas ya empiezan por `/api` → llamadas a `/api/api/...` → **404 en toda la app** en esa imagen. | `cd.yml:66`, `httpClient.js` |
| F5 | 🟠 | `admin` solo ve Cartera; el backend le permite ventas, dashboard, productos y fidelización, pero el front no le da acceso (`/ventas`, `/dashboard`, `/inventario` solo vendedor+superadmin). Permisos front/back desalineados; el rol `admin` no puede cobrar en caja ni ver su propio dashboard. | `App.jsx:128-147` vs routers |
| F6 | 🟡 | `Admin.jsx` 1108 líneas, `Inventario` 892, `Proveedores` 804, `Facturas` 772, `Caja` 735: componentes monolíticos. 9+ handlers de eliminación copiados con la misma línea de `confirm`. Confirmaciones con mensaje genérico ("Eliminar venta 12?") sin explicar efecto (stock, deuda). | `Admin.jsx:338-609` |
| F7 | 🟡 | Accesibilidad mínima: 26 atributos `aria-*` en todo el front, formularios sin `aria-live` para errores, `alert()` nativo en `RegistrarAbonoModal`. No se verificó contraste ni navegación por teclado en POS. | `components/` |
| F8 | 🟡 | `AuthContext`: el token vive en estado pero nunca se envía como `Authorization`; todo depende de cookies. Doble mecanismo sin uso claro; `refreshTimer` duplicado con interceptor 401. Subida de imágenes (`apiUpload`) no reintenta tras 401. | `AuthContext.jsx`, `httpClient.js:207` |
| F9 | 🟢 | Login: "recordar usuario" guarda el nombre de usuario en `localStorage` (aceptable pero conviene avisar). Sin mostrar/ocultar contraseña, sin mensaje de bloqueo por rate limit. | `Login.jsx` |

## 4. Deuda técnica e infraestructura

- **Dos fuentes de verdad de esquema:** `create_all` + `ALTER TABLE` con f-strings en dev/test (`main.py:162-189`) y Alembic en prod. Existe `test_alembic_drift` (bien), pero el bypass de dev oculta migraciones faltantes.
- **Duplicación de rutas/routers:** `/api/superadmin/*` repite CRUD de productos, proveedores, auditorías y vendedores ya existentes; `/api/usuarios/vendedores` duplica `/api/superadmin/usuarios/vendedores`; `/api/clientes` vs `/api/cartera/clientes`. Superadmin usa dict/SQL inline en vez de servicios.
- **Capas inconsistentes:** hay `domain/`, `application/`, repositorios… pero la mayoría de routers hacen SQL directo. Arquitectura declarada ≠ real.
- **Tests:** backend tiene buena base (pytest + behave + contratos + drift); frontend solo 7 archivos de test para ~12k líneas. Sin tests de concurrencia ni de dinero (redondeos), ni de los hallazgos S1/S2/F1/F2.
- **CI:** audit de dependencias activo (bien). Falta: lint/type-check Python (ruff/mypy), CD no ejecuta tests antes de publicar imágenes, imágenes con tag `latest`, sin escaneo de imagen, sin cache de Buildx.
- **Operación:** `uploads` local sin volumen persistente; `scripts/backup_db.ps1` sin verificación de restauración documentada; logs sin request-id ni usuario.
- Dependencias fijadas (bien); `httpx` en `requirements.txt` de runtime se usa en upload (ok) pero mezcla herramientas de test con runtime.

---

## Prioridad sugerida (qué arreglar primero)

1. **F1** (F5 = logout) y **F2** (reintentos duplican operaciones): afectan el uso diario.
2. **S1** (CORS regex + CSRF), **S2** (revalidar usuario/rol en refresh y en access).
3. **D2 / D7 / D6**: coherencia de deuda y caja (los números del negocio).
4. **D1**: migrar dinero a `Numeric` (con migración y pruebas).
5. **S5 / S6**: restringir permisos del vendedor y auditar automáticamente.
6. **F3 / F4 / F5**: caché, imagen CD, rol admin.
7. Resto (upload, CSV, docs, refactor de `Admin.jsx`, tests de front).

## Siguiente fase propuesta (módulo por módulo)

Revisar a fondo la UI y el flujo de: **POS/Ventas → Caja → Inventario → Proveedores/Facturas → Cartera/ClientesTienda → Fidelización → Gastos → Dashboard → Admin/Superadmin**, ejecutando la app y los tests (lint, vitest, pytest, `npm audit`, `pip-audit`) para validar los hallazgos con evidencia y ampliar con UX real (navegación, móvil, accesibilidad).

---

## Actualización (Bloque 2 aplicado)

- **Corrección al hallazgo S6:** solo `POST /api/superadmin/auditorias` aceptaba el `usuario` del cliente; `/api/auditorias` ya usaba el usuario del token. Ambos usan ahora el token.
- **S1** CSRF: se valida `Origin` en toda petición que modifica datos (incluido login/refresh/logout); `.env.example` ya no sugiere el regex `*.vercel.app`. **Acción pendiente en producción:** revisar `CORS_ALLOW_ORIGIN_REGEX`/`CORS_ALLOW_ORIGINS` y que contengan solo el dominio propio.
- **S2/S3/S8** el usuario y su rol se revalidan en BD en cada request y en cada refresh; el JTI se consume de forma atómica; el login iguala el tiempo de respuesta y respeta `activo`.
- **S5** el vendedor ya no puede desactivar/reactivar productos, borrar proveedores ni editar/borrar facturas de compra; los registros de auditoría solo los edita/borra el superadmin.
- **S6** auditoría automática (usuario del token) en productos, proveedores, facturas, ventas, abonos de cartera, caja y usuarios vendedor/admin.
- Dependencias: `Pillow 12.3.0 → 13.0.0` y `PyJWT 2.13.0 → 2.15.1` (`pip-audit`: 54 avisos → 0).
- Pendiente de fase 1: S4 (límite de login por IP detrás de proxy), S7 (upload), S9 (CSV), S10, S11.

## Actualización (Bloque 3 aplicado)

- **D1** montos en `NUMERIC(14,2)` (migración `d4e5f6a7b8c9`, solo PostgreSQL; la API sigue entregando `float`).
- **D2** borrar o editar una venta fiada de tienda reajusta la deuda del cliente (incluido cambiar de cliente o pasarla a contado).
- **D3** fiados de cartera respetan el cupo de crédito; no se vende con productos o clientes desactivados.
- **D4** `saldo_pendiente` de un fiado de tienda guarda el saldo de la venta (total − abono inicial), no la deuda total del cliente. Las ventas anteriores conservan el valor antiguo: la reversión lo acota al total de la venta.
- **D5/D6** caja: solo cuenta dinero cobrado (un fiado no es caja; las ventas de cartera entran por sus abonos, una sola vez); el efectivo esperado ya no suma transferencias; se puede abrir con base $0; toda venta con cobro exige método de pago. El abono inicial de un fiado de cartera hecho por `/api/ventas` ahora se registra como abono.
- **D7** editar o borrar un abono de cartera reajusta la deuda del cliente.
- Pendiente: D8–D10, ver Fase 2.

## Actualización (Bloque 4 aplicado)

- **Fidelización:** las ventas acumulan puntos automáticamente (1 punto por cada `FIDELIZACION_PESOS_POR_PUNTO` cobrados, por defecto 1000; un fiado solo cuenta su abono). Al eliminar la venta se revierten. El umbral de canje (`FIDELIZACION_UMBRAL_BONO`, por defecto 100) viene del backend (`GET /api/fidelizacion/config`). Migración `e5f6a7b8c9d0` (columnas `cliente_fidelizacion_id` y `puntos_otorgados` en `ventas`).
- **POS:** selector de cliente de fidelización; búsqueda por nombre/código en el servidor (ya no depende de los primeros 200 productos) y escaneo de códigos que no estén cargados, con aviso si no existe o no hay stock.
- **Dashboard:** las ventas recientes usan `/api/ventas/paginadas?limit=8` en vez de descargar todo el historial.
- **Caja:** cierre ciego. Mientras la caja está abierta el vendedor no ve el efectivo esperado; al cerrar recibe el descuadre. El superadmin sigue viéndolo.
- **Pendiente de decisión:** que registrar una factura de compra sume stock y actualice el costo.

### Factura de compra → inventario (acordado con el dueño)

- Registrar una factura **suma el stock** y deja el **último costo** (precio de factura + IVA si aplica) en cada producto.
- El **precio de venta** solo cambia si se confirma por línea (casilla marcada por defecto, valor editable). El precio sugerido = costo ÷ margen, **redondeado hacia arriba a múltiplos de $50**.
- Cada cambio de stock/costo/precio queda en auditoría con el usuario del token.
- **Eliminar** una factura resta el stock que sumó; si parte ya se vendió responde 409 y no cambia nada. El costo y precio no se revierten.
- Nota: los datos antiguos no se tocan; solo aplica a facturas nuevas.
