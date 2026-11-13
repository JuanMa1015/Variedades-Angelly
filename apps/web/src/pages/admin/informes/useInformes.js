import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../../api/httpClient';
import { rangoDe } from './periodos';

// Informe de gerencia: lo calcula el servidor para el periodo elegido (tienda y cartera por separado).
export const useInformes = (token) => {
  const [periodo, setPeriodo] = useState('mes');
  const [rango, setRango] = useState(() => rangoDe('mes'));
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async ({ signal } = {}) => {
    if (!token) return;
    setLoading(true);
    try {
      const datos = await apiGet(`/api/superadmin/informes?desde=${rango.desde}&hasta=${rango.hasta}`, { signal });
      if (signal?.aborted) return;
      setInforme(datos);
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No fue posible cargar los informes');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token, rango]);

  useEffect(() => {
    // Un rango a medio escribir (falta una fecha, o va al reves) no se le manda al servidor.
    if (!rango.desde || !rango.hasta || rango.desde > rango.hasta) return undefined;
    const controller = new AbortController();
    void cargar({ signal: controller.signal });
    return () => controller.abort();
  }, [cargar, rango]);

  const elegirPeriodo = useCallback((id) => {
    setPeriodo(id);
    if (id !== 'personalizado') setRango(rangoDe(id));
  }, []);

  const rangoValido = Boolean(rango.desde && rango.hasta && rango.desde <= rango.hasta);

  return { periodo, elegirPeriodo, rango, setRango, rangoValido, informe, loading, error, cargar };
};
