import { useState } from 'react';
import { apiRequest } from '../../../../api/httpClient';
import Modal from '../../../../components/Modal';

const CreateFacturaCompraDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ proveedor_id: '', items_json: '[]' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parseItemsJson = (value) => {
    const raw = String(value || '').trim() || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('items debe ser un arreglo JSON');
    return parsed;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const items = parseItemsJson(form.items_json);
      await apiRequest('/api/facturas-compra', {
        method: 'POST',
        body: {
          proveedor_id: Number(form.proveedor_id),
          items,
        },
      });
      setForm({ proveedor_id: '', items_json: '[]' });
      onCreated('Factura creada');
    } catch (err) {
      setError(err.message || 'No se pudo crear factura');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-3xl" title="Crear factura compra" subtitle="Alta rápida desde modal. Items como JSON en 'items'.">
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3">
        <input value={form.proveedor_id} onChange={(e) => setForm((c) => ({ ...c, proveedor_id: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="ID del proveedor" required />
        <textarea value={form.items_json} onChange={(e) => setForm((c) => ({ ...c, items_json: e.target.value }))} className="min-h-28 rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder='[{"producto_id":1,"cantidad":2}]' />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear factura'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateFacturaCompraDialog;
