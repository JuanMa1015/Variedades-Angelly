import { apiDelete, apiGet, apiPost, apiRequest } from './httpClient';

// Los puntos cambian con cada venta: siempre se piden al servidor, sin cache.
const sinCache = (signal) => ({ signal, skipCache: true });

// Busqueda, filtro y pagina resueltos por el servidor sobre todos los clientes.
export const fetchClientes = ({ page = 1, limit = 10, q = '', estado = 'activos', signal } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), estado });
  if (q) params.set('q', q);
  return apiGet(`/api/fidelizacion/clientes/paginados?${params.toString()}`, sinCache(signal));
};

// Cifras de todo el programa (no solo de la pagina visible).
export const fetchResumen = ({ signal } = {}) => apiGet('/api/fidelizacion/resumen', sinCache(signal));

export const fetchMovimientos = (clienteId, { page = 1, limit = 8, signal } = {}) => (
  apiGet(`/api/fidelizacion/clientes/${clienteId}/movimientos?page=${page}&limit=${limit}`, sinCache(signal))
);

// modo: sumar | restar | fijar. El motivo es obligatorio y queda en el historial y la auditoria.
export const ajustarPuntos = (clienteId, { modo, puntos, motivo }) => (
  apiPost(`/api/fidelizacion/clientes/${clienteId}/ajustes`, { modo, puntos, motivo })
);

export const inscribirCliente = ({ nombre, telefono, aceptaDatos }) => (
  apiPost('/api/fidelizacion/clientes', { nombre, telefono_whatsapp: telefono, acepta_datos: aceptaDatos })
);

export const desactivarCliente = (clienteId) => apiDelete(`/api/fidelizacion/clientes/${clienteId}`);

export const reactivarCliente = (clienteId) => apiRequest(`/api/fidelizacion/clientes/${clienteId}/reactivar`, { method: 'PUT' });
