import { useState } from 'react';
import { inscribirCliente } from '../../api/fidelizacionApi';
import Modal from '../../components/Modal';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

// El cliente debe autorizar el uso de sus datos para inscribirlo (Ley 1581 de 2012).
const Formulario = ({ onInscrito, onClose }) => {
  const [form, setForm] = useState({ nombre: '', telefono: '', aceptaDatos: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const cambiar = (campo) => (event) => setForm((actual) => ({ ...actual, [campo]: campo === 'aceptaDatos' ? event.target.checked : event.target.value }));
  const listo = form.nombre.trim().length >= 3 && form.telefono.replace(/\D/g, '').length >= 7 && form.aceptaDatos;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!listo || saving) return;
    setSaving(true);
    setError('');
    try {
      const cliente = await inscribirCliente({ nombre: form.nombre.trim(), telefono: form.telefono.trim(), aceptaDatos: form.aceptaDatos });
      await onInscrito(cliente);
    } catch (err) {
      setError(err.message || 'No se pudo inscribir al cliente');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div>
        <label htmlFor="inscribir-nombre" className={LABEL}>Nombre</label>
        <input id="inscribir-nombre" type="text" value={form.nombre} onChange={cambiar('nombre')} className={INPUT} maxLength={120} placeholder="Ej: Maria Perez" autoFocus />
      </div>
      <div>
        <label htmlFor="inscribir-telefono" className={LABEL}>WhatsApp</label>
        <input id="inscribir-telefono" type="tel" value={form.telefono} onChange={cambiar('telefono')} className={INPUT} maxLength={25} placeholder="Ej: 300 111 2233" />
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.aceptaDatos} onChange={cambiar('aceptaDatos')} className="mt-0.5" />
        El cliente autoriza el tratamiento de sus datos (nombre y WhatsApp) para el programa de puntos.
      </label>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={saving || !listo} className="flex-1 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
          {saving ? 'Guardando...' : 'Inscribir cliente'}
        </button>
      </div>
    </form>
  );
};

const InscribirClienteModal = ({ abierto, onInscrito, onClose }) => (
  <Modal isOpen={abierto} onClose={onClose} title="Inscribir cliente en puntos" subtitle="Gana puntos en cada compra" maxWidth="max-w-md">
    {abierto && <Formulario onInscrito={onInscrito} onClose={onClose} />}
  </Modal>
);

export default InscribirClienteModal;
