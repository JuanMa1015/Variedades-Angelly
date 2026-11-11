import { apiGet, apiPost } from './httpClient';

// El inventario cambia con cada venta y cada compra: siempre se pide al servidor, sin cache.
const sinCache = (signal) => ({ signal, skipCache: true });

// Busqueda, filtro por estado de stock, proveedor y orden: todo lo resuelve el servidor sobre el catalogo completo.
export const fetchProductos = ({ page = 1, limit = 25, q = '', estado = 'todos', orden = 'nombre', proveedorId = null, soloInactivos = false, signal } = {}) => {
  const params = new URLSearchParams({ catalogo: 'tienda', page: String(page), limit: String(limit), estado, orden });
  if (q) params.set('q', q);
  if (proveedorId) params.set('proveedor_id', String(proveedorId));
  if (soloInactivos) params.set('solo_inactivos', 'true');
  return apiGet(`/api/productos/paginados?${params.toString()}`, sinCache(signal));
};

export const fetchResumenInventario = ({ signal } = {}) => apiGet('/api/productos/resumen?catalogo=tienda', sinCache(signal));

// Producto con ese codigo de barras exacto (o null). El servidor busca en todo el catalogo.
export const buscarPorCodigo = async (codigo) => {
  const pagina = await fetchProductos({ q: codigo, limit: 5, estado: 'todos' });
  return (pagina?.data ?? []).find((producto) => String(producto.codigo_barras ?? '').trim() === codigo) ?? null;
};

// Corregir el stock siempre lleva motivo: 'sumar' / 'restar' unidades, o 'contar' lo que hay en el estante.
export const ajustarStock = (productoId, { modo, cantidad, motivo, nota }) => (
  apiPost(`/api/productos/${productoId}/ajustes-stock`, { modo, cantidad, motivo, ...(nota ? { nota } : {}) })
);

export const fetchMovimientosStock = (productoId, { page = 1, limit = 10, signal } = {}) => (
  apiGet(`/api/productos/${productoId}/movimientos-stock?page=${page}&limit=${limit}`, sinCache(signal))
);
