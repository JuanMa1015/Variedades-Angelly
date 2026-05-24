import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Barcode, Package, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPatch, apiPost } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import Skeleton, { SkeletonCard } from '../components/Skeleton';

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

const Inventario = () => {
  const { token } = useAuth();

  const [productos, setProductos] = useState([]);
  const [activeMode, setActiveMode] = useState('manual');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const [manualForm, setManualForm] = useState({
    nombre: '',
    codigo_barras: '',
    precio_costo: '',
    precio_venta: '',
    stock_actual: '',
  });

  const [barcodeForm, setBarcodeForm] = useState({
    codigo_barras: '',
    nombre: '',
    precio_costo: '',
    precio_venta: '',
    stock_actual: '',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
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

  useEffect(() => {
    if (!token) {
      setProductos([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        await loadProductos(controller.signal);
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
  }, [token, loadProductos]);

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
        catalogo: 'tienda',
      });
      setManualForm({
        nombre: '',
        codigo_barras: '',
        precio_costo: '',
        precio_venta: '',
        stock_actual: '',
      });
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
      });
    } catch (err) {
      setError(err.message || 'No se pudo procesar el código de barras');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return productos;
    const q = searchTerm.trim().toLowerCase();
    return productos.filter(
      (p) => p.nombre.toLowerCase().includes(q) || (p.codigo_barras && p.codigo_barras.toLowerCase().includes(q)),
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

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-gray-900">Agregar producto al inventario</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Productos</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{resumen.productos}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Stock total</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{`${resumen.totalStock} u`}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Bajo stock</p>
                  <p className="mt-2 text-3xl font-bold text-orange-600">{resumen.bajoStock}</p>
                </div>
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
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
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Código</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Stock actual</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Mínimo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Precio venta</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-4 py-6">
                    <Skeleton lines={4} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td colSpan="5" className="py-8 text-center text-gray-500">
                    {searchTerm ? 'No se encontraron productos con ese criterio' : 'No hay productos registrados en el catálogo de tienda'}
                  </td>
                </tr>
              ) : (
                filtered.map((producto) => (
                  <tr key={producto.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{producto.nombre}</td>
                    <td className="px-4 py-3 text-gray-700">{producto.codigo_barras || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{producto.stock_actual}</td>
                    <td className="px-4 py-3 text-gray-700">{producto.stock_minimo}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(producto.precio_venta)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Inventario;
