import { apiGet, apiPost } from './httpClient';

// Las ventas cambian con cada registro o anulacion: siempre se piden al servidor, sin cache.
const sinCache = (signal) => ({ signal, skipCache: true });

// Busqueda (cliente o #venta), filtro, fechas y pagina resueltos por el servidor.
export const fetchVentasCartera = ({ page = 1, limit = 10, q = '', estado = 'todas', desde = '', hasta = '', signal } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), estado });
  if (q) params.set('q', q);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  return apiGet(`/api/cartera/ventas/paginadas?${params.toString()}`, sinCache(signal));
};

// Devuelve el stock y la deuda del cliente; el motivo queda en la venta y en la auditoria.
export const anularVentaCartera = (ventaId, motivo) => apiPost(`/api/cartera/ventas/${ventaId}/anular`, { motivo });
