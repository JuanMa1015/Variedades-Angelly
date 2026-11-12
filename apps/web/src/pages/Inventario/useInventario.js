import { useCallback, useEffect, useState } from 'react';
import { fetchProductos, fetchResumenInventario } from '../../api/inventarioApi';

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;

// Lista del inventario con busqueda, filtro y orden resueltos por el servidor (llega a todo el catalogo),
// mas el resumen de TODO el catalogo (no solo de la pagina visible).
export const useInventario = (token, catalogo = 'tienda') => {
  const [filtros, setFiltros] = useState({ q: '', estado: 'todos', orden: 'nombre', proveedorId: null, soloInactivos: false, page: 1 });
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
        fetchProductos({ ...filtros, catalogo, limit: PAGE_SIZE, signal }),
        fetchResumenInventario({ catalogo, signal }),
      ]);
      if (signal?.aborted) return;
      setLista({ data: pagina?.data ?? [], total: pagina?.page?.total ?? 0, totalPages: Math.max(1, pagina?.page?.total_pages ?? 1) });
      setResumen(nuevoResumen && !Array.isArray(nuevoResumen) ? nuevoResumen : null);
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No fue posible cargar el inventario');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token, filtros, catalogo]);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  // Cambiar el filtro o el orden vuelve a la primera pagina.
  const setFiltro = useCallback((cambio) => setFiltros((actual) => ({ ...actual, page: 1, ...cambio })), []);
  const setPagina = useCallback((page) => setFiltros((actual) => ({ ...actual, page })), []);

  return { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload };
};
