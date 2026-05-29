import { useState } from 'react';
import { apiRequest } from '../../../../api/httpClient';
import Modal from '../../../../components/Modal';

const CreateAuditoriaDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ modulo: '', entidad: '', entidad_id: '', accion: '', detalle: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/superadmin/auditorias', {
        method: 'POST',
        body: {
          modulo: form.modulo.trim(),
          entidad: form.entidad.trim(),
          entidad_id: form.entidad_id ? Number(form.entidad_id) : null,
          accion: form.accion.trim(),
          detalle: form.detalle.trim() || null,
          usuario: 'superadmin',
        },
      });
      setForm({ modulo: '', entidad: '', entidad_id: '', accion: '', detalle: '' });
      onCreated('Auditoria creada');
    } catch (err) {
      setError(err.message || 'No se pudo crear auditoria');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-3xl" title="Crear auditoria" subtitle="Alta rápida desde modal.">
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input value={form.modulo} onChange={(e) => setForm((c) => ({ ...c, modulo: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Módulo" required />
        <input value={form.entidad} onChange={(e) => setForm((c) => ({ ...c, entidad: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Entidad" required />
        <input value={form.entidad_id} onChange={(e) => setForm((c) => ({ ...c, entidad_id: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="ID entidad" />
        <input value={form.accion} onChange={(e) => setForm((c) => ({ ...c, accion: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Acción" required />
        <textarea value={form.detalle} onChange={(e) => setForm((c) => ({ ...c, detalle: e.target.value }))} className="min-h-28 rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none md:col-span-2" placeholder="Detalle" />
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear auditoria'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateAuditoriaDialog;
