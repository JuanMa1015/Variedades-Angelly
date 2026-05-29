import { useState } from 'react';
import { apiRequest } from '../../../../api/httpClient';
import Modal from '../../../../components/Modal';

const CreateClienteCarteraDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ nombre: '', documento: '', telefono_whatsapp: '', limite_credito: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Number(form.limite_credito) < 0) { setError('El limite de credito no puede ser negativo'); return; }
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/cartera/clientes', {
        method: 'POST',
        body: {
          nombre: form.nombre.trim(),
          documento: form.documento.trim() || null,
          telefono_whatsapp: form.telefono_whatsapp.trim() || null,
          limite_credito: Number(form.limite_credito || 0),
        },
      });
      setForm({ nombre: '', documento: '', telefono_whatsapp: '', limite_credito: '' });
      onCreated('Cliente creado');
    } catch (err) {
      setError(err.message || 'No se pudo crear cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-2xl" title="Crear cliente cartera" subtitle="Alta rápida desde modal.">
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input value={form.nombre} onChange={(e) => setForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Nombre" required />
        <input value={form.documento} onChange={(e) => setForm((c) => ({ ...c, documento: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Documento (opcional)" />
        <input value={form.telefono_whatsapp} onChange={(e) => setForm((c) => ({ ...c, telefono_whatsapp: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Teléfono (opcional)" />
        <input type="number" min="0" value={form.limite_credito} onChange={(e) => setForm((c) => ({ ...c, limite_credito: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Límite crédito" />
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear cliente'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateClienteCarteraDialog;
