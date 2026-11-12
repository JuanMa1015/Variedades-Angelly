import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { saveCarteraAbono } from '../../../api/carteraApi';
import Modal from '../../../components/Modal';
import { formatMoney } from '../../../utils/format';
import { PAYMENT_METHODS, paymentLabel } from '../../../utils/paymentMethods';
import MoneyInput from '../../Ventas/MoneyInput';

const AbonoRegistrado = ({ cliente, abono, deudaAntes, onClose }) => (
  <div className="space-y-4">
    <div className="flex flex-col items-center gap-1 rounded-xl bg-emerald-50 px-4 py-5 text-center">
      <CheckCircle className="h-9 w-9 text-emerald-600" aria-hidden="true" />
      <p className="text-lg font-bold text-emerald-800">Abono registrado</p>
      <p className="text-sm text-emerald-700">{cliente.nombre} · {formatMoney(abono.monto)} · {paymentLabel(abono.metodo_pago)}</p>
    </div>
    <dl className="grid grid-cols-2 gap-1 text-sm">
      <dt className="text-gray-500">Deuda anterior</dt>
      <dd className="text-right font-semibold tabular-nums">{formatMoney(deudaAntes)}</dd>
      <dt className="text-gray-500">Saldo pendiente</dt>
      <dd className="text-right font-bold tabular-nums text-rosewood">{formatMoney(abono.saldo_cliente)}</dd>
    </dl>
    <button type="button" onClick={onClose} className="h-11 w-full rounded-xl bg-rosewood text-sm font-bold text-white transition hover:opacity-90">Listo</button>
  </div>
);

// Monto y medio de pago. «Saldar toda la deuda» llena el monto completo y se avisa cuanto quedara debiendo.
const Formulario = ({ cliente, onRegistrado, onClose }) => {
  const [monto, setMonto] = useState(0);
  const [metodo, setMetodo] = useState('efectivo');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [abono, setAbono] = useState(null);
  const deuda = Number(cliente.deuda_total || 0);

  if (abono) return <AbonoRegistrado cliente={cliente} abono={abono} deudaAntes={deuda} onClose={onClose} />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (monto <= 0) { setError('Ingresa un monto válido mayor a 0'); return; }
    if (monto > deuda) { setError(`El abono no puede superar la deuda actual (${formatMoney(deuda)})`); return; }
    setSaving(true);
    setError('');
    try {
      const nuevo = await saveCarteraAbono({ clienteId: cliente.id, payload: { monto, metodo_pago: metodo } });
      setAbono(nuevo);
      await onRegistrado(nuevo);
    } catch (err) {
      setError(err.message || 'No fue posible registrar el abono');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <p className="text-sm text-gray-600">
        Cliente: <span className="font-semibold text-gray-900">{cliente.nombre}</span><br />
        Deuda actual: <span className="font-semibold text-rosewood">{formatMoney(deuda)}</span>
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="space-y-2">
        <MoneyInput id="abono-cartera-monto" label="Monto del abono" value={monto} onChange={setMonto} placeholder="Monto del abono" large />
        <button type="button" onClick={() => setMonto(deuda)} className="text-xs font-semibold text-rosewood underline-offset-2 hover:underline">
          Saldar toda la deuda ({formatMoney(deuda)})
        </button>
        {monto > 0 && monto <= deuda && (
          <p className="text-xs text-gray-500">Quedará debiendo <span className="font-semibold text-gray-700">{formatMoney(deuda - monto)}</span></p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Medio de pago del abono">
        {PAYMENT_METHODS.map((met) => (
          <button key={met.id} type="button" role="radio" aria-checked={metodo === met.id} onClick={() => setMetodo(met.id)}
            className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${metodo === met.id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {met.emoji} {met.label}
          </button>
        ))}
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-rosewood px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
          {saving ? 'Guardando...' : 'Confirmar abono'}
        </button>
      </div>
    </form>
  );
};

const AbonoCarteraModal = ({ cliente, onRegistrado, onClose }) => (
  <Modal isOpen={cliente !== null && cliente !== undefined} onClose={onClose} title="Registrar abono" maxWidth="max-w-md">
    {cliente && <Formulario key={cliente.id} cliente={cliente} onRegistrado={onRegistrado} onClose={onClose} />}
  </Modal>
);

export default AbonoCarteraModal;
