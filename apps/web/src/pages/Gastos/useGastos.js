import { useCallback, useEffect, useState } from 'react';
import { fetchGastos, fetchResumenGastos } from '../../api/gastosApi';
import { mesActual } from './gastosHelpers';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

// Historial del mes elegido (filtros y pagina resueltos por el servidor) y el resumen de todo ese mes.
export const useGastos = (token) => {
  const [filtros, setFiltros] = useState(() => ({ mes: mesActual(), categoria: '', medio: '', estado: 'todos', q: '', page: 1 }));
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState({ data: [], total: 0, totalPages: 1 });
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const espera = setTimeout(() => {
      setFiltros((actual) => (actual.q === texto.trim() ? actual : { ...actual, q: texto.trim(), page: 1 }));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  const reload = useCallback(async ({ signal, silent = false } = {}) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const [pagina, nuevoResumen] = await Promise.all([
        fetchGastos({ ...filtros, limit: PAGE_SIZE, signal }),
        fetchResumenGastos({ mes: filtros.mes, signal }),
      ]);
      if (signal?.aborted) return;
      setLista({ data: pagina?.data ?? [], total: pagina?.page?.total ?? 0, totalPages: Math.max(1, pagina?.page?.total_pages ?? 1) });
      setResumen(nuevoResumen && !Array.isArray(nuevoResumen) ? nuevoResumen : null);
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No se pudo cargar gastos');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token, filtros]);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  // Cambiar un filtro vuelve a la primera pagina; un mes vacio (campo borrado) vuelve al actual.
  const setFiltro = useCallback((cambio) => setFiltros((actual) => ({ ...actual, page: 1, ...cambio, ...(cambio.mes === '' ? { mes: mesActual() } : {}) })), []);
  const setPagina = useCallback((page) => setFiltros((actual) => ({ ...actual, page })), []);

  return { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload };
};
