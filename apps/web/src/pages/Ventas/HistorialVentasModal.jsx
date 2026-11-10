import { useCallback, useEffect, useState } from 'react';
import { Ban, Printer } from 'lucide-react';
import Modal from '../../components/Modal';
import PaymentBadge from '../../components/PaymentBadge';
import { anularVenta, fetchVentasRecientes } from '../../api/ventasApi';
import { formatMoney, parseApiDate } from '../../utils/format';
import AnularVentaForm from './AnularVentaForm';
import { receiptFromVenta, sePuedeAnular } from './historyHelpers';

const hora = (fecha) => parseApiDate(fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

const BTN = 'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition';

const VentaRow = ({ venta, pideAutorizacion, onPrint, onAnulada, anulando, onToggle }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAnular = async (datos) => {
    setSaving(true);
    setError('');
    try {
      await anularVenta(venta.venta_id, datos);
      await onAnulada();
    } catch (err) {
      setError(err.message || 'No fue posible anular la venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={`rounded-xl border p-3 ${venta.anulada ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold text-gray-900">#{venta.venta_id}</span>
        <span className="text-xs text-gray-500">{hora(venta.fecha)}</span>
        {venta.metodo_pago && <PaymentBadge method={venta.metodo_pago} />}
        {venta.es_fiado && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Fiado</span>}
        {venta.anulada && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Anulada</span>}
        <span className={`ml-auto font-bold tabular-nums ${venta.anulada ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {formatMoney(venta.total)}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-gray-500">
        {(venta.detalles ?? []).map((d) => `${d.cantidad}× ${d.nombre_producto}`).join(', ')}
        {venta.cliente_nombre ? ` · ${venta.cliente_nombre}` : ''}
      </p>
      {venta.anulada && (
        <p className="mt-1 text-xs text-red-700">
          Motivo: {venta.motivo_anulacion} · Anuló {venta.anulada_por}, autorizó {venta.autorizada_por}
        </p>
      )}
      {!venta.anulada && (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => onPrint(venta)} className={`${BTN} border-gray-200 text-gray-700 hover:bg-gray-50`}>
            <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Reimprimir
          </button>
          {sePuedeAnular(venta) && (
            <button type="button" onClick={onToggle} className={`${BTN} border-red-200 text-red-700 hover:bg-red-50`}>
              <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Anular
            </button>
          )}
        </div>
      )}
      {anulando && (
        <AnularVentaForm
          pideAutorizacion={pideAutorizacion}
          saving={saving}
          error={error}
          onSubmit={handleAnular}
          onCancel={onToggle}
        />
      )}
    </li>
  );
};

// Ultimas ventas: sirve para reimprimir el comprobante y para anular una venta con autorizacion.
const HistorialVentasModal = ({ isOpen, onClose, role, onPrint, onChanged }) => {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [anulandoId, setAnulandoId] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setVentas(await fetchVentasRecientes());
      setError('');
    } catch (err) {
      setError(err.message || 'No fue posible cargar el historial');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void cargar();
  }, [isOpen, cargar]);

  const handleAnulada = async () => {
    setAnulandoId(null);
    await cargar();
    await onChanged?.();
  };

  const pideAutorizacion = role !== 'admin' && role !== 'superadmin';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Historial de ventas" subtitle="Las últimas 30 ventas" maxWidth="max-w-2xl">
      {error && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Cargando…</p>}
      {!loading && ventas.length === 0 && !error && <p className="text-sm text-gray-500">Todavía no hay ventas.</p>}
      <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {ventas.map((venta) => (
          <VentaRow
            key={venta.venta_id}
            venta={venta}
            pideAutorizacion={pideAutorizacion}
            onPrint={(v) => onPrint(receiptFromVenta(v))}
            onAnulada={handleAnulada}
            anulando={anulandoId === venta.venta_id}
            onToggle={() => setAnulandoId((actual) => (actual === venta.venta_id ? null : venta.venta_id))}
          />
        ))}
      </ul>
    </Modal>
  );
};

export default HistorialVentasModal;
