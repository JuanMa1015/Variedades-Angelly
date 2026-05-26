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
