import { useCallback, useEffect, useState } from 'react';
import { fetchFacturas } from '../../api/facturasApi';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

// Historial de facturas con busqueda, filtros y pagina resueltos por el servidor.
export const useFacturas = (token) => {
  const [filtros, setFiltros] = useState({ q: '', proveedorId: '', medio: '', estado: 'todas', desde: '', hasta: '', page: 1 });
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState({ data: [], total: 0, totalPages: 1 });
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
      const pagina = await fetchFacturas({ ...filtros, limit: PAGE_SIZE, signal });
      if (signal?.aborted) return;
      setLista({ data: pagina?.data ?? [], total: pagina?.page?.total ?? 0, totalPages: Math.max(1, pagina?.page?.total_pages ?? 1) });
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No se pudo cargar facturas');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token, filtros]);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  // Cambiar un filtro vuelve a la primera pagina.
  const setFiltro = useCallback((cambio) => setFiltros((actual) => ({ ...actual, page: 1, ...cambio })), []);
  const setPagina = useCallback((page) => setFiltros((actual) => ({ ...actual, page })), []);

  return { filtros, setFiltro, setPagina, texto, setTexto, lista, loading, error, setError, reload };
};
