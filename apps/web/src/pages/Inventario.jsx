import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Barcode, ImageUp, Link, Package, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/httpClient';
import { resolveImageUrl } from '../api/imagesApi';
import { ajustarStock, buscarPorCodigo } from '../api/inventarioApi';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import Skeleton, { SkeletonCard } from '../components/Skeleton';
import useConfirm from '../components/useConfirm';
import { formatMoney } from '../utils/format';
import Modal from '../components/Modal';
import PaginationControls from '../components/PaginationControls';
import AjusteStockModal from './Inventario/AjusteStockModal';
import EditarProductoModal from './Inventario/EditarProductoModal';
import { ESTADOS_STOCK, FILTROS_STOCK, estadoStock } from './Inventario/inventarioHelpers';
import { useInventario } from './Inventario/useInventario';

const EMPTY_MANUAL_FORM = { nombre: '', codigo_barras: '', precio_costo: '', precio_venta: '', stock_actual: '', stock_minimo: '', proveedor_id: '' };

const TarjetaResumen = ({ titulo, valor, tono = 'text-gray-900', activa = false, onClick, children }) => {
  const contenido = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{titulo}</p>
      <p className={`mt-2 text-2xl font-bold sm:text-3xl ${tono}`}>{valor}</p>
      {children}
    </>
  );
  const base = 'rounded-2xl border bg-white p-4 text-left shadow-sm sm:p-5';
  if (!onClick) return <div className={`${base} border-gray-200`}>{contenido}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`${base} transition hover:shadow-md ${activa ? 'border-rosewood ring-2 ring-rosewood/20' : 'border-gray-200'}`}>
      {contenido}
    </button>
  );
};

