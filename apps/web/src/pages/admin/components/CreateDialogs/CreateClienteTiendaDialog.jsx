import { useState } from 'react';
import { apiRequest } from '../../../api/httpClient';
import Modal from '../../../components/Modal';

const CreateClienteTiendaDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ nombre: '', telefono_whatsapp: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/clientes/tienda-fiado', {
        method: 'POST',
        body: {
          nombre: form.nombre.trim(),
          telefono_whatsapp: form.telefono_whatsapp.trim() || null,
        },
      });
      setForm({ nombre: '', telefono_whatsapp: '' });
      onCreated('Cliente tienda creado');
    } catch (err) {
      setError(err.message || 'No se pudo crear cliente tienda');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-2xl" title="Crear cliente tienda" subtitle="Alta rápida desde modal.">
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input value={form.nombre} onChange={(e) => setForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Nombre" required />
        <input value={form.telefono_whatsapp} onChange={(e) => setForm((c) => ({ ...c, telefono_whatsapp: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Teléfono (opcional)" />
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear cliente'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateClienteTiendaDialog;
