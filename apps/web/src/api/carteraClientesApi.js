import { apiGet, apiRequest } from './httpClient';

// La deuda cambia con cada venta y abono: siempre se pide al servidor, sin cache.
const sinCache = (signal) => ({ signal, skipCache: true });

// Busqueda, filtro y pagina resueltos por el servidor sobre todos los clientes de cartera.
export const fetchClientesCartera = ({ page = 1, limit = 10, q = '', estado = 'activos', signal } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), estado });
  if (q) params.set('q', q);
  return apiGet(`/api/cartera/clientes/paginados?${params.toString()}`, sinCache(signal));
};

// Cifras de TODA la cartera (no solo de la pagina visible).
export const fetchResumenDeuda = ({ signal } = {}) => apiGet('/api/cartera/clientes/resumen-deuda', sinCache(signal));

export const reactivarClienteCartera = (clienteId) => apiRequest(`/api/clientes/${clienteId}/reactivar`, { method: 'PUT' });

// Lo que cartera cobro hoy, esta semana y este mes por medio de pago (no pasa por la caja del vendedor).
export const fetchCobradoCartera = ({ signal } = {}) => apiGet('/api/cartera/cobros/resumen', sinCache(signal));
