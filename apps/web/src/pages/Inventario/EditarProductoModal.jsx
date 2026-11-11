import { useState } from 'react';
import { ImageUp, Link, X } from 'lucide-react';
import { apiPatch } from '../../api/httpClient';
import { resolveImageUrl } from '../../api/imagesApi';
import Modal from '../../components/Modal';
import { formatMoney } from '../../utils/format';
import MoneyInput from '../Ventas/MoneyInput';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';
const API_URL = import.meta.env.VITE_API_URL ?? '';

const MODOS_IMAGEN = [
  { id: 'upload', texto: 'Subir archivo', icono: <ImageUp className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'url', texto: 'Pegar URL', icono: <Link className="h-3.5 w-3.5" aria-hidden="true" /> },
];

const urlVisible = (url) => (url.startsWith('http') ? url : `${API_URL}${url}`);

// Margen sobre el precio de venta: lo que queda de cada $100 vendidos despues de pagar el producto.
const margen = (costo, venta) => (venta > 0 ? Math.round(((venta - costo) / venta) * 100) : 0);

const Margen = ({ costo, venta }) => {
  if (!(venta > 0)) return null;
  if (venta < costo) {
    return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Estás vendiendo por debajo del costo: pierdes {formatMoney(costo - venta)} por unidad.</p>;
  }
  return <p className="text-xs text-gray-500">Margen: {margen(costo, venta)}% · ganas {formatMoney(venta - costo)} por unidad.</p>;
};

