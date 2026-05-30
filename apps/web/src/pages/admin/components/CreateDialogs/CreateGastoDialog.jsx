import { useState } from 'react';
import { apiRequest } from '../../../../api/httpClient';
import Modal from '../../../../components/Modal';

const CreateGastoDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ categoria: '', descripcion: '', monto: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Number(form.monto) <= 0) { setError('El monto debe ser mayor a cero'); return; }
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/gastos', {
        method: 'POST',
        body: {
          categoria: form.categoria.trim(),
          descripcion: form.descripcion.trim(),
          monto: Number(form.monto || 0),
        },
      });
      setForm({ categoria: '', descripcion: '', monto: '' });
      onCreated('Gasto creado');
    } catch (err) {
      setError(err.message || 'No se pudo crear gasto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-2xl" title="Crear gasto" subtitle="Alta rápida desde modal.">
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input value={form.categoria} onChange={(e) => setForm((c) => ({ ...c, categoria: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Categoria" required />
        <input value={form.descripcion} onChange={(e) => setForm((c) => ({ ...c, descripcion: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Descripcion" />
        <input type="number" min="0" value={form.monto} onChange={(e) => setForm((c) => ({ ...c, monto: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Monto" required />
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear gasto'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateGastoDialog;
