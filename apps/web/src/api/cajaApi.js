import { apiDelete, apiGet, apiPatch, apiPost } from './httpClient';

// Los datos de la caja cambian con cada venta: siempre se piden al servidor, sin cache.
export const fetchCajaEstado = ({ signal } = {}) => {
  return apiGet('/api/caja/estado', { signal, skipCache: true });
};

export const abrirCaja = ({ monto_inicial }) => {
  return apiPost('/api/caja/apertura', { monto_inicial });
};

// `observaciones` es una nota opcional que explica un descuadre.
export const cerrarCaja = ({ monto_cierre, observaciones }) => {
  const body = { monto_cierre };
  if (observaciones) body.observaciones = observaciones;
  return apiPost('/api/caja/cierre', body);
};

export const fetchCajaHistorial = ({ signal } = {}) => {
  return apiGet('/api/caja', { signal, skipCache: true });
};

// Ventas (lo cobrado), abonos y gastos de un turno: lo que explica su efectivo esperado.
export const fetchCajaMovimientos = (cajaId, { signal } = {}) => {
  return apiGet(`/api/caja/${cajaId}/movimientos`, { signal, skipCache: true });
};

export const updateCaja = (cajaId, payload) => {
  return apiPatch(`/api/caja/${cajaId}`, payload);
};

export const deleteCaja = (cajaId) => {
  return apiDelete(`/api/caja/${cajaId}`);
};
