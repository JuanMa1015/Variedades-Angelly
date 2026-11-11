import { apiGet } from './httpClient';

// Los gastos cambian con cada registro o anulacion: siempre se piden al servidor, sin cache.
const sinCache = (signal) => ({ signal, skipCache: true });

// Historial con filtros resueltos por el servidor (mes, categoria, medio, estado y busqueda).
export const fetchGastos = ({ page = 1, limit = 10, mes = '', categoria = '', medio = '', estado = 'todos', q = '', signal } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), estado });
  if (mes) params.set('mes', mes);
  if (categoria) params.set('categoria', categoria);
  if (medio) params.set('medio_pago', medio);
  if (q) params.set('q', q);
  return apiGet(`/api/gastos/paginados?${params.toString()}`, sinCache(signal));
};

// Totales del mes sobre todos los gastos (no solo la pagina visible), con la comparacion contra el mes anterior.
export const fetchResumenGastos = ({ mes = '', signal } = {}) => (
  apiGet(`/api/gastos/resumen${mes ? `?mes=${mes}` : ''}`, sinCache(signal))
);