// La imagen puede conservarse, cambiarse (archivo o direccion de internet) o quitarse.
const ImagenCampo = ({ actual, valor, onChange }) => {
  const [modo, setModo] = useState('upload');
  const [preview, setPreview] = useState(null);

  const elegirArchivo = (event) => {
    const archivo = event.target.files?.[0];
    if (!archivo) return;
    setPreview(URL.createObjectURL(archivo));
    onChange({ archivo, url: '', quitar: false });
  };
  const deshacer = () => { setPreview(null); onChange({ archivo: null, url: '', quitar: false }); };
  const quitar = () => { setPreview(null); onChange({ archivo: null, url: '', quitar: true }); };

  const mostrada = preview ?? (!valor.quitar && !valor.url && actual ? urlVisible(actual) : null);

  return (
    <div>
      <span className={LABEL}>Imagen</span>
      <div className="mb-2 flex gap-1 rounded-lg border border-gray-300 bg-gray-50 p-0.5">
        {MODOS_IMAGEN.map(({ id, texto, icono }) => (
          <button key={id} type="button" onClick={() => setModo(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${modo === id ? 'bg-white text-rosewood shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {icono} {texto}
          </button>
        ))}
      </div>
      {modo === 'upload' ? (
        mostrada ? (
          <div className="relative inline-block">
            <img src={mostrada} alt="Imagen del producto" className="h-20 w-20 rounded-lg border border-gray-300 object-cover" />
            <button type="button" onClick={preview ? deshacer : quitar} title={preview ? 'Descartar la nueva imagen' : 'Quitar imagen'} aria-label={preview ? 'Descartar la nueva imagen' : 'Quitar imagen'} className="absolute -right-2 -top-2 rounded-full border border-gray-300 bg-white p-0.5 text-gray-500 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-rosewood hover:text-rosewood">
            <ImageUp className="h-4 w-4" aria-hidden="true" />
            <span>{valor.quitar ? 'Sin imagen: elegir una nueva' : 'Seleccionar archivo'}</span>
            <input type="file" accept="image/*" onChange={elegirArchivo} className="hidden" />
          </label>
        )
      ) : (
        <input type="text" value={valor.url} onChange={(e) => { setPreview(null); onChange({ archivo: null, url: e.target.value, quitar: false }); }} placeholder="Pega la dirección de la imagen: se guarda una copia" aria-label="Dirección de la imagen" className={INPUT} />
      )}
    </div>
  );
};

// Solo se envia lo que el usuario cambio: asi editar un precio nunca pisa el stock ni otros campos.
const diferencias = (producto, form) => {
  const cambios = {};
  const nombre = form.nombre.trim();
  const codigo = form.codigo_barras.trim() || null;
  const proveedor = form.proveedor_id ? Number(form.proveedor_id) : null;
  if (nombre !== producto.nombre) cambios.nombre = nombre;
  if (codigo !== (producto.codigo_barras || null)) cambios.codigo_barras = codigo;
  if (form.precio_costo !== Number(producto.precio_costo)) cambios.precio_costo = form.precio_costo;
  if (form.precio_venta !== Number(producto.precio_venta)) cambios.precio_venta = form.precio_venta;
  if (Number(form.stock_minimo) !== Number(producto.stock_minimo)) cambios.stock_minimo = Number(form.stock_minimo || 0);
  if (proveedor !== (producto.proveedor_id ?? null)) cambios.proveedor_id = proveedor;
  return cambios;
};

const Formulario = ({ producto, proveedores, confirmar, onSaved, onAjustar, onClose }) => {
  const [form, setForm] = useState({
    nombre: producto.nombre || '',
    codigo_barras: producto.codigo_barras || '',
    precio_costo: Number(producto.precio_costo || 0),
    precio_venta: Number(producto.precio_venta || 0),
    stock_minimo: String(producto.stock_minimo ?? 0),
    proveedor_id: producto.proveedor_id ? String(producto.proveedor_id) : '',
  });
  const [imagen, setImagen] = useState({ archivo: null, url: '', quitar: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const campo = (nombre) => (valor) => setForm((actual) => ({ ...actual, [nombre]: valor }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cambios = diferencias(producto, form);
    const imagenCambia = Boolean(imagen.archivo || imagen.url.trim() || imagen.quitar);
    if (!form.nombre.trim()) { setError('El nombre del producto es obligatorio'); return; }
    if (!(form.precio_venta > 0)) { setError('El precio de venta debe ser mayor a 0'); return; }
    if (Number(form.stock_minimo) < 0) { setError('El stock mínimo no puede ser negativo'); return; }
    if (Object.keys(cambios).length === 0 && !imagenCambia) { setError('No hay cambios para guardar'); return; }
    if (form.precio_venta < form.precio_costo) {
      const seguro = await confirmar({ title: 'Precio por debajo del costo', message: `Vas a vender "${form.nombre.trim()}" a ${formatMoney(form.precio_venta)} y te cuesta ${formatMoney(form.precio_costo)}. ¿Guardar así?`, variant: 'primary' });
      if (!seguro) return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...cambios };
      if (imagenCambia) payload.imagen_url = imagen.quitar ? null : await resolveImageUrl(imagen.url.trim(), imagen.archivo);
      await apiPatch(`/api/productos/${producto.id}`, payload);
      await onSaved(form.nombre.trim());
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el producto');
      setSaving(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div>
        <label htmlFor="prod-nombre" className={LABEL}>Nombre</label>
        <input id="prod-nombre" type="text" value={form.nombre} onChange={(e) => campo('nombre')(e.target.value)} maxLength={120} className={INPUT} />
      </div>
      <div>
        <label htmlFor="prod-codigo" className={LABEL}>Código de barras</label>
        <input id="prod-codigo" type="text" value={form.codigo_barras} onChange={(e) => campo('codigo_barras')(e.target.value)} maxLength={64} className={INPUT} placeholder="Opcional" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="prod-costo" className={LABEL}>Precio de costo</label>
          <MoneyInput id="prod-costo" label="Precio de costo" value={form.precio_costo} onChange={campo('precio_costo')} placeholder="0" />
        </div>
        <div>
          <label htmlFor="prod-venta" className={LABEL}>Precio de venta</label>
          <MoneyInput id="prod-venta" label="Precio de venta" value={form.precio_venta} onChange={campo('precio_venta')} placeholder="0" />
        </div>
      </div>
      <Margen costo={form.precio_costo} venta={form.precio_venta} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={LABEL}>Stock actual</span>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <strong className="text-sm text-gray-900">{producto.stock_actual} u</strong>
            <button type="button" onClick={() => onAjustar(producto)} className="text-xs font-semibold text-rosewood underline-offset-2 hover:underline">Ajustar</button>
          </div>
        </div>
        <div>
          <label htmlFor="prod-minimo" className={LABEL}>Stock mínimo</label>
          <input id="prod-minimo" type="number" min="0" value={form.stock_minimo} onChange={(e) => campo('stock_minimo')(e.target.value)} className={INPUT} />
        </div>
      </div>
      <div>
        <label htmlFor="prod-proveedor" className={LABEL}>Proveedor</label>
        <select id="prod-proveedor" value={form.proveedor_id} onChange={(e) => campo('proveedor_id')(e.target.value)} className={INPUT}>
          <option value="">Sin proveedor</option>
          {proveedores.filter((p) => p.activo).map((prov) => <option key={prov.id} value={prov.id}>{prov.nombre}</option>)}
        </select>
      </div>
      <ImagenCampo actual={producto.imagen_url} valor={imagen} onChange={setImagen} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
};

const EditarProductoModal = ({ producto, ...resto }) => (
  <Modal isOpen={producto !== null} onClose={resto.onClose} title="Editar producto">
    {producto && <Formulario key={producto.id} producto={producto} {...resto} />}
  </Modal>
);

export default EditarProductoModal;
