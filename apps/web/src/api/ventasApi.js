import { apiGet, apiPost } from './httpClient';

// Ventas mas recientes primero (el historial del punto de venta muestra las ultimas).
export const fetchVentasRecientes = ({ limit = 30, signal } = {}) => (
  apiGet(`/api/ventas/paginadas?page=1&limit=${limit}`, { signal }).then((payload) => payload?.data ?? [])
);

// Una venta con sus productos, el cobro y quien la hizo.
export const fetchVenta = (ventaId, { signal } = {}) => apiGet(`/api/ventas/${ventaId}`, { signal });

// Reglas del punto de venta que la pantalla necesita (por ahora, hasta cuanto descuenta el vendedor sin autorizacion).
export const fetchVentasConfig = ({ signal } = {}) => apiGet('/api/ventas/config', { signal });

// Devolver parte de una venta: vuelve al stock y se devuelve el dinero. La autoriza un administrador.
export const devolverProductos = (ventaId, { items, motivo, autorizadorUsuario, autorizadorPassword }) => (
  apiPost(`/api/ventas/${ventaId}/devoluciones`, {
    items,
    motivo,
    autorizador_usuario: autorizadorUsuario || null,
    autorizador_password: autorizadorPassword || null,
  })
);

// Anular no borra la venta: queda marcada con motivo y quien la autorizo.
export const anularVenta = (ventaId, { motivo, autorizadorUsuario, autorizadorPassword }) => (
  apiPost(`/api/ventas/${ventaId}/anular`, {
    motivo,
    autorizador_usuario: autorizadorUsuario || null,
    autorizador_password: autorizadorPassword || null,
  })
);
