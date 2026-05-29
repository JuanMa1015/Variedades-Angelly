import { useState } from 'react';
import { apiRequest } from '../../../../api/httpClient';
import Modal from '../../../../components/Modal';

const CreatePedidoProveedorDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ proveedor_id: '', descripcion: '', monto_estimado: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/proveedores/pedidos', {
        method: 'POST',
        body: {
          proveedor_id: Number(form.proveedor_id),
          descripcion: form.descripcion.trim(),
          monto_estimado: Number(form.monto_estimado || 0),
        },
      });
      setForm({ proveedor_id: '', descripcion: '', monto_estimado: '' });
      onCreated('Pedido creado');
    } catch (err) {
      setError(err.message || 'No se pudo crear pedido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-2xl" title="Crear pedido proveedor" subtitle="Alta rápida desde modal.">
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input value={form.proveedor_id} onChange={(e) => setForm((c) => ({ ...c, proveedor_id: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="ID del proveedor" required />
        <input value={form.descripcion} onChange={(e) => setForm((c) => ({ ...c, descripcion: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Descripción" required />
        <input type="number" min="0" value={form.monto_estimado} onChange={(e) => setForm((c) => ({ ...c, monto_estimado: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Monto estimado" />
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear pedido'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreatePedidoProveedorDialog;
