import { useCallback, useEffect, useState } from 'react';
import { fetchCarteraDashboard } from '../../../api/carteraApi';

// Todo el dashboard de cartera sale de una sola peticion. `recargar` cambia cuando la pantalla registra un
// abono o una venta; `reintentar` vuelve a pedir tras un error. Si falla NO se muestran ceros: se muestra el error.
export const useCarteraDashboard = (recargar = 0) => {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setLoading(true);
      try {
        const respuesta = await fetchCarteraDashboard({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setDatos(respuesta && !Array.isArray(respuesta) ? respuesta : null);
        setError(respuesta && !Array.isArray(respuesta) ? '' : 'La respuesta del servidor no es válida');
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'No fue posible cargar el dashboard de cartera');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void cargar();
    return () => controller.abort();
  }, [recargar, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { datos, loading, error, reintentar };
};
