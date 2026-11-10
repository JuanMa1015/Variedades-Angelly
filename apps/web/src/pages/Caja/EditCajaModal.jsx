import { useState } from 'react';
import Modal from '../../components/Modal';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500';

const aNumero = (texto) => (texto === '' ? null : Number(texto));
const esValido = (valor) => valor === null || (Number.isFinite(valor) && valor >= 0);

// Formulario con su propio estado: se monta al abrir el modal, asi siempre parte de la caja elegida.
const FormularioEdicion = ({ caja, onSave, onClose }) => {
  const [inicial, setInicial] = useState(String(Number(caja.monto_inicial) || ''));
  const [cierre, setCierre] = useState(caja.monto_cierre != null ? String(Number(caja.monto_cierre)) : '');
  const [nota, setNota] = useState(caja.observaciones || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {};
    const montoInicial = aNumero(inicial);
    const montoCierre = aNumero(cierre);
    if (!esValido(montoInicial) || !esValido(montoCierre)) {
      setError('Los montos no pueden ser negativos');
      return;
    }
    if (montoInicial !== null && montoInicial !== Number(caja.monto_inicial)) payload.monto_inicial = montoInicial;
    if (montoCierre !== null && montoCierre !== Number(caja.monto_cierre)) payload.monto_cierre = montoCierre;
    if (nota !== (caja.observaciones || '')) payload.observaciones = nota || null;
    if (Object.keys(payload).length === 0) {
      setError('No hay cambios para guardar');
      return;
    }
    setSaving(true);
    try {
      await onSave(caja.id, payload);
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el registro');
      setSaving(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div>
        <label htmlFor="edit-caja-inicial" className={LABEL}>Monto inicial</label>
        <input id="edit-caja-inicial" type="number" min="0" value={inicial} onChange={(e) => setInicial(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label htmlFor="edit-caja-cierre" className={LABEL}>Monto contado al cerrar</label>
        <input id="edit-caja-cierre" type="number" min="0" value={cierre} onChange={(e) => setCierre(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label htmlFor="edit-caja-nota" className={LABEL}>Observaciones</label>
        <textarea id="edit-caja-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={INPUT} rows={3} maxLength={500} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
          {saving ? 'Guardando cambios...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
};

const EditCajaModal = ({ caja, onSave, onClose }) => (
  <Modal isOpen={caja !== null} onClose={onClose} title={`Editar turno ${caja?.id ?? ''}`}>
    {caja && <FormularioEdicion key={caja.id} caja={caja} onSave={onSave} onClose={onClose} />}
  </Modal>
);

export default EditCajaModal;
