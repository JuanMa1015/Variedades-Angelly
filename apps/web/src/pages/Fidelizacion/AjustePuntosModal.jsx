import { useState } from 'react';
import { ajustarPuntos } from '../../api/fidelizacionApi';
import Modal from '../../components/Modal';
import { MODOS_AJUSTE, resultadoDelAjuste } from './fidelizacionHelpers';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

// Antes de guardar se ve cuantos puntos quedarian: un numero mal escrito se nota antes de aplicarlo.
const Vista = ({ saldo, resultado }) => {
  if (!resultado) return null;
  if (resultado.delta === 0) return <p className="text-sm text-gray-500">Sin cambios: el cliente sigue con {saldo} puntos.</p>;
  const sube = resultado.delta > 0;
  return (
    <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${sube ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {saldo} → {resultado.nuevo} puntos ({sube ? '+' : ''}{resultado.delta})
      {resultado.nuevo < 0 && ' · no puede quedar negativo'}
    </p>
  );
};

const Formulario = ({ cliente, onAjustado, onClose }) => {
  const [modo, setModo] = useState('sumar');
  const [puntos, setPuntos] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const saldo = Number(cliente.puntos_acumulados || 0);
  const resultado = resultadoDelAjuste(saldo, modo, puntos);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!resultado) { setError('Escribe una cantidad válida'); return; }
    if (modo !== 'fijar' && Number(puntos) === 0) { setError('La cantidad debe ser mayor a 0'); return; }
    if (resultado.nuevo < 0) { setError(`No se pueden restar ${puntos}: el cliente solo tiene ${saldo}`); return; }
    if (resultado.delta === 0) { setError('Nada que ajustar: el cliente ya tiene esos puntos'); return; }
    if (motivo.trim().length < 3) { setError('Explica el motivo del ajuste (mínimo 3 letras)'); return; }
    setSaving(true);
    setError('');
    try {
      await ajustarPuntos(cliente.id, { modo, puntos: Number(puntos), motivo: motivo.trim() });
      await onAjustado(cliente);
    } catch (err) {
      setError(err.message || 'No fue posible ajustar los puntos');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-600">Puntos actuales: <strong className="text-gray-900">{saldo}</strong></p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div role="radiogroup" aria-label="Tipo de ajuste" className="grid grid-cols-3 gap-2">
        {MODOS_AJUSTE.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={modo === m.id}
            onClick={() => { setModo(m.id); setError(''); }}
            className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${modo === m.id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="ajuste-puntos" className={LABEL}>{modo === 'fijar' ? 'Puntos que debe tener' : 'Cantidad de puntos'}</label>
        <input id="ajuste-puntos" type="number" min="0" inputMode="numeric" value={puntos} onChange={(e) => setPuntos(e.target.value)} className={INPUT} placeholder="0" />
      </div>
      <Vista saldo={saldo} resultado={resultado} />
      <div>
        <label htmlFor="ajuste-motivo-puntos" className={LABEL}>Motivo (obligatorio)</label>
        <input id="ajuste-motivo-puntos" type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} className={INPUT} placeholder="Ej: puntos de una promoción" />
      </div>
      <p className="text-xs text-gray-500">Queda registrado con tu usuario, la fecha y el motivo en el historial del cliente y en la auditoría.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
          {saving ? 'Guardando...' : 'Ajustar puntos'}
        </button>
      </div>
    </form>
  );
};

const AjustePuntosModal = ({ cliente, onAjustado, onClose }) => (
  <Modal isOpen={cliente !== null} onClose={onClose} title={cliente ? `Ajustar puntos: ${cliente.nombre}` : ''} maxWidth="max-w-md">
    {cliente && <Formulario key={cliente.id} cliente={cliente} onAjustado={onAjustado} onClose={onClose} />}
  </Modal>
);

export default AjustePuntosModal;
