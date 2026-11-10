import { useCallback, useEffect, useState } from 'react';
import { fetchCajaEstado, fetchCajaHistorial } from '../../api/cajaApi';

// Estado de la caja y su historial. Se vuelve a pedir al volver a la pestaña: asi los totales
// del turno reflejan las ventas hechas en el punto de venta sin recargar la pagina.
export const useCaja = (token) => {
  const [estado, setEstado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Cambia en cada recarga: los listados de movimientos lo usan para volver a consultarse.
  const [version, setVersion] = useState(0);

  const reload = useCallback(async ({ signal, silent = false } = {}) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const [nuevoEstado, nuevoHistorial] = await Promise.all([
        fetchCajaEstado({ signal }),
        fetchCajaHistorial({ signal }),
      ]);
      if (signal?.aborted) return;
      setEstado(nuevoEstado);
      setHistorial(Array.isArray(nuevoHistorial) ? nuevoHistorial : []);
      setVersion((actual) => actual + 1);
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No se pudo cargar la caja');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const alVolver = () => { void reload({ silent: true }); };
    window.addEventListener('focus', alVolver);
    return () => window.removeEventListener('focus', alVolver);
  }, [reload]);

  return { estado, historial, loading, error, setError, version, reload };
};
