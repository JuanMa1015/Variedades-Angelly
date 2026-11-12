import { useState } from 'react';
import { Barcode, Plus } from 'lucide-react';
import { apiPatch, apiPost } from '../../api/httpClient';
import { resolveImageUrl } from '../../api/imagesApi';
import { ajustarStock, buscarPorCodigo } from '../../api/inventarioApi';
import Modal from '../../components/Modal';
import { formatMoney } from '../../utils/format';
import MoneyInput from '../Ventas/MoneyInput';
import { Margen } from './EditarProductoModal';
import ImagenCampo from './ImagenCampo';
import { IMAGEN_VACIA } from './imagenHelpers';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

const VACIO = { nombre: '', codigo_barras: '', precio_costo: 0, precio_venta: 0, stock_actual: '', stock_minimo: '', proveedor_id: '' };

const Campo = ({ id, etiqueta, children }) => (
  <div>
    <label htmlFor={id} className={LABEL}>{etiqueta}</label>
    {children}
  </div>
);

const SelectProveedor = ({ id, value, onChange, proveedores }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
    <option value="">Sin proveedor</option>
    {proveedores.filter((p) => p.activo).map((prov) => <option key={prov.id} value={prov.id}>{prov.nombre}</option>)}
  </select>
);

const Precios = ({ form, campo }) => (
  <>
    <Campo id="nuevo-costo" etiqueta="Precio de costo">
      <MoneyInput id="nuevo-costo" label="Precio de costo" value={form.precio_costo} onChange={campo('precio_costo')} placeholder="Ej: 3.500" />
    </Campo>
    <Campo id="nuevo-venta" etiqueta="Precio de venta">
      <MoneyInput id="nuevo-venta" label="Precio de venta" value={form.precio_venta} onChange={campo('precio_venta')} placeholder="Ej: 5.000" />
    </Campo>
    <div className="sm:col-span-2"><Margen costo={form.precio_costo} venta={form.precio_venta} /></div>
  </>
);

// Antes de guardar se avisa si se vende por debajo del costo: casi siempre es un error de digitacion.
const confirmarPrecio = (confirmar, nombre, form) => (
  form.precio_venta < form.precio_costo
    ? confirmar({ title: 'Precio por debajo del costo', message: `Vas a vender "${nombre}" a ${formatMoney(form.precio_venta)} y te cuesta ${formatMoney(form.precio_costo)}. ¿Guardar así?`, variant: 'primary' })
    : Promise.resolve(true)
);

