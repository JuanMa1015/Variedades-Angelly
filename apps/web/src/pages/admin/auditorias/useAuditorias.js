import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../../api/httpClient';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;
const FILTROS_VACIOS = { q: '', modulo: '', accion: '', desde: '', hasta: '', page: 1 };

// Historial de auditoria: busqueda, filtros y paginas resueltos por el servidor. Solo se consulta.
export const useAuditorias = (token) => {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState({ data: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // El buscador espera a que termines de escribir antes de preguntarle al servidor.
  useEffect(() => {
    const espera = setTimeout(() => {
      setFiltros((actual) => (actual.q === texto.trim() ? actual : { ...actual, q: texto.trim(), page: 1 }));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  const reload = useCallback(async ({ signal } = {}) => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(filtros.page), limit: String(PAGE_SIZE) });
    ['q', 'modulo', 'accion', 'desde', 'hasta'].forEach((clave) => {
      if (filtros[clave]) params.set(clave, filtros[clave]);
    });
    try {
      const respuesta = await apiGet(`/api/auditorias/paginadas?${params.toString()}`, { signal });
      if (signal?.aborted) return;
      setLista({
        data: respuesta?.data ?? [],
        total: respuesta?.page?.total ?? 0,
        totalPages: Math.max(1, respuesta?.page?.total_pages ?? 1),
      });
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No fue posible cargar el historial');
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
  const limpiar = useCallback(() => {
    setTexto('');
    setFiltros(FILTROS_VACIOS);
  }, []);

  const hayFiltros = Boolean(filtros.q || filtros.modulo || filtros.accion || filtros.desde || filtros.hasta);

  return { filtros, setFiltro, setPagina, texto, setTexto, limpiar, hayFiltros, lista, loading, error, reload };
};
