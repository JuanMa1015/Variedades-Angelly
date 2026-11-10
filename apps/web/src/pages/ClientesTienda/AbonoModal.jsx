import { useState } from 'react';
import { CheckCircle, MessageCircle, Printer } from 'lucide-react';
import Modal from '../../components/Modal';
import { apiPost } from '../../api/httpClient';
import { CONTACTO, SITE } from '../../config/site';
import { formatMoney } from '../../utils/format';
import { PAYMENT_METHODS, paymentLabel } from '../../utils/paymentMethods';
import MoneyInput from '../Ventas/MoneyInput';
import { printHtml } from '../Ventas/printReceipt';
import { abonoMessage, buildAbonoHtml, buildWhatsappUrl } from './tiendaHelpers';

// Paso 2: el abono quedo registrado. Se ofrece el comprobante y avisarle al cliente por WhatsApp.
const AbonoRegistrado = ({ abono, telefono, onClose }) => {
  const enlace = buildWhatsappUrl(telefono, abonoMessage(abono));
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-1 rounded-xl bg-emerald-50 px-4 py-5 text-center">
        <CheckCircle className="h-9 w-9 text-emerald-600" aria-hidden="true" />
        <p className="text-lg font-bold text-emerald-800">Abono registrado</p>
        <p className="text-sm text-emerald-700">{abono.cliente_nombre} · {formatMoney(abono.monto)} · {paymentLabel(abono.metodo_pago)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-1 text-sm">
        <dt className="text-gray-500">Deuda anterior</dt>
        <dd className="text-right font-semibold tabular-nums">{formatMoney(abono.deuda_anterior)}</dd>
        <dt className="text-gray-500">Saldo pendiente</dt>
        <dd className="text-right font-bold tabular-nums text-rosewood">{formatMoney(abono.saldo_cliente)}</dd>
      </dl>
      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => printHtml(buildAbonoHtml(abono, { site: SITE, contacto: CONTACTO }))}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir comprobante
        </button>
        {enlace && (
          <a href={enlace} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50">
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Enviar por WhatsApp
          </a>
        )}
        <button type="button" onClick={onClose} className="h-11 rounded-xl bg-rosewood text-sm font-bold text-white transition hover:opacity-90">Listo</button>
      </div>
    </div>
  );
};

// Paso 1: monto y medio de pago. «Saldar toda la deuda» llena el monto completo.
const FormularioAbono = ({ cliente, montoInicial, onRegistrado, onClose }) => {
  const [monto, setMonto] = useState(montoInicial);
  const [metodo, setMetodo] = useState('efectivo');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const deuda = Number(cliente.deuda_total || 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (monto <= 0) { setError('Ingresa un monto válido mayor a 0'); return; }
    if (monto > deuda) { setError('El abono supera la deuda actual del cliente'); return; }
    setSaving(true);
    setError('');
    try {
      const abono = await apiPost(`/api/clientes/tienda/${cliente.id}/abonos`, { monto, metodo_pago: metodo });
      await onRegistrado(abono);
    } catch (err) {
      setError(err.message || 'No fue posible registrar el abono');
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
        <MoneyInput id="abono-monto" label="Monto del abono" value={monto} onChange={setMonto} placeholder="Monto del abono" large />
        <button type="button" onClick={() => setMonto(deuda)} className="text-xs font-semibold text-rosewood underline-offset-2 hover:underline">
          Saldar toda la deuda ({formatMoney(deuda)})
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Medio de pago del abono">
        {PAYMENT_METHODS.map((met) => (
          <button key={met.id} type="button" role="radio" aria-checked={metodo === met.id} onClick={() => setMetodo(met.id)} className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${metodo === met.id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
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

const Contenido = ({ cliente, montoInicial, onRegistrado, onClose }) => {
  const [abono, setAbono] = useState(null);
  if (abono) return <AbonoRegistrado abono={abono} telefono={cliente.telefono_whatsapp} onClose={onClose} />;
  return (
    <FormularioAbono
      cliente={cliente}
      montoInicial={montoInicial}
      onRegistrado={async (nuevo) => { setAbono(nuevo); await onRegistrado(nuevo); }}
      onClose={onClose}
    />
  );
};

const AbonoModal = ({ cliente, montoInicial = 0, onRegistrado, onClose }) => (
  <Modal isOpen={cliente !== null} onClose={onClose} title="Registrar abono" maxWidth="max-w-md">
    {cliente && <Contenido key={cliente.id} cliente={cliente} montoInicial={montoInicial} onRegistrado={onRegistrado} onClose={onClose} />}
  </Modal>
);

export default AbonoModal;
