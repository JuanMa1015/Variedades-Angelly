import { useEffect, useState } from 'react';
import { Receipt, WalletCards } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiPost } from '../api/httpClient';
import { fetchCajaEstado } from '../api/cajaApi';
import ErrorMessage from '../components/ErrorMessage';
import PaginationControls from '../components/PaginationControls';
import SuccessMessage from '../components/SuccessMessage';
import GastoForm from './Gastos/GastoForm';
import GastosLista from './Gastos/GastosLista';
import { ResumenTarjetas, TopCategorias } from './Gastos/GastosResumen';
import { useGastos } from './Gastos/useGastos';

const Gastos = () => {
  const { token, user } = useAuth();
  // Un administrador respalda la anulacion; quien no lo es debe pedir la clave de uno.
  const pideAutorizacion = !(user?.role === 'admin' || user?.role === 'superadmin');
  const { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload } = useGastos(token);

  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [success, setSuccess] = useState('');
  const [anulandoId, setAnulandoId] = useState(null);
  const [savingAnulacion, setSavingAnulacion] = useState(false);
  const [errorAnulacion, setErrorAnulacion] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    // Para avisar si un gasto en efectivo no se puede registrar; si falla, el servidor decide.
    fetchCajaEstado({ signal: controller.signal })
      .then((estado) => { if (!controller.signal.aborted) setCajaAbierta(typeof estado?.abierta === 'boolean' ? estado.abierta : null); })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  const handleCreado = async () => {
    setError('');
    setSuccess('Gasto registrado correctamente');
    await reload({ silent: true });
  };

  const handleToggleAnular = (id) => {
    setErrorAnulacion('');
    setAnulandoId((actual) => (actual === id ? null : id));
  };

  const handleAnular = async (gasto, datos) => {
    setSavingAnulacion(true);
    setErrorAnulacion('');
    try {
      await apiPost(`/api/gastos/${gasto.id}/anular`, {
        motivo: datos.motivo,
        autorizador_usuario: datos.autorizadorUsuario || null,
        autorizador_password: datos.autorizadorPassword || null,
      });
      setAnulandoId(null);
      setSuccess(`Gasto #${gasto.id} anulado: ya no cuenta en la caja`);
      await reload({ silent: true });
    } catch (err) {
      setErrorAnulacion(err.message || 'No fue posible anular el gasto');
    } finally {
      setSavingAnulacion(false);
    }
  };

  const hayFiltros = Boolean(texto || filtros.categoria || filtros.medio || filtros.estado !== 'todos');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <WalletCards className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gastos</h1>
          <p className="text-gray-600">Control de egresos operativos del negocio</p>
        </div>
      </div>

      <ResumenTarjetas resumen={resumen} loading={loading} mes={filtros.mes} onMes={(mes) => setFiltro({ mes })} />

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Registrar gasto</h2>
          <GastoForm cajaAbierta={cajaAbierta} onCreated={handleCreado} />
        </section>
        <TopCategorias resumen={resumen} />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
          <Receipt className="h-5 w-5 text-rosewood" />
          Historial de gastos
        </h2>
        <GastosLista
          gastos={lista.data}
          loading={loading}
          hayFiltros={hayFiltros}
          texto={texto}
          onTexto={setTexto}
          filtros={filtros}
          onFiltro={setFiltro}
          anulacion={{ id: anulandoId, pideAutorizacion, saving: savingAnulacion, error: errorAnulacion, onToggle: handleToggleAnular, onAnular: handleAnular }}
        />
        {lista.totalPages > 1 && (
          <div className="mt-4">
            <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />
          </div>
        )}
      </section>
    </div>
  );
};

export default Gastos;
