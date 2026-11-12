import { useCallback, useEffect, useState } from 'react';
import { fetchClientesCartera, fetchResumenDeuda } from '../../../api/carteraClientesApi';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

// Clientes de cartera con busqueda, filtro y pagina en el servidor, mas el resumen de TODA la cartera.
// `recargar` cambia cuando otra parte de la pantalla guarda o borra algo: vuelve a pedir los datos.
export const useClientesCartera = (recargar = 0, estadoInicial = 'activos') => {
  const [filtros, setFiltros] = useState({ q: '', estado: estadoInicial, page: 1 });
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

  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setLoading(true);
      try {
        const [pagina, nuevoResumen] = await Promise.all([
          fetchClientesCartera({ ...filtros, limit: PAGE_SIZE, signal: controller.signal }),
          fetchResumenDeuda({ signal: controller.signal }).catch((err) => { if (err?.name === 'AbortError') throw err; return null; }),
        ]);
        if (controller.signal.aborted) return;
        setLista({ data: pagina?.data ?? [], total: pagina?.page?.total ?? 0, totalPages: Math.max(1, pagina?.page?.total_pages ?? 1) });
        setResumen(nuevoResumen && !Array.isArray(nuevoResumen) ? nuevoResumen : null);
        setError('');
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'No fue posible cargar los clientes');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void cargar();
    return () => controller.abort();
  }, [filtros, recargar]);

  const setEstado = useCallback((estado) => setFiltros((actual) => (actual.estado === estado ? actual : { ...actual, estado, page: 1 })), []);
  const setPagina = useCallback((page) => setFiltros((actual) => ({ ...actual, page })), []);

  return { filtros, setEstado, setPagina, texto, setTexto, lista, resumen, loading, error, setError };
};
