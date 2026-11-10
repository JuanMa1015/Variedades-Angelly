import { apiGet, apiPost } from './httpClient';

// Ventas mas recientes primero (el historial del punto de venta muestra las ultimas).
export const fetchVentasRecientes = ({ limit = 30, signal } = {}) => (
  apiGet(`/api/ventas/paginadas?page=1&limit=${limit}`, { signal }).then((payload) => payload?.data ?? [])
);

// Anular no borra la venta: queda marcada con motivo y quien la autorizo.
export const anularVenta = (ventaId, { motivo, autorizadorUsuario, autorizadorPassword }) => (
  apiPost(`/api/ventas/${ventaId}/anular`, {
    motivo,
    autorizador_usuario: autorizadorUsuario || null,
    autorizador_password: autorizadorPassword || null,
  })
);
