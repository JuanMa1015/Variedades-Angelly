import { useState } from 'react';
import { Info } from 'lucide-react';
import { apiPost } from '../../api/httpClient';
import ErrorMessage from '../../components/ErrorMessage';
import MoneyInput from '../Ventas/MoneyInput';
import { CATEGORIAS, MEDIOS_GASTO } from './gastosHelpers';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';
const FORM_VACIO = { categoria: 'servicios', descripcion: '', monto: '', medio_pago: 'efectivo', fecha: '' };

const hoyISO = () => new Date().toLocaleDateString('en-CA');

const Campo = ({ id, etiqueta, children }) => (
  <div>
    <label htmlFor={id} className={LABEL}>{etiqueta}</label>
    {children}
  </div>
);

// Solo el efectivo sale del cajon: por eso depende de la caja. Transferencia y tarjeta no la descuadran.
const Aviso = ({ efectivo, cajaAbierta }) => {
  if (efectivo && cajaAbierta === false) {
    return <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">La caja está cerrada: ábrela para pagar en efectivo, o elige transferencia o tarjeta.</p>;
  }
  return (
    <p className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {efectivo ? 'Sale del cajón: se descuenta del efectivo del turno abierto.' : 'No sale del cajón: queda registrado pero no cambia el efectivo de la caja.'}
    </p>
  );
};

const GastoForm = ({ cajaAbierta, onCreated }) => {
  const [form, setForm] = useState(FORM_VACIO);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const efectivo = form.medio_pago === 'efectivo';
  const cambiar = (campo) => (valor) => setForm((actual) => ({ ...actual, [campo]: valor }));
  const deEvento = (campo) => (event) => cambiar(campo)(event.target.value);

  const guardar = async (event) => {
    event.preventDefault();
    setError('');
    const descripcion = form.descripcion.trim();
    const monto = Number(form.monto);

    if (descripcion.length < 4) {
      setError('Describe el gasto (mínimo 4 letras)');
      return;
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    if (efectivo && cajaAbierta === false) {
      setError('La caja está cerrada: ábrela para pagar en efectivo, o elige transferencia o tarjeta');
      return;
    }

    try {
      setSubmitting(true);
      const creado = await apiPost('/api/gastos', {
        categoria: form.categoria,
        descripcion,
        monto,
        medio_pago: form.medio_pago,
        ...(!efectivo && form.fecha ? { fecha: form.fecha } : {}),
      });
      setForm((actual) => ({ ...actual, descripcion: '', monto: '', fecha: '' }));
      onCreated(creado);
    } catch (err) {
      setError(err.message || 'No se pudo registrar el gasto');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={guardar} noValidate>
      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="gasto-categoria" etiqueta="Categoría">
          <select id="gasto-categoria" value={form.categoria} onChange={deEvento('categoria')} className={INPUT}>
            {CATEGORIAS.map(({ id, etiqueta }) => <option key={id} value={id}>{etiqueta}</option>)}
          </select>
        </Campo>
        <Campo id="gasto-monto" etiqueta="Monto">
          <MoneyInput id="gasto-monto" label="Monto" value={form.monto} onChange={cambiar('monto')} placeholder="Ej: 120.000" />
        </Campo>
      </div>
      <Campo id="gasto-descripcion" etiqueta="Detalle del gasto">
        <textarea id="gasto-descripcion" value={form.descripcion} onChange={deEvento('descripcion')} className={`${INPUT} h-20`} placeholder="Ej: Pago de la luz de octubre" maxLength={255} />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="gasto-medio" etiqueta="Pagado con">
          <select id="gasto-medio" value={form.medio_pago} onChange={deEvento('medio_pago')} className={INPUT}>
            {MEDIOS_GASTO.map(({ id, etiqueta }) => <option key={id} value={id}>{etiqueta}</option>)}
          </select>
        </Campo>
        {!efectivo && (
          <Campo id="gasto-fecha" etiqueta="Fecha (si no fue hoy)">
            <input id="gasto-fecha" type="date" max={hoyISO()} value={form.fecha} onChange={deEvento('fecha')} className={INPUT} />
          </Campo>
        )}
      </div>
      <Aviso efectivo={efectivo} cajaAbierta={cajaAbierta} />
      <button
        type="submit"
        disabled={submitting || (efectivo && cajaAbierta === false)}
        className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {submitting ? 'Guardando gasto...' : 'Guardar gasto'}
      </button>
    </form>
  );
};

export default GastoForm;
