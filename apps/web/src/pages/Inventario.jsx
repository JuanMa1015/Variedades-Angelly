import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Barcode, Package, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import Skeleton, { SkeletonCard } from '../components/Skeleton';
import useConfirm from '../components/useConfirm';
import { formatMoney } from '../utils/format';
import Modal from '../components/Modal';

const EMPTY_MANUAL_FORM = { nombre: '', codigo_barras: '', precio_costo: '', precio_venta: '', stock_actual: '', stock_minimo: '', proveedor_id: '' };

const Inventario = () => {
  const { token } = useAuth();

  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [activeMode, setActiveMode] = useState('manual');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProducto, setEditingProducto] = useState(null);
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

  const [editForm, setEditForm] = useState({ ...EMPTY_MANUAL_FORM });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const { confirm, ConfirmModal } = useConfirm();

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const loadProductos = useCallback(async (signal) => {
    if (!token) return;
    const payload = await apiGet('/api/productos?catalogo=tienda', { signal });
    if (signal?.aborted) return;
    setProductos(Array.isArray(payload) ? payload : []);
  }, [token]);

  const loadProveedores = useCallback(async (signal) => {
    if (!token) return;
    const payload = await apiGet('/api/proveedores', { signal });
    if (signal?.aborted) return;
    setProveedores(Array.isArray(payload) ? payload : []);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setProductos([]);
      setProveedores([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        await Promise.all([
          loadProductos(controller.signal),
          loadProveedores(controller.signal),
        ]);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || 'No fue posible cargar el inventario');
        setProductos([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [token, loadProductos, loadProveedores]);

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
      await createProducto({
        nombre: manualForm.nombre.trim(),
        codigo_barras: manualForm.codigo_barras.trim() || null,
        precio_costo: Number(manualForm.precio_costo || 0),
        precio_venta: Number(manualForm.precio_venta || 0),
        stock_actual: Number(manualForm.stock_actual || 0),
        stock_minimo: Number(manualForm.stock_minimo || 0),
        catalogo: 'tienda',
        proveedor_id: manualForm.proveedor_id ? Number(manualForm.proveedor_id) : null,
      });
      setManualForm({ ...EMPTY_MANUAL_FORM });
      await loadProductos();
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

    const existing = productos.find((item) => String(item.codigo_barras || '').trim() === code);
    try {
      setSaving(true);

      if (existing) {
        await apiPatch(`/api/productos/${existing.id}/stock`, {
          delta: Number(barcodeForm.stock_actual || 1),
        });
        if (barcodeForm.proveedor_id) {
          await apiPatch(`/api/productos/${existing.id}`, {
            proveedor_id: Number(barcodeForm.proveedor_id),
          });
        }
        await loadProductos();
        setSuccess(`Stock actualizado para ${existing.nombre}`);
        setIsCreateModalOpen(false);
      } else {
        if (!barcodeForm.nombre.trim()) {
          setError('Para un código nuevo, ingresa el nombre del producto');
          return;
        }
        await createProducto({
          nombre: barcodeForm.nombre.trim(),
          codigo_barras: code,
          precio_costo: Number(barcodeForm.precio_costo || 0),
          precio_venta: Number(barcodeForm.precio_venta || 0),
          stock_actual: Number(barcodeForm.stock_actual || 1),
          catalogo: 'tienda',
          proveedor_id: barcodeForm.proveedor_id ? Number(barcodeForm.proveedor_id) : null,
        });
        await loadProductos();
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
    } catch (err) {
      setError(err.message || 'No se pudo procesar el código de barras');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (producto) => {
    setEditForm({
      nombre: producto.nombre || '',
      codigo_barras: producto.codigo_barras || '',
      precio_costo: String(producto.precio_costo || ''),
      precio_venta: String(producto.precio_venta || ''),
      stock_actual: String(producto.stock_actual || ''),
      stock_minimo: String(producto.stock_minimo || ''),
      proveedor_id: producto.proveedor_id ? String(producto.proveedor_id) : '',
    });
    setEditingProducto(producto);
  };

  const handleSubmitEdit = async (event) => {
    event.preventDefault();
    clearMessages();

    const producto = editingProducto;
    if (!producto) return;

    if (!editForm.nombre.trim()) {
      setError('El nombre del producto es obligatorio');
      return;
    }

    if (Number(editForm.precio_costo) < 0 || Number(editForm.precio_venta) < 0 ||
        Number(editForm.stock_actual) < 0 || Number(editForm.stock_minimo) < 0) {
      setError('Los valores numéricos no pueden ser negativos.');
      return;
    }

    try {
      setSaving(true);
      await apiPatch(`/api/productos/${producto.id}`, {
        nombre: editForm.nombre.trim(),
        codigo_barras: editForm.codigo_barras.trim() || null,
        precio_costo: Number(editForm.precio_costo || 0),
        precio_venta: Number(editForm.precio_venta || 0),
        stock_actual: Number(editForm.stock_actual || 0),
        stock_minimo: Number(editForm.stock_minimo || 0),
        proveedor_id: editForm.proveedor_id ? Number(editForm.proveedor_id) : null,
      });
      await loadProductos();
      setSuccess(`Producto "${editForm.nombre.trim()}" actualizado`);
      setEditingProducto(null);
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el producto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (producto) => {
    const ok = await confirm({ message: `¿Desactivar "${producto.nombre}"?` });
    if (!ok) return;
    clearMessages();

    try {
      await apiDelete(`/api/productos/${producto.id}`);
      await loadProductos();
      setSuccess(`Producto "${producto.nombre}" desactivado`);
    } catch (err) {
      setError(err.message || 'No se pudo desactivar el producto');
    }
  };

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return productos;
    const q = searchTerm.trim().toLowerCase();
    return productos.filter(
      (p) => p.nombre.toLowerCase().includes(q)
        || (p.codigo_barras && p.codigo_barras.toLowerCase().includes(q))
        || (p.proveedor_nombre && p.proveedor_nombre.toLowerCase().includes(q)),
    );
  }, [productos, searchTerm]);

  const resumen = useMemo(() => {
    const totalStock = productos.reduce((sum, producto) => sum + Number(producto.stock_actual || 0), 0);
    const bajoStock = productos.filter((producto) => Number(producto.stock_actual || 0) <= Number(producto.stock_minimo || 0)).length;

    return {
      productos: productos.length,
      totalStock,
      bajoStock,
    };
  }, [productos]);

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

      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Agregar producto al inventario" maxWidth="max-w-4xl">

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

      <Modal isOpen={editingProducto !== null} onClose={() => setEditingProducto(null)} title="Editar producto">

            <form className="space-y-3" onSubmit={handleSubmitEdit}>
              <input
                type="text"
                value={editForm.nombre}
                onChange={(event) => setEditForm((c) => ({ ...c, nombre: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Nombre"
              />
              <input
                type="text"
                value={editForm.codigo_barras}
                onChange={(event) => setEditForm((c) => ({ ...c, codigo_barras: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Código barras"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min="0"
                  value={editForm.precio_costo}
                  onChange={(event) => setEditForm((c) => ({ ...c, precio_costo: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Precio costo"
                />
                <input
                  type="number"
                  min="0"
                  value={editForm.precio_venta}
                  onChange={(event) => setEditForm((c) => ({ ...c, precio_venta: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Precio venta"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min="0"
                  value={editForm.stock_actual}
                  onChange={(event) => setEditForm((c) => ({ ...c, stock_actual: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Stock actual"
                />
                <input
                  type="number"
                  min="0"
                  value={editForm.stock_minimo}
                  onChange={(event) => setEditForm((c) => ({ ...c, stock_minimo: event.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Stock mínimo"
                />
              </div>
              <select
                value={editForm.proveedor_id}
                onChange={(event) => setEditForm((c) => ({ ...c, proveedor_id: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              >
                <option value="">Sin proveedor</option>
                {proveedores.filter((p) => p.activo).map((prov) => (
                  <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
      </Modal>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Productos</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">{resumen.productos}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Stock total</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">{`${resumen.totalStock} u`}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Bajo stock</p>
                  <p className="mt-2 text-2xl font-bold text-orange-600 sm:text-3xl">{resumen.bajoStock}</p>
                </div>
                <AlertTriangle className="h-5 w-5 text-orange-500 sm:h-6 sm:w-6" />
              </div>
              {resumen.bajoStock > 0 && (
                <ul className="mt-3 space-y-1">
                  {productos
                    .filter((p) => Number(p.stock_actual || 0) <= Number(p.stock_minimo || 0))
                    .slice(0, 5)
                    .map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-gray-700">{p.nombre}</span>
                        <span className="ml-2 shrink-0 font-semibold text-orange-600">{p.stock_actual} u</span>
                      </li>
                    ))}
                  {resumen.bajoStock > 5 && (
                    <li className="text-xs text-gray-400">...y {resumen.bajoStock - 5} más</li>
                  )}
                </ul>
              )}
            </div>
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
                placeholder="Buscar por nombre o código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-56 rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Recargar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Producto</th>
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
                  <td colSpan="7" className="px-4 py-6">
                    <Skeleton lines={4} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td colSpan="7" className="py-8 text-center text-gray-500">
                    {searchTerm ? 'No se encontraron productos con ese criterio' : 'No hay productos registrados en el catálogo de tienda'}
                  </td>
                </tr>
              ) : (
                filtered.map((producto) => (
                  <tr key={producto.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{producto.nombre}</td>
                    <td className="hidden px-4 py-3 text-gray-700 md:table-cell">{producto.codigo_barras || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{producto.stock_actual}</td>
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
                        <button
                          type="button"
                          onClick={() => handleDelete(producto)}
                          className="rounded-lg border border-gray-300 p-1.5 text-red-600 transition hover:bg-red-50"
                          title="Desactivar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmModal />
    </div>
  );
};

export default Inventario;
