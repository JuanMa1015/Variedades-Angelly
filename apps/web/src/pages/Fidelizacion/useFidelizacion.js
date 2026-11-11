import { useCallback, useEffect, useState } from 'react';
import { fetchClientes, fetchResumen } from '../../api/fidelizacionApi';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

// Clientes con busqueda, filtro y pagina resueltos por el servidor, mas el resumen de TODO el programa.
export const useFidelizacion = (token) => {
  const [filtros, setFiltros] = useState({ q: '', estado: 'activos', page: 1 });
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState({ data: [], total: 0, totalPages: 1 });
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
        fetchClientes({ ...filtros, limit: PAGE_SIZE, signal }),
        fetchResumen({ signal }).catch((err) => { if (err?.name === 'AbortError') throw err; return null; }),
      ]);
      if (signal?.aborted) return;
      setLista({ data: pagina?.data ?? [], total: pagina?.page?.total ?? 0, totalPages: Math.max(1, pagina?.page?.total_pages ?? 1) });
      setResumen(nuevoResumen && !Array.isArray(nuevoResumen) ? nuevoResumen : null);
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No fue posible cargar los clientes de fidelización');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token, filtros]);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  // Cambiar el filtro vuelve a la primera pagina.
  const setEstado = useCallback((estado) => setFiltros((actual) => ({ ...actual, estado, page: 1 })), []);
  const setPagina = useCallback((page) => setFiltros((actual) => ({ ...actual, page })), []);

  return { filtros, setEstado, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload };
};
