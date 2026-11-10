# Auditoría Fase 2 — Variedades Angelly

Complementa [AUDITORIA_FASE1.md](AUDITORIA_FASE1.md). Fase 2 = ejecución real del frontend + revisión de código módulo por módulo (POS, Caja, Inventario, Facturas, Clientes tienda, Fidelización, Gastos, Dashboard, Admin).

## Qué se ejecutó y qué no

| Verificación | Resultado |
|---|---|
| `npm ci` | OK |
| `npm run lint` | ✅ 0 errores |
| `npm test` (vitest) | ✅ 8 archivos, 61 tests |
| `npm run build` | ✅ compila (chunk principal 217 kB / 68 kB gzip; Ventas 73 kB, Cartera 71 kB, Admin 65 kB) |
| `npm audit --omit=dev` (lo que corre el CI) | ✅ 0 vulnerabilidades en producción |
| `npm audit` (completo) | ⚠️ 12 (7 altas, 5 moderadas), todas en dependencias de desarrollo: `vite` (directa), `vitest`, `zod`, `undici`, `js-yaml`, etc. Se corrigen con `npm audit fix`/subir Vite. No afectan el bundle servido. |
| Backend (pytest, behave, `pip-audit`) | ❌ **No ejecutado**: el entorno no tiene dependencias Python instaladas ni PostgreSQL/`.env`. Pendiente. |
| Prueba manual en navegador (móvil, teclado) | ❌ No realizada en esta fase. |

> Que el frontend tenga lint y tests verdes **no cubre** los fallos F1 (F5 cierra sesión) y F2 (reintentos duplican POST) de la fase 1: no hay tests que los ejerzan.

---

## Hallazgos por módulo

### POS / Ventas (`pages/Ventas.jsx`)
| Sev | Hallazgo |
|---|---|
| 🔴 | **Venta guardada pero se muestra error → doble cobro.** `handleSubmitVenta` hace `apiPost` y luego `await loadData()` dentro del mismo `try`. Si la recarga falla (red, 401, 5xx), el catch muestra "No fue posible registrar la venta" aunque la venta ya existe, no se muestra el recibo y el carrito sigue lleno: el cajero reintenta y duplica la venta. Separar el post de la recarga. |
| 🔴 | **El recibo impreso lleva datos de relleno:** `NIT: 123.456.789-0`, `Carrera XX #YY-ZZ, Ciudad`, `Tel: (123) 456-7890`, y se titula **"Factura de Venta"** (no es factura electrónica DIAN). Debe usar `config/site.js`/variables y llamarse "Comprobante de venta". |
| 🟠 | Catálogo cargado con `limit=200` sin paginar ni buscar en servidor: productos 201+ **no aparecen en el POS** (solo se detecta si se escanea el código y no se encuentra). |
| 🟠 | Stock mostrado puede estar viejo hasta 10 s (caché, F3): tras vender, `loadData()` devuelve el caché de productos. |
| 🟡 | "Nequi" y "Tarjeta" se envían ambos como `transferencia`; el comprobante reconstruye "Tarjeta" por descarte. Caja no distingue datáfono de transferencia. |
| 🟡 | En contado hay que digitar el pago (`'0'` por defecto): sin botón "Exacto" ni billetes rápidos. En fiado, el comprobante no muestra cliente, abono ni saldo. |
| 🟡 | Se puede vender con la **caja cerrada**; la venta no queda asociada a un turno (caja las infiere por fecha). |
| 🟡 | Modal "Nuevo cliente fiado" propio (sin Esc, sin foco atrapado, sin `role="dialog"`) en vez del componente `Modal` compartido. |
| 🟢 | Positivo: escaneo por código de barras ya existe; agrupa líneas duplicadas; valida stock y abono antes de enviar. |