// El stock se lee de un vistazo: agotado en rojo, bajo en ambar, el resto normal.
const StockCelda = ({ producto }) => {
  const estado = estadoStock(producto);
  const { etiqueta, clase } = ESTADOS_STOCK[estado];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={estado === 'ok' ? clase : `font-bold ${estado === 'agotado' ? 'text-red-700' : 'text-amber-700'}`}>{producto.stock_actual}</span>
      {etiqueta && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${clase}`}>{etiqueta}</span>}
    </span>
  );
};

const Inventario = () => {
  const { token, user } = useAuth();
  // Desactivar productos es solo de admin/superadmin (el backend responde 403 al vendedor).
  const canDeactivate = user?.role === 'admin' || user?.role === 'superadmin';

  const [proveedores, setProveedores] = useState([]);
  const [activeMode, setActiveMode] = useState('manual');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProducto, setEditingProducto] = useState(null);
  const [ajustando, setAjustando] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const [manualForm, setManualForm] = useState({ ...EMPTY_MANUAL_FORM });

  const [barcodeForm, setBarcodeForm] = useState({
    codigo_barras: '',
    nombre: '',
    precio_costo: '',
    precio_venta: '',
    stock_actual: '',
    proveedor_id: '',
  });

  const [manualImageMode, setManualImageMode] = useState('upload');
  const [manualImageFile, setManualImageFile] = useState(null);
  const [manualImagePreview, setManualImagePreview] = useState(null);
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [barcodeImageMode, setBarcodeImageMode] = useState('upload');
  const [barcodeImageFile, setBarcodeImageFile] = useState(null);
  const [barcodeImagePreview, setBarcodeImagePreview] = useState(null);
  const [barcodeImageUrl, setBarcodeImageUrl] = useState('');

  const { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload } = useInventario(token);
  const productos = lista.data;
  const { confirm, ConfirmModal } = useConfirm();
  const recargar = useCallback(() => reload({ silent: true }), [reload]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  useEffect(() => {
    if (!token) {
      setProveedores([]);
      return undefined;
    }
    const controller = new AbortController();
    apiGet('/api/proveedores', { signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted) setProveedores(Array.isArray(payload) ? payload : []); })
      .catch(() => { /* sin proveedores el formulario sigue funcionando */ });
    return () => controller.abort();
  }, [token]);

  const createProducto = async (payload) => {
    return apiPost('/api/productos', payload);
  };

  const handleSubmitManual = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!manualForm.nombre.trim()) {
      setError('Nombre de producto obligatorio');
      return;
    }

    if (
      Number(manualForm.precio_costo) < 0 ||
      Number(manualForm.precio_venta) < 0 ||
      Number(manualForm.stock_actual) < 0
    ) {
      setError('Los valores numéricos no pueden ser negativos.');
      return;
    }

    try {
      setSaving(true);
      const imagen_url = await resolveImageUrl(manualImageUrl.trim(), manualImageFile);
      await createProducto({
        nombre: manualForm.nombre.trim(),
        codigo_barras: manualForm.codigo_barras.trim() || null,
        precio_costo: Number(manualForm.precio_costo || 0),
        precio_venta: Number(manualForm.precio_venta || 0),
        stock_actual: Number(manualForm.stock_actual || 0),
        stock_minimo: Number(manualForm.stock_minimo || 0),
        catalogo: 'tienda',
        proveedor_id: manualForm.proveedor_id ? Number(manualForm.proveedor_id) : null,
        imagen_url,
      });
      setManualForm({ ...EMPTY_MANUAL_FORM });
      setManualImageFile(null);
      setManualImagePreview(null);
      setManualImageUrl('');
      await recargar();
      setSuccess('Producto agregado correctamente');
      setIsCreateModalOpen(false);
    } catch (err) {
      setError(err.message || 'No se pudo agregar el producto');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitBarcode = async (event) => {
    event.preventDefault();
    clearMessages();

    const code = barcodeForm.codigo_barras.trim();
    if (!code) {
      setError('Ingresa o escanea un código de barras');
      return;
    }

    if (
      Number(barcodeForm.precio_costo) < 0 ||
      Number(barcodeForm.precio_venta) < 0 ||
      Number(barcodeForm.stock_actual) < 0
    ) {
      setError('Los valores numéricos no pueden ser negativos.');
      return;
    }

    try {
      setSaving(true);
      const existing = await buscarPorCodigo(code);

      if (existing) {
        await ajustarStock(existing.id, {
          modo: 'sumar',
          cantidad: Number(barcodeForm.stock_actual || 1),
          motivo: 'ingreso_sin_factura',
        });
        if (barcodeForm.proveedor_id) {
          await apiPatch(`/api/productos/${existing.id}`, {
            proveedor_id: Number(barcodeForm.proveedor_id),
          });
        }
        await recargar();
        setSuccess(`Stock actualizado para ${existing.nombre}`);
        setIsCreateModalOpen(false);
      } else {
        if (!barcodeForm.nombre.trim()) {
          setError('Para un código nuevo, ingresa el nombre del producto');
          return;
        }
        const imagen_url = await resolveImageUrl(barcodeImageUrl.trim(), barcodeImageFile);
        await createProducto({
          nombre: barcodeForm.nombre.trim(),
          codigo_barras: code,
          precio_costo: Number(barcodeForm.precio_costo || 0),
          precio_venta: Number(barcodeForm.precio_venta || 0),
          stock_actual: Number(barcodeForm.stock_actual || 1),
          catalogo: 'tienda',
          proveedor_id: barcodeForm.proveedor_id ? Number(barcodeForm.proveedor_id) : null,
          imagen_url,
        });
        await recargar();
        setSuccess('Producto creado por código de barras');
        setIsCreateModalOpen(false);
      }

      setBarcodeForm({
        codigo_barras: '',
        nombre: '',
        precio_costo: '',
        precio_venta: '',
        stock_actual: '',
        proveedor_id: '',
      });
      setBarcodeImageFile(null);
      setBarcodeImagePreview(null);
      setBarcodeImageUrl('');
    } catch (err) {
      setError(err.message || 'No se pudo procesar el código de barras');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (producto) => {
    clearMessages();
    setEditingProducto(producto);
  };

  const handleGuardado = async (nombre) => {
    setEditingProducto(null);
    setSuccess(`Producto "${nombre}" actualizado`);
    await recargar();
  };

  const handleAjustado = async ({ producto, movimiento }) => {
    setAjustando(null);
    setEditingProducto(null);
    setSuccess(`Stock de "${producto.nombre}": ${movimiento.stock_resultante - movimiento.delta} → ${movimiento.stock_resultante}`);
    await recargar();
  };

  const handleDelete = async (producto) => {
    const ok = await confirm({ message: `¿Desactivar "${producto.nombre}"?` });
    if (!ok) return;
    clearMessages();

    try {
      await apiDelete(`/api/productos/${producto.id}`);
      await recargar();
      setSuccess(`Producto "${producto.nombre}" desactivado`);
    } catch (err) {
      setError(err.message || 'No se pudo desactivar el producto');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-600">Catálogo de tienda y control de stock</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Ingreso de productos</h2>
            <p className="text-sm text-gray-600">Agrega productos nuevos o por código de barras desde un solo flujo.</p>
          </div>

          <button
            type="button"
            onClick={() => {
              clearMessages();
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Agregar producto
          </button>
        </div>
      </section>

      <Modal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); setManualForm({ ...EMPTY_MANUAL_FORM }); setManualImageFile(null); setManualImagePreview(null); setManualImageUrl(''); setBarcodeForm({ codigo_barras: '', nombre: '', precio_costo: '', precio_venta: '', stock_actual: '', proveedor_id: '' }); setBarcodeImageFile(null); setBarcodeImagePreview(null); setBarcodeImageUrl(''); }} title="Agregar producto al inventario" maxWidth="max-w-4xl">

            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveMode('manual')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeMode === 'manual'
                    ? 'bg-rosewood text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Carga manual
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('barcode')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeMode === 'barcode'
                    ? 'bg-rosewood text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Barcode className="h-4 w-4" />
                Por código de barras
              </button>
            </div>

            {activeMode === 'manual' && (
              <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={handleSubmitManual}>
                <input
                  type="text"
                  value={manualForm.nombre}
                  onChange={(event) => setManualForm((c) => ({ ...c, nombre: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Nombre"
                />
                <input
                  type="text"
                  value={manualForm.codigo_barras}
                  onChange={(event) => setManualForm((c) => ({ ...c, codigo_barras: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Código barras (opcional)"
                />
                <input
                  type="number"
                  min="0"
                  value={manualForm.precio_costo}
                  onChange={(event) => setManualForm((c) => ({ ...c, precio_costo: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Precio costo (ej: 3500)"
                />
                <input
                  type="number"
                  min="0"
                  value={manualForm.precio_venta}
                  onChange={(event) => setManualForm((c) => ({ ...c, precio_venta: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Precio venta (ej: 5000)"
                />
                <input
                  type="number"
                  min="0"
                  value={manualForm.stock_actual}
                  onChange={(event) => setManualForm((c) => ({ ...c, stock_actual: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Stock inicial (ej: 20)"
                />
                <input
                  type="number"
                  min="0"
                  value={manualForm.stock_minimo}
                  onChange={(event) => setManualForm((c) => ({ ...c, stock_minimo: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Stock mínimo (ej: 5)"
                />
                <select
                  value={manualForm.proveedor_id}
                  onChange={(event) => setManualForm((c) => ({ ...c, proveedor_id: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                >
                  <option value="">Sin proveedor</option>
                  {proveedores.filter((p) => p.activo).map((prov) => (
                    <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                  ))}
                </select>
                <div className="md:col-span-3">
                  <div className="flex gap-1 rounded-lg border border-gray-300 p-0.5 bg-gray-50 mb-2">
                    {['upload', 'url'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setManualImageMode(m)}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${manualImageMode === m ? 'bg-white text-rosewood shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {m === 'upload' ? <><ImageUp className="h-3.5 w-3.5" /> Subir archivo</> : <><Link className="h-3.5 w-3.5" /> Pegar URL</>}
                      </button>
                    ))}
                  </div>
                  {manualImageMode === 'upload' ? (
                    manualImagePreview ? (
                      <div className="relative inline-block">
                        <img src={manualImagePreview} alt="Vista previa de la imagen manual del producto" className="h-20 w-20 rounded-lg border border-gray-300 object-cover" />
                        <button type="button" onClick={() => { setManualImageFile(null); setManualImagePreview(null); setManualImageUrl(''); }} className="absolute -right-2 -top-2 rounded-full border border-gray-300 bg-white p-0.5 text-gray-500 hover:text-red-600"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-rosewood hover:text-rosewood">
                        <ImageUp className="h-4 w-4" />
                        <span>Seleccionar archivo</span>
                        <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setManualImageFile(f); setManualImageUrl(''); const r = new FileReader(); r.onload = () => setManualImagePreview(r.result); r.readAsDataURL(f); }} className="hidden" />
                      </label>
                    )
                  ) : (
                    <input
                      type="text"
                      value={manualImageUrl}
                      onChange={(e) => { setManualImageUrl(e.target.value); setManualImageFile(null); setManualImagePreview(null); }}
                      placeholder="Pega la dirección de la imagen: se guarda una copia"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                    />
                  )}
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="md:col-span-3 inline-flex items-center justify-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  <Plus className="h-4 w-4" />
                  {saving ? 'Guardando...' : 'Agregar producto'}
                </button>
              </form>
            )}

            {activeMode === 'barcode' && (
              <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={handleSubmitBarcode}>
                <input
                  type="text"
                  value={barcodeForm.codigo_barras}
                  onChange={(event) => setBarcodeForm((c) => ({ ...c, codigo_barras: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Escanear código de barras"
                />
                <input
                  type="text"
                  value={barcodeForm.nombre}
                  onChange={(event) => setBarcodeForm((c) => ({ ...c, nombre: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Nombre (si es nuevo)"
                />
                <input
                  type="number"
                  min="0"
                  value={barcodeForm.stock_actual}
                  onChange={(event) => setBarcodeForm((c) => ({ ...c, stock_actual: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Cantidad a ingresar (ej: 6)"
                />
                <input
                  type="number"
                  min="0"
                  value={barcodeForm.precio_costo}
                  onChange={(event) => setBarcodeForm((c) => ({ ...c, precio_costo: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Precio costo nuevo (ej: 3000)"
                />
                <input
                  type="number"
                  min="0"
                  value={barcodeForm.precio_venta}
                  onChange={(event) => setBarcodeForm((c) => ({ ...c, precio_venta: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Precio venta nuevo (ej: 4500)"
                />
                <select
                  value={barcodeForm.proveedor_id}
                  onChange={(event) => setBarcodeForm((c) => ({ ...c, proveedor_id: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                >
                  <option value="">Sin proveedor</option>
                  {proveedores.filter((p) => p.activo).map((prov) => (
                    <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                  ))}
                </select>
                <div className="md:col-span-3">
                  <div className="flex gap-1 rounded-lg border border-gray-300 p-0.5 bg-gray-50 mb-2">
                    {['upload', 'url'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setBarcodeImageMode(m)}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${barcodeImageMode === m ? 'bg-white text-rosewood shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {m === 'upload' ? <><ImageUp className="h-3.5 w-3.5" /> Subir archivo</> : <><Link className="h-3.5 w-3.5" /> Pegar URL</>}
                      </button>
                    ))}
                  </div>
                  {barcodeImageMode === 'upload' ? (
                    barcodeImagePreview ? (
                      <div className="relative inline-block">
                        <img src={barcodeImagePreview} alt="Vista previa de la imagen del codigo de barras" className="h-20 w-20 rounded-lg border border-gray-300 object-cover" />
                        <button type="button" onClick={() => { setBarcodeImageFile(null); setBarcodeImagePreview(null); setBarcodeImageUrl(''); }} className="absolute -right-2 -top-2 rounded-full border border-gray-300 bg-white p-0.5 text-gray-500 hover:text-red-600"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-rosewood hover:text-rosewood">
                        <ImageUp className="h-4 w-4" />
                        <span>Seleccionar archivo</span>
                        <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setBarcodeImageFile(f); setBarcodeImageUrl(''); const r = new FileReader(); r.onload = () => setBarcodeImagePreview(r.result); r.readAsDataURL(f); }} className="hidden" />
                      </label>
                    )
                  ) : (
                    <input
                      type="text"
                      value={barcodeImageUrl}
                      onChange={(e) => { setBarcodeImageUrl(e.target.value); setBarcodeImageFile(null); setBarcodeImagePreview(null); }}
                      placeholder="Pega la dirección de la imagen: se guarda una copia"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                    />
                  )}
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="md:col-span-3 inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  <Barcode className="h-4 w-4" />
                  {saving ? 'Procesando...' : 'Procesar código'}
                </button>
              </form>
            )}
      </Modal>

      <EditarProductoModal
        producto={editingProducto}
        proveedores={proveedores}
        confirmar={confirm}
        onSaved={handleGuardado}
        onAjustar={setAjustando}
        onClose={() => setEditingProducto(null)}
      />
      <AjusteStockModal producto={ajustando} onAjustado={handleAjustado} onClose={() => setAjustando(null)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading && !resumen ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : resumen && (
          <>
            <TarjetaResumen titulo="Productos" valor={resumen.total} />
            <TarjetaResumen titulo="Stock total" valor={`${resumen.stock_total} u`} />
            <TarjetaResumen titulo="Agotados" valor={resumen.agotados} tono="text-red-700" activa={filtros.estado === 'agotado'} onClick={() => setFiltro({ estado: filtros.estado === 'agotado' ? 'todos' : 'agotado' })} />
            <TarjetaResumen titulo="Bajo stock" valor={resumen.bajo_stock} tono="text-orange-600" activa={filtros.estado === 'bajo'} onClick={() => setFiltro({ estado: filtros.estado === 'bajo' ? 'todos' : 'bajo' })}>
              {resumen.urgentes.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {resumen.urgentes.slice(0, 3).map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-700">{p.nombre}</span>
                      <span className="ml-2 shrink-0 font-semibold text-orange-600">{p.stock_actual} u</span>
                    </li>
                  ))}
                </ul>
              )}
            </TarjetaResumen>
          </>
        )}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900">Productos de tienda</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, código o proveedor"
                aria-label="Buscar productos"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="w-64 rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none"
              />
              {texto && (
                <button type="button" onClick={() => setTexto('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={recargar}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Recargar
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {FILTROS_STOCK.map((filtro) => (
            <button
              key={filtro.id}
              type="button"
              aria-pressed={filtros.estado === filtro.id}
              onClick={() => setFiltro({ estado: filtro.id })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filtros.estado === filtro.id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {filtro.etiqueta}
            </button>
          ))}
          <label htmlFor="orden-productos" className="sr-only">Ordenar por</label>
          <select id="orden-productos" value={filtros.orden} onChange={(e) => setFiltro({ orden: e.target.value })} className="ml-auto rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 focus:border-rosewood focus:outline-none">
            <option value="nombre">Nombre</option>
            <option value="stock">Menos stock primero</option>
            <option value="precio">Mayor precio</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Producto</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-gray-700 md:table-cell">Imagen</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-gray-700 md:table-cell">Código</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Stock</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-gray-700 sm:table-cell">Mín</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Proveedor</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Precio venta</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-6">
                    <Skeleton lines={4} />
                  </td>
                </tr>
              ) : productos.length === 0 ? (
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td colSpan="8" className="py-8 text-center text-gray-500">
                    {texto || filtros.estado !== 'todos' ? 'No se encontraron productos con ese criterio' : 'No hay productos registrados en el catálogo de tienda'}
                  </td>
                </tr>
              ) : (
                productos.map((producto) => (
                  <tr key={producto.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{producto.nombre}</td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {producto.imagen_url ? (
                        <img src={producto.imagen_url.startsWith('http') ? producto.imagen_url : `${import.meta.env.VITE_API_URL ?? ''}${producto.imagen_url}`} alt={producto.nombre || 'Imagen del producto'} className="h-10 w-10 rounded-lg border border-gray-200 object-cover" />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-gray-700 md:table-cell">{producto.codigo_barras || '-'}</td>
                    <td className="px-4 py-3"><StockCelda producto={producto} /></td>
                    <td className="hidden px-4 py-3 text-gray-700 sm:table-cell">{producto.stock_minimo}</td>
                    <td className="px-4 py-3 text-gray-700">{producto.proveedor_nombre || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(producto.precio_venta)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(producto)}
                          className="rounded-lg border border-gray-300 p-1.5 text-gray-600 transition hover:bg-gray-100"
                          title="Editar producto"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {canDeactivate && <button
                          type="button"
                          onClick={() => handleDelete(producto)}
                          className="rounded-lg border border-gray-300 p-1.5 text-red-600 transition hover:bg-red-50"
                          title="Desactivar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {lista.totalPages > 1 && (
          <div className="mt-4">
            <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />
          </div>
        )}
      </section>

      {ConfirmModal}
    </div>
  );
};

export default Inventario;
