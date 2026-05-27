import { apiDelete, apiGet, apiPatch, apiPost } from './httpClient';

const buildSearchParams = ({ page, limit, search } = {}) => {
  const params = new URLSearchParams();

  if (page !== undefined) {
    params.set('page', String(page));
  }

  if (limit !== undefined) {
    params.set('limit', String(limit));
  }

  if (search) {
    params.set('search', search);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
};

export const fetchCarteraInitialData = async ({ page, limit, search, signal }) => {
  const query = buildSearchParams({ page, limit, search });

  const [clientes, clientesCatalogo, productosCartera, dashboardVentas, resumenCartera] = await Promise.all([
    apiGet(`/api/cartera/clientes${query}`, { signal }),
    apiGet('/api/clientes', { signal }),
    apiGet('/api/productos?catalogo=cartera', { signal }),
    apiGet('/api/dashboard/resumen', { signal }),
    apiGet('/api/cartera/resumen', { signal }),
  ]);

  return {
    clientes,
    clientesCatalogo,
    productosCartera,
    dashboardVentas,
    resumenCartera,
  };
};

export const saveCarteraCliente = ({ clienteId, payload }) => {
  if (clienteId) {
    return apiPatch(`/api/cartera/clientes/${clienteId}`, payload);
  }

  return apiPost('/api/cartera/clientes', payload);
};

export const deleteCarteraCliente = ({ clienteId }) => {
  return apiDelete(`/api/cartera/clientes/${clienteId}`);
};

export const saveCarteraProducto = (payload) => {
  return apiPost('/api/productos', payload);
};

export const updateCarteraProducto = (productoId, payload) => {
  return apiPatch(`/api/productos/${productoId}`, payload);
};

export const deleteCarteraProducto = (productoId) => {
  return apiDelete(`/api/productos/${productoId}`);
};

export const saveCarteraAbono = ({ clienteId, payload }) => {
  return apiPost(`/api/cartera/clientes/${clienteId}/abonos`, payload);
};

export const saveCarteraVenta = (payload) => {
  return apiPost('/api/cartera/ventas', payload);
};

export const fetchCarteraVentasHistorial = ({ limit, signal }) => {
  return apiGet(`/api/cartera/ventas/historial?limit=${encodeURIComponent(String(limit))}`, { signal });
};

export const fetchCarteraMovimientos = ({ clienteId, page, limit, signal }) => {
  return apiGet(`/api/cartera/clientes/${clienteId}/movimientos${buildSearchParams({ page, limit })}`, { signal });
};