### Caja (`pages/Caja.jsx` + `routers/caja.py`)
| Sev | Hallazgo |
|---|---|
| 🟠 | Apertura exige monto inicial **> 0**: no se puede abrir con $0 de base. |
| 🟠 | El cajero **ve el saldo esperado antes de contar** y digita el cierre: no hay cierre ciego, lo que facilita "ajustar" el conteo. No se pide desglose de billetes ni observaciones al cierre. |
| 🟡 | Las ventas del turno abierto se cargan una sola vez (`ventasLoadedRef`) y no se actualizan al vender más: la lista queda desactualizada hasta recargar. |
| 🟡 | `GET /api/caja` entrega a cualquier vendedor el historial de **todos** los cierres (montos de otros turnos). Superadmin puede editar `monto_cierre`/`estado` sin recalcular `esperado_vs_real`, ni dejar traza. |
| 🟡 | Consulta de ventas del turno usa `/api/ventas` por rango sin paginar. |

### Inventario (`pages/Inventario.jsx`, 892 líneas)
| Sev | Hallazgo |
|---|---|
| 🟡 | Flujos de alta manual, por código de barras y edición en un solo componente; "Desactivar" es soft-delete pero el backend además **borra el vínculo con el proveedor** (`proveedor_id=None`), perdiéndose al reactivar. |
| 🟡 | Ajuste de stock es un delta libre sin motivo ni historial (no hay tabla de movimientos): imposible auditar mermas o robos. |
| 🟡 | Reintentar con `window.location.reload()` como recuperación de error (línea ~807). |

### Facturas de compra / Proveedores
| Sev | Hallazgo |
|---|---|
| 🟠 | **"% Ganancia 70%" es en realidad 30% de margen.** El precio sugerido es `costo / 0.70`, pero la UI y el PDF muestran "70%" y el campo "0.70". Un usuario que ponga "0.30" pensando en 30% de ganancia obtendrá un precio de venta 3,3× el costo. Renombrar a "margen sobre venta" y validar rango (p. ej. 0.05–0.95). |
| 🟠 | IVA 19 % está **hardcodeado en el frontend** (`base * 0.19`) y en el backend sale de `IVA_RATE` (env). Si se cambia la variable, lo que ve el usuario y lo que se guarda divergen. El backend debería ser la única fuente. |
| 🟠 | Registrar una factura **no incrementa stock ni actualiza `precio_costo`/`precio_venta`**; el usuario debe ir a Inventario y repetirlo. Es el flujo más propenso a error operativo del negocio. |
| 🟡 | Borrador guardado en `localStorage` es buena idea; falta aviso de "borrador recuperado" y limpieza al cambiar de usuario en el mismo equipo. |

### Clientes de tienda / Fiado
| Sev | Hallazgo |
|---|---|
| 🟠 | El vendedor puede **eliminar** un cliente con deuda (`apiDelete` tras un confirm genérico) y registrar abonos; el borrado no advierte la deuda pendiente. |
| 🟡 | "Saldar deuda" registra siempre `metodo_pago: 'efectivo'` sin preguntar: si pagan por transferencia, la caja se descuadra. |
| 🟡 | Validación de teléfono acepta 7 dígitos "Bogotá", pero `wa.me` necesita código de país: el mensaje de WhatsApp para 7 dígitos no abre un chat válido. Normalización duplicada en POS y en esta pantalla. |
| 🟢 | Positivo: paginación y búsqueda server-side; `noopener,noreferrer` en `window.open`. |

### Fidelización
| Sev | Hallazgo |
|---|---|
| 🔴 | **Los puntos nunca se acumulan por ventas.** Ningún código del flujo de venta suma `puntos_acumulados`; solo se editan a mano (`PATCH`) y se canjean al llegar a 100. La venta ni siquiera referencia un cliente de fidelización. En la práctica el programa es una libreta manual. |
| 🟡 | Umbral 100 duplicado y fijo en front (`UMBRAL_BONO`) y back (`FIDELIZACION_UMBRAL_BONO`). Un cambio en uno desincroniza el otro. Falta regla "X pesos = 1 punto". |
| 🟡 | Canje sin historial (no se registra cuándo ni quién canjeó). |

### Gastos
| Sev | Hallazgo |
|---|---|
| 🟡 | Categoría libre en backend (50 chars) con lista base solo en el frontend → reportes con "Servicios", "servicios", "servicios " como categorías distintas (el resumen ya normaliza a minúscula en cliente). |
| 🟡 | El vendedor registra gastos que reducen el efectivo esperado de caja sin comprobante ni aprobación. |

