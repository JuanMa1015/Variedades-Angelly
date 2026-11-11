import { apiGet, apiPost, apiRequest } from './httpClient';

// Los pedidos cambian de estado en cualquier momento (recibidos desde una factura): siempre se piden al servidor, sin cache.
export const fetchPedidos = ({ page = 1, limit = 10, estado = 'todos', q = '', proveedorId = null, signal } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), estado });
  if (q) params.set('q', q);
  if (proveedorId) params.set('proveedor_id', String(proveedorId));
  return apiGet(`/api/proveedores/pedidos/paginados?${params.toString()}`, { signal, skipCache: true });
};

export const registrarPedido = ({ proveedorId, descripcion, monto }) => (
  apiPost('/api/proveedores/pedidos', { proveedor_id: proveedorId, descripcion, monto_estimado: monto })
);

// enviado (reabrir) | recibido | cancelado; la nota es opcional.
export const cambiarEstadoPedido = (id, estado, nota = null) => (
  apiRequest(`/api/proveedores/pedidos/${id}/estado`, { method: 'PUT', body: { estado, nota } })
);
