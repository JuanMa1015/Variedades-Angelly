import { apiGet } from './httpClient';

// Historial con busqueda y filtros resueltos por el servidor. Las facturas cambian al anularse: sin cache.
export const fetchFacturas = ({ page = 1, limit = 10, q = '', proveedorId = '', medio = '', estado = 'todas', desde = '', hasta = '', signal } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), estado });
  if (q) params.set('q', q);
  if (proveedorId) params.set('proveedor_id', String(proveedorId));
  if (medio) params.set('medio_pago', medio);
  if (desde) params.set('fecha_desde', desde);
  if (hasta) params.set('fecha_hasta', hasta);
  return apiGet(`/api/facturas-compra/paginadas?${params.toString()}`, { signal, skipCache: true });
};
