import { useState } from 'react';
import { apiRequest } from '../../../api/httpClient';
import Modal from '../../../components/Modal';

const CreateVentaDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ cliente_id: '', cliente_tienda_id: '', items_json: '[]', es_fiado: false, fiado_origen: '', abono_inicial: '0', metodo_pago: '' });
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
      await apiRequest('/api/ventas', {
        method: 'POST',
        body: {
          cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
          cliente_tienda_id: form.cliente_tienda_id ? Number(form.cliente_tienda_id) : null,
          items,
          es_fiado: Boolean(form.es_fiado),
          fiado_origen: form.fiado_origen.trim() || null,
          abono_inicial: Number(form.abono_inicial || 0),
          metodo_pago: form.metodo_pago.trim() || null,
        },
      });
      setForm({ cliente_id: '', cliente_tienda_id: '', items_json: '[]', es_fiado: false, fiado_origen: '', abono_inicial: '0', metodo_pago: '' });
      onCreated('Venta creada');
    } catch (err) {
      setError(err.message || 'No se pudo crear venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-3xl" title="Crear venta" subtitle={`Alta rápida desde modal. Use JSON en 'items' similar a: {'[{"producto_id":1,"cantidad":2,"precio":10000}]'}`}>
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3">
        <input value={form.cliente_id} onChange={(e) => setForm((c) => ({ ...c, cliente_id: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="ID del cliente (opcional)" />
        <textarea value={form.items_json} onChange={(e) => setForm((c) => ({ ...c, items_json: e.target.value }))} className="min-h-28 rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder='[{"producto_id":1,"cantidad":2}]' />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear venta'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateVentaDialog;
