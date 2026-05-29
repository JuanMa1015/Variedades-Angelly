import { useState } from 'react';
import { apiRequest } from '../../../api/httpClient';
import Modal from '../../../components/Modal';

const CreateProductoDialog = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ nombre: '', codigo_barras: '', precio_costo: '', precio_venta: '', stock_actual: '', stock_minimo: '', catalogo: 'tienda' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Number(form.precio_costo) < 0) { setError('El precio de costo no puede ser negativo'); return; }
    if (Number(form.precio_venta) < 0) { setError('El precio de venta no puede ser negativo'); return; }
    if (Number(form.stock_actual) < 0) { setError('El stock actual no puede ser negativo'); return; }
    if (Number(form.stock_minimo) < 0) { setError('El stock minimo no puede ser negativo'); return; }
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/superadmin/productos', {
        method: 'POST',
        body: {
          nombre: form.nombre.trim(),
          codigo_barras: form.codigo_barras.trim() || null,
          precio_costo: Number(form.precio_costo || 0),
          precio_venta: Number(form.precio_venta || 0),
          stock_actual: Number(form.stock_actual || 0),
          stock_minimo: Number(form.stock_minimo || 0),
          catalogo: form.catalogo,
        },
      });
      setForm({ nombre: '', codigo_barras: '', precio_costo: '', precio_venta: '', stock_actual: '', stock_minimo: '', catalogo: 'tienda' });
      onCreated('Producto creado');
    } catch (err) {
      setError(err.message || 'No se pudo crear producto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="admin" maxWidth="max-w-4xl" title="Crear producto" subtitle="Alta rápida desde modal.">
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input value={form.nombre} onChange={(e) => setForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Nombre" required />
        <input value={form.codigo_barras} onChange={(e) => setForm((c) => ({ ...c, codigo_barras: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Código barras" />
        <select value={form.catalogo} onChange={(e) => setForm((c) => ({ ...c, catalogo: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none">
          <option value="tienda">Tienda</option>
          <option value="cartera">Cartera</option>
        </select>
        <input type="number" min="0" step="0.01" value={form.precio_costo} onChange={(e) => setForm((c) => ({ ...c, precio_costo: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Precio costo" />
        <input type="number" min="0" step="0.01" value={form.precio_venta} onChange={(e) => setForm((c) => ({ ...c, precio_venta: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Precio venta" />
        <input type="number" min="0" value={form.stock_actual} onChange={(e) => setForm((c) => ({ ...c, stock_actual: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Stock actual" />
        <input type="number" min="0" value={form.stock_minimo} onChange={(e) => setForm((c) => ({ ...c, stock_minimo: e.target.value }))} className="rounded-xl border border-blush-300 px-3 py-2 text-sm focus:border-blush-300 focus:outline-none" placeholder="Stock minimo" />
        <div className="md:col-span-3 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300">{saving ? 'Guardando…' : 'Crear producto'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateProductoDialog;
