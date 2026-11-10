import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, RefreshCw, ShoppingCart, Unlock, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { deleteCaja, updateCaja } from '../api/cajaApi';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import { SkeletonCard } from '../components/Skeleton';
import useConfirm from '../components/useConfirm';
import { SITE } from '../config/site';
import { formatDateTime } from '../utils/format';
import AbrirCajaForm from './Caja/AbrirCajaForm';
import CerrarCajaForm from './Caja/CerrarCajaForm';
import EditCajaModal from './Caja/EditCajaModal';
import HistorialCaja from './Caja/HistorialCaja';
import MovimientosTurno from './Caja/MovimientosTurno';
import TurnoResumen from './Caja/TurnoResumen';
import UltimoCierre from './Caja/UltimoCierre';
import { buildCierreHtml, duracionAbierta } from './Caja/cajaHelpers';
import { useCaja } from './Caja/useCaja';
import { printHtml } from './Ventas/printReceipt';

const imprimirCierre = (caja) => printHtml(buildCierreHtml(caja, { site: SITE }));

const EstadoCaja = ({ abierta, caja }) => (
  <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border p-4 shadow-sm ${abierta ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
    <div className={`flex items-center gap-2 text-lg font-bold ${abierta ? 'text-green-700' : 'text-gray-900'}`}>
      {abierta ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
      Caja {abierta ? 'Abierta' : 'Cerrada'}
    </div>
    {abierta && caja && (
      <span className="text-sm text-gray-600">
        {caja.abierto_por} · desde {formatDateTime(caja.fecha_apertura)} ({duracionAbierta(caja.fecha_apertura)})
      </span>
    )}
    {abierta && (
      <Link to="/ventas" className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-rosewood px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90">
        <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" /> Ir a vender
      </Link>
    )}
  </div>
);

const Caja = () => {
  const { token, user } = useAuth();
  const { confirm, ConfirmModal } = useConfirm();
  const { estado, historial, loading, error, setError, version, reload } = useCaja(token);
  const [success, setSuccess] = useState('');
  const [editando, setEditando] = useState(null);

  const cajaActual = estado?.caja_actual ?? null;
  const abierta = Boolean(estado?.abierta);
  const isSuperadmin = user?.role === 'superadmin';

  const handleOpened = async () => {
    setSuccess('Caja abierta correctamente');
    await reload({ silent: true });
  };

  const handleClosed = async (mensaje) => {
    setSuccess(mensaje);
    await reload({ silent: true });
  };

  const handleSaveEdit = async (cajaId, payload) => {
    await updateCaja(cajaId, payload);
    setEditando(null);
    setSuccess('Registro de caja actualizado correctamente');
    await reload({ silent: true });
  };

  const handleDelete = async (caja) => {
    const ok = await confirm({ title: 'Eliminar registro', message: `¿Eliminar el turno ${caja.id} del ${formatDateTime(caja.fecha_apertura)}? Sus ventas se conservan.` });
    if (!ok) return;
    try {
      await deleteCaja(caja.id);
      setSuccess('Registro de caja eliminado correctamente');
      await reload({ silent: true });
    } catch (err) {
      setError(err.message || 'No fue posible eliminar el registro');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-8 w-8 text-rosewood" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Caja</h1>
          <p className="text-gray-600">Apertura, cierre y movimientos del turno</p>
        </div>
        <button
          type="button"
          onClick={() => reload({ silent: true })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Actualizar
        </button>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <EstadoCaja abierta={abierta} caja={cajaActual} />

      {loading && <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"><SkeletonCard /></div>}

      {!loading && !abierta && (
        <>
          <AbrirCajaForm onOpened={handleOpened} onError={setError} />
          {estado?.ultimo_cierre && <UltimoCierre cierre={estado.ultimo_cierre} onPrint={imprimirCierre} />}
        </>
      )}

      {!loading && abierta && cajaActual && (
        <>
          <TurnoResumen caja={cajaActual} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="mb-2 text-xl font-bold text-gray-900">Movimientos del turno</h2>
              <MovimientosTurno cajaId={cajaActual.id} version={version} />
            </section>
            <CerrarCajaForm saldoEsperado={cajaActual.saldo_esperado} confirmar={confirm} onClosed={handleClosed} onError={setError} />
          </div>
        </>
      )}

      <HistorialCaja
        historial={historial}
        loading={loading}
        version={version}
        isSuperadmin={isSuperadmin}
        onPrint={imprimirCierre}
        onEdit={setEditando}
        onDelete={handleDelete}
      />

      <EditCajaModal caja={editando} onSave={handleSaveEdit} onClose={() => setEditando(null)} />
      {ConfirmModal}
    </div>
  );
};

export default Caja;
