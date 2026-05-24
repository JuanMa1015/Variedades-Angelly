import { apiGet, apiPost } from './httpClient';

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
  return apiGet('/api/caja/historial', { signal });
};