### Dashboard
| Sev | Hallazgo |
|---|---|
| 🟠 | Carga `GET /api/ventas` **completo (toda la historia, con detalles)** en cada visita y lo agrega en el navegador. Crece sin límite con el uso; debe consultarse agregado en servidor (ya existe `/api/dashboard/resumen`). |
| 🟡 | Rama `isAdmin ? /api/clientes : []`: el rol admin no tiene ruta a `/dashboard`, así que esa rama es código muerto (síntoma de F5 de fase 1). |

### Admin / Superadmin (`pages/Admin.jsx`, 1108 líneas)
| Sev | Hallazgo |
|---|---|
| 🟠 | 17 secciones en una sola pantalla/archivo, con CRUD completo de ventas, abonos, cajas, facturas y auditorías **sin registro automático** de quién cambió qué (S6/D2/D7 de fase 1). El superadmin puede reescribir el historial financiero sin dejar rastro. |
| 🟡 | Dos formas de gestionar lo mismo (`/cartera/*` para admin y `/admin/*` para superadmin), con reglas distintas: editar una venta desde Admin no pasa por las validaciones de cartera. |
| 🟡 | Confirmaciones de borrado genéricas ("Eliminar venta 12?") sin decir que el stock/deuda se verá afectado (o no). |
| 🟡 | Navegación: 17 ítems en el sidebar agrupados; sin buscador ni atajos. Para un único dueño de negocio es mucha superficie. |

### Navegación y roles (UX transversal)
- El rol **admin** aterriza en "Venta cartera" y solo ve 5 ítems; no puede abrir caja, ver dashboard general ni inventario aunque el backend lo permite (F5 fase 1). Definir una matriz rol → módulos única, compartida entre front y back.
- El rol **vendedor** ve Facturas de compra y Proveedores (datos de costos y márgenes) — decisión de negocio a confirmar.
- Textos mezclan "Cartera", "Fiado tienda", "Fiado cartera", "Clientes", "Clientes tienda": dos conceptos de deuda distintos con nombres parecidos; es el punto más confuso del producto para un usuario nuevo.
- Accesibilidad: solo ~26 atributos `aria-*` en toda la app; modales propios; errores no anunciados (`aria-live`). Sin prueba con lector de pantalla ni verificación de contraste.

---

## Plan de corrección sugerido (orden)

**Bloque 1 — Operación diaria (rápido, alto impacto)**
1. F1: `refresh` devuelve usuario y rol (o `/api/auth/me`) → F5 no cierra sesión.
2. F2: no reintentar métodos no idempotentes; añadir `Idempotency-Key` en ventas/abonos/gastos.
3. POS: separar `apiPost` de `loadData`; datos reales en el comprobante; botón "Exacto"; invalidar caché de productos tras vender.
4. Facturas: IVA desde backend; renombrar "% Ganancia" → "Margen"; (decisión) sumar stock al registrar factura.

**Bloque 2 — Seguridad (fase 1: S1, S2, S3, S5, S6)**
5. CORS: quitar el regex `*.vercel.app` y listar solo el dominio propio; revalidar usuario activo/rol en refresh y access; recortar permisos del vendedor; auditoría automática con usuario del token.

**Bloque 3 — Integridad del dinero (D1, D2, D6, D7)**
6. `Numeric`/enteros para dinero, reversar deuda al borrar/editar ventas y abonos, caja considerando abono inicial y ventas sin método.

**Bloque 4 — Producto**
7. Fidelización con acumulación automática; cierre de caja ciego; paginación del catálogo en POS; dashboard agregado en servidor.

**Bloque 5 — Deuda técnica**
8. Partir `Admin.jsx`/`Inventario.jsx`/`Facturas.jsx`/`Proveedores.jsx`; eliminar rutas duplicadas `/api/superadmin/*`; `npm audit fix` en desarrollo; ruff/mypy en CI; CD que ejecute tests antes de publicar; arreglar `VITE_API_URL=/api` (F4).

**Pendiente de verificar** (no se pudo en esta fase): ejecutar pytest/behave con PostgreSQL, `pip-audit`, y una pasada en navegador (móvil 375 px, teclado, lector de pantalla) de POS, Caja y Cartera.
