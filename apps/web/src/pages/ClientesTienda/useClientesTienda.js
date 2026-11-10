import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/httpClient';

const PAGE_SIZE = 15;
const SEARCH_DELAY_MS = 300;

const buildQuery = ({ q, filtro, orden, page, inactivos }) => {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), filtro, orden });
  if (q) params.set('q', q);
  if (inactivos) params.set('inactivos', 'true');
  return params.toString();
};

// Lista de clientes con busqueda, filtro por estado y orden; todo lo resuelve el servidor.
export const useClientesTienda = (token) => {
  const [filtros, setFiltros] = useState({ q: '', filtro: 'todos', orden: 'deuda', page: 1, inactivos: false });
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState({ data: [], total: 0, total_pages: 1 });
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // El buscador espera a que termines de escribir antes de preguntarle al servidor.
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
        apiGet(`/api/clientes/tienda/lista?${buildQuery(filtros)}`, { signal, skipCache: true }),
        apiGet('/api/clientes/tienda/resumen', { signal, skipCache: true }),
      ]);
      if (signal?.aborted) return;
      setLista({ data: pagina?.data ?? [], total: pagina?.total ?? 0, total_pages: Math.max(1, pagina?.total_pages ?? 1) });
      setResumen(nuevoResumen ?? null);
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No fue posible cargar los clientes');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token, filtros]);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  // Cambiar el filtro, el orden o la vista vuelve a la primera pagina.
  const setFiltro = useCallback((cambio) => setFiltros((actual) => ({ ...actual, page: 1, ...cambio })), []);
  const setPagina = useCallback((page) => setFiltros((actual) => ({ ...actual, page })), []);

  return { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload };
};
