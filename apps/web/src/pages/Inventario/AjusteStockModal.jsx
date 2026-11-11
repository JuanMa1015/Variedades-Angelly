import { useState } from 'react';
import { ajustarStock } from '../../api/inventarioApi';
import Modal from '../../components/Modal';
import { MODOS, MOTIVOS, MOTIVOS_POR_MODO, resultadoDelAjuste } from './inventarioHelpers';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

// Antes de guardar se ve cuanto cambia y cuanto quedaria: un conteo mal escrito se nota antes de aplicarlo.
const Vista = ({ stock, resultado }) => {
  if (!resultado) return null;
  if (resultado.delta === 0) return <p className="text-sm text-gray-500">Sin cambios: el stock sigue en {stock}.</p>;
  const sube = resultado.delta > 0;
  return (
    <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${sube ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {stock} → {resultado.nuevo} unidades ({sube ? '+' : ''}{resultado.delta})
      {resultado.nuevo < 0 && ' · no puede quedar negativo'}
    </p>
  );
};

const Formulario = ({ producto, onAjustado, onClose }) => {
  const [modo, setModo] = useState('contar');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('conteo');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const stock = Number(producto.stock_actual || 0);
  const resultado = cantidad === '' ? null : resultadoDelAjuste(stock, modo, cantidad);

  // Al cambiar de modo el motivo vuelve a uno que tenga sentido para ese modo.
  const cambiarModo = (nuevo) => {
    setModo(nuevo);
    setMotivo(MOTIVOS_POR_MODO[nuevo][0]);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (cantidad === '' || !resultado) { setError('Escribe una cantidad válida'); return; }
    if (modo !== 'contar' && Number(cantidad) === 0) { setError('La cantidad debe ser mayor a 0'); return; }
    if (resultado.nuevo < 0) { setError(`No se pueden restar ${cantidad}: solo hay ${stock}`); return; }
    if (resultado.delta === 0) { setError('Nada que ajustar: el stock ya es ese'); return; }
    if (motivo === 'otro' && nota.trim().length < 3) { setError('Explica qué pasó en la nota'); return; }
    setSaving(true);
    setError('');
    try {
      const respuesta = await ajustarStock(producto.id, { modo, cantidad: Number(cantidad), motivo, nota: nota.trim() });
      await onAjustado(respuesta);
    } catch (err) {
      setError(err.message || 'No fue posible ajustar el stock');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-600">Stock actual: <strong className="text-gray-900">{stock} unidades</strong></p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div role="radiogroup" aria-label="Tipo de ajuste" className="grid grid-cols-3 gap-2">
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={modo === m.id}
            onClick={() => cambiarModo(m.id)}
            className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${modo === m.id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="ajuste-cantidad" className={LABEL}>{modo === 'contar' ? 'Unidades contadas en el estante' : 'Cantidad'}</label>
        <input id="ajuste-cantidad" type="number" min="0" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={INPUT} placeholder="0" />
      </div>
      <Vista stock={stock} resultado={resultado} />
      <div>
        <label htmlFor="ajuste-motivo" className={LABEL}>Motivo</label>
        <select id="ajuste-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT}>
          {MOTIVOS_POR_MODO[modo].map((id) => <option key={id} value={id}>{MOTIVOS[id]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="ajuste-nota" className={LABEL}>Nota {motivo === 'otro' ? '(obligatoria)' : '(opcional)'}</label>
        <input id="ajuste-nota" type="text" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} className={INPUT} placeholder="Ej: se cayó del estante" />
      </div>
      <p className="text-xs text-gray-500">Queda registrado con tu usuario, la fecha y el motivo en el historial del producto.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
          {saving ? 'Guardando...' : 'Ajustar stock'}
        </button>
      </div>
    </form>
  );
};

const AjusteStockModal = ({ producto, onAjustado, onClose }) => (
  <Modal isOpen={producto !== null} onClose={onClose} title={producto ? `Ajustar stock: ${producto.nombre}` : ''} maxWidth="max-w-md">
    {producto && <Formulario key={producto.id} producto={producto} onAjustado={onAjustado} onClose={onClose} />}
  </Modal>
);

export default AjusteStockModal;