// Carga manual: un producto nuevo con todos sus datos.
const FormularioManual = ({ proveedores, confirmar, onCreated, catalogo = 'tienda', sinStock = false }) => {
  const [form, setForm] = useState(VACIO);
  const [imagen, setImagen] = useState(IMAGEN_VACIA);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const campo = (nombre) => (valor) => setForm((actual) => ({ ...actual, [nombre]: valor }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nombre = form.nombre.trim();
    if (nombre.length < 2) { setError('Escribe el nombre del producto'); return; }
    if (!(form.precio_venta > 0)) { setError('El precio de venta debe ser mayor a 0'); return; }
    if (!(await confirmarPrecio(confirmar, nombre, form))) return;
    setSaving(true);
    setError('');
    try {
      const imagen_url = await resolveImageUrl(imagen.url.trim(), imagen.archivo);
      const creado = await apiPost('/api/productos', {
        nombre,
        codigo_barras: form.codigo_barras.trim() || null,
        precio_costo: form.precio_costo,
        precio_venta: form.precio_venta,
        stock_actual: sinStock ? 0 : Number(form.stock_actual || 0),
        stock_minimo: Number(form.stock_minimo || 0),
        catalogo,
        proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
        imagen_url,
      });
      await onCreated('Producto agregado correctamente', creado);
    } catch (err) {
      setError(err.message || 'No se pudo agregar el producto');
      setSaving(false);
    }
  };

  return (
    <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
      <Campo id="nuevo-nombre" etiqueta="Nombre">
        <input id="nuevo-nombre" type="text" value={form.nombre} onChange={(e) => campo('nombre')(e.target.value)} maxLength={120} placeholder="Ej: Arroz Diana 500g" className={INPUT} />
      </Campo>
      <Campo id="nuevo-codigo" etiqueta="Código de barras">
        <input id="nuevo-codigo" type="text" value={form.codigo_barras} onChange={(e) => campo('codigo_barras')(e.target.value)} maxLength={64} placeholder="Opcional" className={INPUT} />
      </Campo>
      <Precios form={form} campo={campo} />
      {!sinStock && (
        <Campo id="nuevo-stock" etiqueta="Stock inicial">
          <input id="nuevo-stock" type="number" min="0" value={form.stock_actual} onChange={(e) => campo('stock_actual')(e.target.value)} placeholder="Ej: 20" className={INPUT} />
        </Campo>
      )}
      <Campo id="nuevo-minimo" etiqueta="Stock mínimo">
        <input id="nuevo-minimo" type="number" min="0" value={form.stock_minimo} onChange={(e) => campo('stock_minimo')(e.target.value)} placeholder="Ej: 5" className={INPUT} />
      </Campo>
      {proveedores && (
        <Campo id="nuevo-proveedor" etiqueta="Proveedor">
          <SelectProveedor id="nuevo-proveedor" value={form.proveedor_id} onChange={campo('proveedor_id')} proveedores={proveedores} />
        </Campo>
      )}
      <div className="sm:col-span-2"><ImagenCampo valor={imagen} onChange={setImagen} /></div>
      <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300 sm:col-span-2">
        <Plus className="h-4 w-4" aria-hidden="true" />
        {saving ? 'Guardando...' : 'Agregar producto'}
      </button>
    </form>
  );
};

// Por codigo de barras: si el producto ya existe suma unidades (con su motivo); si no, lo crea.
const FormularioCodigo = ({ proveedores, confirmar, onCreated, catalogo = 'tienda' }) => {
  const [form, setForm] = useState(VACIO);
  const [imagen, setImagen] = useState(IMAGEN_VACIA);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const campo = (nombre) => (valor) => setForm((actual) => ({ ...actual, [nombre]: valor }));

  const sumarAExistente = async (existente) => {
    await ajustarStock(existente.id, { modo: 'sumar', cantidad: Number(form.stock_actual || 1), motivo: 'ingreso_sin_factura' });
    if (form.proveedor_id) await apiPatch(`/api/productos/${existente.id}`, { proveedor_id: Number(form.proveedor_id) });
    return `Stock actualizado para ${existente.nombre}`;
  };

  const crearNuevo = async (codigo) => {
    const nombre = form.nombre.trim();
    if (!nombre) throw new Error('Para un código nuevo, ingresa el nombre del producto');
    if (!(form.precio_venta > 0)) throw new Error('El precio de venta debe ser mayor a 0');
    if (!(await confirmarPrecio(confirmar, nombre, form))) return null;
    const imagen_url = await resolveImageUrl(imagen.url.trim(), imagen.archivo);
    await apiPost('/api/productos', {
      nombre,
      codigo_barras: codigo,
      precio_costo: form.precio_costo,
      precio_venta: form.precio_venta,
      stock_actual: Number(form.stock_actual || 1),
      stock_minimo: Number(form.stock_minimo || 0),
      catalogo,
      proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
      imagen_url,
    });
    return 'Producto creado por código de barras';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const codigo = form.codigo_barras.trim();
    if (!codigo) { setError('Ingresa o escanea un código de barras'); return; }
    setSaving(true);
    setError('');
    try {
      const existente = await buscarPorCodigo(codigo, catalogo);
      const mensaje = existente ? await sumarAExistente(existente) : await crearNuevo(codigo);
      if (mensaje === null) { setSaving(false); return; }
      await onCreated(mensaje);
    } catch (err) {
      setError(err.message || 'No se pudo procesar el código de barras');
      setSaving(false);
    }
  };

  return (
    <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
      <p className="text-sm text-gray-600 sm:col-span-2">Escanea el código: si el producto ya existe se le suman las unidades; si no, se crea con los datos que escribas.</p>
      <Campo id="cod-codigo" etiqueta="Código de barras">
        <input id="cod-codigo" type="text" value={form.codigo_barras} onChange={(e) => campo('codigo_barras')(e.target.value)} placeholder="Escanear código de barras" className={INPUT} />
      </Campo>
      <Campo id="cod-cantidad" etiqueta="Cantidad a ingresar">
        <input id="cod-cantidad" type="number" min="1" value={form.stock_actual} onChange={(e) => campo('stock_actual')(e.target.value)} placeholder="Ej: 6" className={INPUT} />
      </Campo>
      <Campo id="cod-nombre" etiqueta="Nombre (solo si es nuevo)">
        <input id="cod-nombre" type="text" value={form.nombre} onChange={(e) => campo('nombre')(e.target.value)} maxLength={120} className={INPUT} />
      </Campo>
      {proveedores && (
        <Campo id="cod-proveedor" etiqueta="Proveedor">
          <SelectProveedor id="cod-proveedor" value={form.proveedor_id} onChange={campo('proveedor_id')} proveedores={proveedores} />
        </Campo>
      )}
      <Precios form={form} campo={campo} />
      <div className="sm:col-span-2"><ImagenCampo valor={imagen} onChange={setImagen} /></div>
      <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300 sm:col-span-2">
        <Barcode className="h-4 w-4" aria-hidden="true" />
        {saving ? 'Procesando...' : 'Procesar código'}
      </button>
    </form>
  );
};

const PESTANAS = [
  { id: 'manual', etiqueta: 'Carga manual' },
  { id: 'codigo', etiqueta: 'Por código de barras' },
];

// Cada pestaña se monta al abrirse: cerrar el cuadro siempre deja los formularios limpios.
// `soloManual`: sin la pestaña de codigo de barras (que suma stock) ni stock inicial; lo usa la factura de compra,
// que es la que suma las unidades.
const Contenido = ({ proveedores, confirmar, onCreated, catalogo = 'tienda', soloManual = false }) => {
  const [pestana, setPestana] = useState('manual');
  if (soloManual) return <FormularioManual proveedores={proveedores} confirmar={confirmar} onCreated={onCreated} catalogo={catalogo} sinStock />;
  const Formulario = pestana === 'manual' ? FormularioManual : FormularioCodigo;
  return (
    <>
      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {PESTANAS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} onClick={() => setPestana(p.id)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${pestana === p.id ? 'bg-rosewood text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {p.etiqueta}
          </button>
        ))}
      </div>
      <Formulario proveedores={proveedores} confirmar={confirmar} onCreated={onCreated} catalogo={catalogo} />
    </>
  );
};

const CrearProductoModal = ({ abierto, onClose, titulo = 'Agregar producto al inventario', ...resto }) => (
  <Modal isOpen={abierto} onClose={onClose} title={titulo} maxWidth="max-w-3xl">
    {abierto && <Contenido {...resto} />}
  </Modal>
);

export default CrearProductoModal;
