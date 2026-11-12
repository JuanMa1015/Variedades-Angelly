import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/httpClient';

const VENTAS_RECIENTES = 8;

// El dashboard del vendedor: sus cifras salen de una peticion y las ventas recientes de otra (el servidor ya deja
// solo las de la tienda). Si falla NO se muestran ceros: se muestra el error con la opcion de reintentar.
export const useDashboardVendedor = (token) => {
  const [datos, setDatos] = useState(null);
  const [recientes, setRecientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const cargar = async () => {
      setLoading(true);
      try {
        const [tablero, ventas] = await Promise.all([
          apiGet('/api/dashboard/vendedor', { signal: controller.signal, skipCache: true }),
          apiGet(`/api/ventas/paginadas?page=1&limit=${VENTAS_RECIENTES}`, { signal: controller.signal, skipCache: true }),
        ]);
        if (controller.signal.aborted) return;
        setDatos(tablero && !Array.isArray(tablero) ? tablero : null);
        setRecientes(Array.isArray(ventas?.data) ? ventas.data : []);
        setError(tablero && !Array.isArray(tablero) ? '' : 'La respuesta del servidor no es válida');
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'No se pudo cargar el dashboard');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void cargar();
    return () => controller.abort();
  }, [token, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { datos, recientes, loading, error, reintentar };
};
