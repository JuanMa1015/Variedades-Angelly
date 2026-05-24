import { Gift } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiRequest } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage'
import Skeleton from '../components/Skeleton'

const UMBRAL_BONO = 100;

const Fidelizacion = () => {
  const { token } = useAuth();

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redeemingClientId, setRedeemingClientId] = useState(null);

  const fetchClientes = async (signal) => {
    const payload = await apiGet('/api/fidelizacion/clientes', { signal });
    setClientes(Array.isArray(payload) ? payload : []);
  };

  useEffect(() => {
    if (!token) {
      setClientes([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await fetchClientes(controller.signal);
      } catch {
        if (controller.signal.aborted) return;
        setError('No fue posible cargar clientes de fidelización');
        setClientes([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [token]);

  const handleCanjearBono = async (cliente) => {
    setRedeemingClientId(cliente.id);
    setError('');

    try {
      const payload = await apiRequest(`/api/fidelizacion/clientes/${cliente.id}/canjear-bono`, {
        method: 'POST',
      });

      setClientes((current) =>
        current.map((item) => (item.id === payload.id ? payload : item)),
      );
    } catch (err) {
      setError(err.message || 'No fue posible canjear el bono');
    } finally {
      setRedeemingClientId(null);
    }
  };

  const clientesConBono = useMemo(
    () => clientes.filter((item) => Number(item.puntos_acumulados ?? 0) >= UMBRAL_BONO).length,
    [clientes],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Gift className="w-8 h-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fidelización</h1>
          <p className="text-gray-600">Base independiente para clientes de bonos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 uppercase">Clientes Fidelización</p>
          <p className="text-3xl font-bold text-gray-900">{clientes.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 uppercase">Umbral de Canje</p>
          <p className="text-3xl font-bold text-gray-900">{UMBRAL_BONO}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 uppercase">Bono Disponible</p>
          <p className="text-3xl font-bold text-emerald-700">{clientesConBono}</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Nombre</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">WhatsApp</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Puntos</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                    <Skeleton lines={1} />
                  </td>
                </tr>
              )}

              {!loading && clientes.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                    No hay clientes de fidelización registrados.
                  </td>
                </tr>
              )}

              {!loading && clientes.map((cliente) => {
                const puntos = Number(cliente.puntos_acumulados ?? 0);
                const habilitado = puntos >= UMBRAL_BONO;
                const canjeando = redeemingClientId === cliente.id;

                return (
                  <tr key={cliente.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-semibold text-gray-900">{cliente.nombre}</td>
                    <td className="px-4 py-3 text-gray-700">{cliente.telefono_whatsapp}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${habilitado ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {puntos}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!habilitado || canjeando}
                        onClick={() => handleCanjearBono(cliente)}
                        className="rounded-lg px-4 py-2 bg-rosewood text-white font-semibold disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                      >
                        {canjeando ? 'Canjeando...' : '🎁 CANJEAR BONO'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Fidelizacion;
