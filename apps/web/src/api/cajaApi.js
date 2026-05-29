import { apiDelete, apiGet, apiPatch, apiPost } from './httpClient';

export const fetchCajaEstado = ({ signal } = {}) => {
  return apiGet('/api/caja/estado', { signal });
};

export const abrirCaja = ({ monto_inicial }) => {
  return apiPost('/api/caja/apertura', { monto_inicial });
};

export const cerrarCaja = ({ monto_cierre }) => {
  return apiPost('/api/caja/cierre', { monto_cierre });
};

export const fetchCajaHistorial = ({ signal } = {}) => {
  return apiGet('/api/caja', { signal });
};

export const updateCaja = (cajaId, payload) => {
  return apiPatch(`/api/caja/${cajaId}`, payload);
};

export const deleteCaja = (cajaId) => {
  return apiDelete(`/api/caja/${cajaId}`);
};

export const fetchVentasPorRango = ({ fecha_desde, fecha_hasta, signal } = {}) => {
  const params = new URLSearchParams();
  if (fecha_desde) params.append('fecha_desde', fecha_desde);
  if (fecha_hasta) params.append('fecha_hasta', fecha_hasta);
  const qs = params.toString();
  return apiGet(`/api/ventas${qs ? `?${qs}` : ''}`, { signal });
};
