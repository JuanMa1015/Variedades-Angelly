import { useState } from 'react';
import { apiRequest } from '../../../api/httpClient';
import Modal from '../../../components/Modal';

const CreateAbonoCarteraDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ cliente_id: '', monto: '', metodo_pago: 'efectivo', referencia: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/cartera/abonos', {
        method: 'POST',
        body: {
          cliente_id: Number(form.cliente_id),
          monto: Number(form.monto),
          metodo_pago: form.metodo_pago,
          referencia: form.referencia.trim() || null,
        },
      });
      setForm({ cliente_id: '', monto: '', metodo_pago: 'efectivo', referencia: '' });
      onCreated('Abono creado');
    } catch (err) {
      setError(err.message || 'No se pudo crear abono');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-2xl" title="Crear abono cartera" subtitle="Alta rápida desde modal.">
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="number" min="1" value={form.cliente_id} onChange={(e) => setForm((c) => ({ ...c, cliente_id: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="ID del cliente" required />
        <input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => setForm((c) => ({ ...c, monto: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Monto" required />
        <select value={form.metodo_pago} onChange={(e) => setForm((c) => ({ ...c, metodo_pago: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none">
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
        </select>
        <input value={form.referencia} onChange={(e) => setForm((c) => ({ ...c, referencia: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Referencia (opcional)" />
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear abono'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateAbonoCarteraDialog;
