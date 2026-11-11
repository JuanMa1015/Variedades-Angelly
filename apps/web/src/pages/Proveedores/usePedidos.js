import { useCallback, useEffect, useState } from 'react';
import { fetchPedidos } from '../../api/proveedoresApi';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

// Pedidos a proveedor con estado, busqueda y pagina resueltos por el servidor. Por defecto, los pendientes.
export const usePedidos = (token) => {
  const [filtros, setFiltros] = useState({ q: '', estado: 'enviado', page: 1 });
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
      const pagina = await fetchPedidos({ ...filtros, limit: PAGE_SIZE, signal });
      if (signal?.aborted) return;
      setLista({ data: pagina?.data ?? [], total: pagina?.page?.total ?? 0, totalPages: Math.max(1, pagina?.page?.total_pages ?? 1) });
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No fue posible cargar los pedidos');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token, filtros]);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  const setEstado = useCallback((estado) => setFiltros((actual) => ({ ...actual, estado, page: 1 })), []);
  const setPagina = useCallback((page) => setFiltros((actual) => ({ ...actual, page })), []);

  return { filtros, setEstado, setPagina, texto, setTexto, lista, loading, error, setError, reload };
};
