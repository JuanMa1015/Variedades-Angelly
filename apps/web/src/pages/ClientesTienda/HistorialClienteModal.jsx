import { useCallback, useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { apiGet, apiPost } from '../../api/httpClient';
import Modal from '../../components/Modal';
import PaginationControls from '../../components/PaginationControls';
import PaymentBadge from '../../components/PaymentBadge';
import { formatDateTime, formatMoney } from '../../utils/format';
import AnularVentaForm from '../Ventas/AnularVentaForm';
import { describirAntiguedad, estadoDe } from './tiendaHelpers';

const TarjetaMovimiento = ({ children, anulado, tono }) => (
  <li className={`rounded-xl border p-3 ${anulado ? 'border-red-200 bg-red-50/40' : tono}`}>{children}</li>
);

const Venta = ({ mov }) => (
  <TarjetaMovimiento anulado={mov.anulado} tono="border-gray-200">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Venta fiada #{mov.id}</span>
      {mov.anulado && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Anulada</span>}
      <span className="text-xs text-gray-500">{formatDateTime(mov.fecha)}</span>
      <span className={`ml-auto font-bold tabular-nums ${mov.anulado ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatMoney(mov.monto)}</span>
    </div>
    <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
      {(mov.items ?? []).map((item) => (
        <li key={`${mov.id}-${item.articulo}`} className="flex justify-between gap-3">
          <span>{item.cantidad}× {item.articulo}</span>
          <span className="tabular-nums text-gray-500">{formatMoney(item.subtotal)}</span>
        </li>
      ))}
    </ul>
    {!mov.anulado && <p className="mt-1 text-xs font-semibold text-amber-700">Quedó fiado: {formatMoney(mov.por_pagar)}</p>}
    {mov.anulado && mov.motivo_anulacion && <p className="mt-1 text-xs text-red-700">Motivo: {mov.motivo_anulacion}</p>}
  </TarjetaMovimiento>
);

const Abono = ({ mov, pideAutorizacion, anulando, onToggle, onAnulado }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAnular = async (datos) => {
    setSaving(true);
    setError('');
    try {
      await apiPost(`/api/clientes/tienda/abonos/${mov.id}/anular`, {
        motivo: datos.motivo,
        autorizador_usuario: datos.autorizadorUsuario || null,
        autorizador_password: datos.autorizadorPassword || null,
      });
      await onAnulado();
    } catch (err) {
      setError(err.message || 'No fue posible anular el abono');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TarjetaMovimiento anulado={mov.anulado} tono="border-emerald-200 bg-emerald-50/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Abono #{mov.id}</span>
        {mov.metodo_pago && <PaymentBadge method={mov.metodo_pago} compact />}
        {mov.anulado && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Anulado</span>}
        <span className="text-xs text-gray-500">{formatDateTime(mov.fecha)}</span>
        <span className={`ml-auto font-bold tabular-nums ${mov.anulado ? 'text-gray-400 line-through' : 'text-emerald-700'}`}>−{formatMoney(mov.monto)}</span>
      </div>
      {mov.referencia && <p className="text-xs text-gray-500">Ref.: {mov.referencia}</p>}
      {!mov.anulado && <p className="mt-1 text-xs text-gray-600">Saldo después del abono: <strong>{formatMoney(mov.saldo)}</strong></p>}
      {mov.anulado && mov.motivo_anulacion && <p className="mt-1 text-xs text-red-700">Motivo: {mov.motivo_anulacion}</p>}
      {!mov.anulado && (
        <button type="button" onClick={onToggle} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Anular abono
        </button>
      )}
      {anulando && <AnularVentaForm pideAutorizacion={pideAutorizacion} saving={saving} error={error} onSubmit={handleAnular} onCancel={onToggle} />}
    </TarjetaMovimiento>
  );
};

// Contenido con su propio estado: se monta al abrir, asi nunca muestra el historial del cliente anterior.
const Historial = ({ cliente, role, onChanged }) => {
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ data: [], total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [anulandoId, setAnulandoId] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await apiGet(`/api/clientes/tienda/${cliente.id}/movimientos?page=${pagina}&limit=8`, { skipCache: true }));
      setError('');
    } catch (err) {
      setError(err.message || 'No fue posible cargar el historial');
    } finally {
      setLoading(false);
    }
  }, [cliente.id, pagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const handleAnulado = async () => {
    setAnulandoId(null);
    await Promise.all([cargar(), onChanged()]);
  };

  const pideAutorizacion = role !== 'admin' && role !== 'superadmin';
  const estado = estadoDe(cliente);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">Deuda actual:</span>
        <span className="font-bold text-rosewood">{formatMoney(cliente.deuda_total)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estado.chip}`}>{estado.etiqueta}</span>
        {cliente.deuda_total > 0 && <span className="text-xs text-gray-500">{describirAntiguedad(cliente.dias_deuda)}</span>}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading && <p className="py-6 text-center text-sm text-gray-500">Cargando movimientos...</p>}
      {!loading && datos.data.length === 0 && !error && <p className="py-6 text-center text-sm text-gray-500">Este cliente todavía no tiene movimientos.</p>}
      <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {datos.data.map((mov) => (mov.tipo === 'Abono' ? (
          <Abono
            key={`a-${mov.id}`}
            mov={mov}
            pideAutorizacion={pideAutorizacion}
            anulando={anulandoId === mov.id}
            onToggle={() => setAnulandoId((actual) => (actual === mov.id ? null : mov.id))}
            onAnulado={handleAnulado}
          />
        ) : <Venta key={`v-${mov.id}`} mov={mov} />))}
      </ul>
      {datos.total_pages > 1 && <PaginationControls currentPage={pagina} totalPages={datos.total_pages} onPageChange={setPagina} />}
    </div>
  );
};

const HistorialClienteModal = ({ cliente, role, onChanged, onClose }) => (
  <Modal isOpen={cliente !== null} onClose={onClose} title={cliente?.nombre ?? ''} subtitle="Ventas fiadas y abonos" maxWidth="max-w-2xl">
    {cliente && <Historial key={cliente.id} cliente={cliente} role={role} onChanged={onChanged} />}
  </Modal>
);

export default HistorialClienteModal;
