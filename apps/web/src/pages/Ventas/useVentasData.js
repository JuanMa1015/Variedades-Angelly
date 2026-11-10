import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/httpClient';
import { CATALOGO_ENDPOINT, extractProductos, mergeProductos } from './posHelpers';

const fetchJson = async ({ endpoint, signal, errorMessage }) => {
  try {
    return await apiGet(endpoint, { signal });
  } catch (error) {
    throw new Error(error.message || errorMessage);
  }
};

const asList = (payload) => (Array.isArray(payload) ? payload : []);

// Datos que necesita el POS: catalogo, clientes, reglas de fidelizacion y estado de la caja.
export const useVentasData = (token) => {
  const [productos, setProductos] = useState([]);
  const [clientesTienda, setClientesTienda] = useState([]);
  const [clientesFidelizacion, setClientesFidelizacion] = useState([]);
  const [fidelizacionConfig, setFidelizacionConfig] = useState({ pesos_por_punto: 1000 });
  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async (signal) => {
    if (!token) return;

    const [productosPayload, tiendaPayload, fidelizacionPayload, configPayload, cajaPayload] = await Promise.all([
      fetchJson({ endpoint: `${CATALOGO_ENDPOINT}&limit=200`, signal, errorMessage: 'No fue posible cargar productos' }),
      fetchJson({ endpoint: '/api/clientes/tienda-fiado', signal, errorMessage: 'No fue posible cargar clientes de fiado tienda' }),
      // Extras: si fallan, la venta sigue funcionando.
      fetchJson({ endpoint: '/api/fidelizacion/clientes', signal, errorMessage: '' }).catch(() => []),
      fetchJson({ endpoint: '/api/fidelizacion/config', signal, errorMessage: '' }).catch(() => null),
      fetchJson({ endpoint: '/api/caja/estado', signal, errorMessage: '' }).catch(() => null),
    ]);

    if (signal?.aborted) return;

    setProductos(extractProductos(productosPayload));
    setClientesTienda(asList(tiendaPayload));
    setClientesFidelizacion(asList(fidelizacionPayload));
    if (configPayload?.pesos_por_punto > 0) setFidelizacionConfig(configPayload);
    setCajaAbierta(typeof cajaPayload?.abierta === 'boolean' ? cajaPayload.abierta : null);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setProductos([]);
      setClientesTienda([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await reload(controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || 'No se pudo cargar el módulo de ventas');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [reload, token]);

  const addFetchedProductos = useCallback((incoming) => {
    setProductos((current) => mergeProductos(current, incoming));
  }, []);

  return {
    productos,
    clientesTienda,
    setClientesTienda,
    clientesFidelizacion,
    fidelizacionConfig,
    cajaAbierta,
    loading,
    error,
    setError,
    reload,
    addFetchedProductos,
  };
};
