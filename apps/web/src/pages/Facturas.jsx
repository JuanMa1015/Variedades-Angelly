import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Printer, Search, Trash2, X, ImageUp, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage'
import SuccessMessage from '../components/SuccessMessage'
import Skeleton from '../components/Skeleton'
import Modal from '../components/Modal';
import { formatMoney } from '../utils/format';

const EMPTY_ITEM = {
  producto_id: '',
  cantidad: 1,
  aplica_iva: false,
  precio_unitario: '',
  search: '',
};

const PORCENTAJE_DEFAULT = 0.70;
const DRAFT_KEY = 'angelly.factura.draft';

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
};

const saveDraft = (data) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* noop */ }
};

const clearDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
};

const Facturas = () => {
  const { token } = useAuth();

  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [facturas, setFacturas] = useState([]);

  const [proveedorId, setProveedorId] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [encomienda, setEncomienda] = useState('');
  const [porcentajeGanancia, setPorcentajeGanancia] = useState(String(PORCENTAJE_DEFAULT));
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPrintFactura, setSelectedPrintFactura] = useState(null);

  const [isProductoModalOpen, setIsProductoModalOpen] = useState(false);
  const [newProductoForm, setNewProductoForm] = useState({ nombre: '', codigo_barras: '', precio_costo: '', precio_venta: '', stock_actual: '' });
  const [savingProducto, setSavingProducto] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const [proveedoresPayload, productosPayload, facturasPayload] = await Promise.all([
          apiGet('/api/proveedores', { signal: controller.signal }),
          apiGet('/api/productos?catalogo=tienda', { signal: controller.signal }),
          apiGet('/api/facturas-compra', { signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;

        const proveedoresList = Array.isArray(proveedoresPayload) ? proveedoresPayload : [];
        setProveedores(proveedoresList);
        setProductos(Array.isArray(productosPayload) ? productosPayload : []);
        setFacturas(Array.isArray(facturasPayload) ? facturasPayload : []);

        setProveedorId((current) => {
          if (current) return current;
          return proveedoresList.length > 0 ? String(proveedoresList[0].id) : '';
        });

        // Restore draft
        const draft = loadDraft();
        if (draft) {
          if (draft.proveedorId) setProveedorId(draft.proveedorId);
          if (draft.numeroFactura !== undefined) setNumeroFactura(draft.numeroFactura);
          if (draft.encomienda !== undefined) setEncomienda(draft.encomienda);
          if (draft.porcentajeGanancia) setPorcentajeGanancia(draft.porcentajeGanancia);
          if (Array.isArray(draft.items) && draft.items.length > 0) {
            setItems(draft.items.map((item) => ({ ...EMPTY_ITEM, ...item, search: '' })));
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || 'No se pudo cargar facturas');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadData();
    return () => controller.abort();
  }, [token]);

  // Auto-save draft to localStorage (and on unmount)
  useEffect(() => {
    const cleanItems = items.map(({ search, _focus, _focused, ...rest }) => rest);
    saveDraft({ proveedorId, numeroFactura, encomienda, porcentajeGanancia, items: cleanItems });
    return () => {
      saveDraft({ proveedorId, numeroFactura, encomienda, porcentajeGanancia, items: cleanItems });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId, encomienda, porcentajeGanancia, items]);

  const productosById = useMemo(
    () => new Map(productos.map((item) => [Number(item.id), item])),
    [productos],
  );

  const pct = Number(porcentajeGanancia) || PORCENTAJE_DEFAULT;

  const resumen = useMemo(() => {
    let subtotal = 0;
    let totalIva = 0;
    let totalGanancia = 0;

    for (const item of items) {
      const cantidad = Number(item.cantidad || 0);
      const precio = Number(item.precio_unitario || 0);
      if (cantidad <= 0 || precio <= 0) continue;
      const base = cantidad * precio;
      subtotal += base;
      if (item.aplica_iva) totalIva += base * 0.19;
      const precioConIva = precio * (item.aplica_iva ? 1.19 : 1);
      const pvs = precioConIva / pct;
      totalGanancia += (pvs - precioConIva) * cantidad;
    }

    const enf = Number(encomienda) || 0;

    return {
      subtotal,
      totalIva,
      totalFactura: subtotal + totalIva - enf,
      encomienda: enf,
      totalGanancia,
    };
  }, [items, encomienda, pct]);

  const handleAddItem = () => setItems((current) => [...current, { ...EMPTY_ITEM }]);

  const handleRemoveItem = (index) => {
    setItems((current) => {
      if (current.length === 1) return [{ ...EMPTY_ITEM }];
      return current.filter((_, row) => row !== index);
    });
  };

  const handleItemChange = (index, key, value) => {
    // Strip leading zeros from numeric inputs
    if (key === 'cantidad' || key === 'precio_unitario') {
      if (typeof value === 'string' && value.length > 1 && value.startsWith('0') && !value.startsWith('0.')) {
        value = String(Number(value));
      }
    }
    setItems((current) => current.map((item, row) => (
      row === index
        ? { ...item, [key]: value }
        : item
    )));
  };

  const handleSelectProducto = (index, productoId) => {
    const producto = productosById.get(Number(productoId));
    handleItemChange(index, 'producto_id', productoId);
    if (producto) {
      handleItemChange(index, 'precio_unitario', String(producto.precio_costo || 0));
    }
  };

  const handleCreateFactura = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const proveedor = Number(proveedorId);
    if (!Number.isInteger(proveedor) || proveedor <= 0) {
      setError('Selecciona un proveedor');
      return;
    }

    const itemsPayload = items
      .map((item) => ({
        producto_id: Number(item.producto_id),
        cantidad: Number(item.cantidad),
        aplica_iva: Boolean(item.aplica_iva),
        precio_unitario: Number(item.precio_unitario),
      }))
      .filter((item) => Number.isInteger(item.producto_id) && item.producto_id > 0 && Number.isFinite(item.cantidad) && item.cantidad > 0 && Number.isFinite(item.precio_unitario) && item.precio_unitario > 0);

    if (itemsPayload.length === 0) {
      setError('Agrega al menos un producto válido');
      return;
    }

    try {
      setSaving(true);
      const payload = await apiPost('/api/facturas-compra', {
        proveedor_id: proveedor,
        items: itemsPayload,
        encomienda: Number(encomienda) || 0,
        porcentaje_ganancia: Number(porcentajeGanancia) || PORCENTAJE_DEFAULT,
        numero_factura: numeroFactura.trim() || null,
      });

      setFacturas((current) => [payload, ...current]);
      setItems([{ ...EMPTY_ITEM }]);
      setEncomienda('');
      setNumeroFactura('');
      clearDraft();
      setSuccess(`Factura #${payload.id} registrada correctamente`);
    } catch (err) {
      setError(err.message || 'No se pudo registrar la factura');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProducto = async (event) => {
    event.preventDefault();
    setError('');

    if (!newProductoForm.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }

    try {
      setSavingProducto(true);
      const producto = await apiPost('/api/productos', {
        nombre: newProductoForm.nombre.trim(),
        codigo_barras: newProductoForm.codigo_barras.trim() || null,
        precio_costo: Number(newProductoForm.precio_costo || 0),
        precio_venta: Number(newProductoForm.precio_venta || 0),
        stock_actual: Number(newProductoForm.stock_actual || 0),
        stock_minimo: 0,
        catalogo: 'tienda',
      });
      setProductos((current) => [...current, producto]);
      setNewProductoForm({ nombre: '', codigo_barras: '', precio_costo: '', precio_venta: '', stock_actual: '' });
      setIsProductoModalOpen(false);
      setSuccess(`Producto "${producto.nombre}" creado`);
    } catch (err) {
      setError(err.message || 'No se pudo crear el producto');
    } finally {
      setSavingProducto(false);
    }
  };

  const handlePrintFactura = (factura) => {
    setSelectedPrintFactura(factura);
    setTimeout(() => {
      window.print();
      setSelectedPrintFactura(null);
    }, 100);
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media screen { .print-ticket { display: none; } }
        @media print {
          @page { size: auto; margin: 5mm; }
          body * { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          .print-ticket, .print-ticket * { visibility: visible !important; height: auto !important; overflow: visible !important; }
          .print-ticket { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; display: block !important; padding: 5mm 8mm !important; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Facturas de compra</h1>
          <p className="text-gray-600">Registra facturas, calcula precios de venta y ganancias</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Añadir factura</h2>

        <form className="space-y-4" onSubmit={handleCreateFactura}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <select
              value={proveedorId}
              onChange={(event) => setProveedorId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
            >
              <option value="">Selecciona proveedor</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
              ))}
            </select>

            <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus-within:border-rosewood">
              <span className="text-gray-500">No. Factura:</span>
              <input
                type="text"
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                className="w-full border-0 p-0 text-sm focus:outline-none"
                placeholder="FEV-36965"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus-within:border-rosewood">
              <span className="text-gray-500">% Ganancia:</span>
              <input
                type="number"
                min="0.01"
                max="1"
                step="0.01"
                value={porcentajeGanancia}
                onChange={(e) => setPorcentajeGanancia(e.target.value)}
                className="w-20 border-0 p-0 text-sm focus:outline-none"
                placeholder="0.70"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus-within:border-rosewood">
              <span className="text-gray-500">Encomienda:</span>
              <input
                type="number"
                min="0"
                value={encomienda}
                onChange={(e) => setEncomienda(e.target.value)}
                className="w-full border-0 p-0 text-sm focus:outline-none"
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item, index) => {
              const cantidad = Number(item.cantidad || 0);
              const precio = Number(item.precio_unitario || 0);
              const base = cantidad * precio;
              const iva = item.aplica_iva ? base * 0.19 : 0;
              const total = base + iva;
              const precioConIva = precio * (item.aplica_iva ? 1.19 : 1);
              const pvs = precioConIva / pct;
              const ganancia = pvs - precioConIva;

              return (
                <div key={`factura-item-${index}`} className="rounded-xl border border-gray-200 p-3 space-y-2">
                  {/* Inputs row */}
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.5fr_90px_80px_130px]">
                    <div className="col-span-2 md:col-span-1">
                      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Producto</label>
                      <div className="relative">
                        {item.producto_id ? (
                          <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50">
                            <span className="flex-1 font-medium text-gray-900">
                              {productosById.get(Number(item.producto_id))?.nombre || 'Producto'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleItemChange(index, 'producto_id', '')}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              value={item.search}
                              onChange={(event) => handleItemChange(index, 'search', event.target.value)}
                              onFocus={() => handleItemChange(index, '_focused', true)}
                              onBlur={() => setTimeout(() => handleItemChange(index, '_focused', false), 200)}
                              className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                              placeholder="Buscar producto..."
                              autoComplete="off"
                            />
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          </div>
                        )}

                        {!item.producto_id && item._focused && (
                          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                            {(() => {
                              const q = (item.search || '').toLowerCase();
                              const filtered = productos.filter((p) =>
                                !q || p.nombre.toLowerCase().includes(q) || (p.codigo_barras && p.codigo_barras.toLowerCase().includes(q))
                              ).sort((a, b) => a.nombre.localeCompare(b.nombre));

                              if (filtered.length === 0) {
                                return <div className="px-3 py-2 text-sm text-gray-500">Sin resultados</div>;
                              }
                              return filtered.map((producto) => (
                                <button
                                  key={producto.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    handleSelectProducto(index, String(producto.id));
                                    handleItemChange(index, 'search', '');
                                    handleItemChange(index, '_focused', false);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm transition hover:bg-rosewood/10 focus:bg-rosewood/10 focus:outline-none"
                                >
                                  <span className="font-medium text-gray-900">{producto.nombre}</span>
                                  {producto.codigo_barras && (
                                    <span className="ml-2 text-xs text-gray-400">{producto.codigo_barras}</span>
                                  )}
                                </button>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(event) => handleItemChange(index, 'cantidad', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">IVA</label>
                      <label className="flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm">
                        <input
                          type="checkbox"
                          checked={item.aplica_iva}
                          onChange={(event) => handleItemChange(index, 'aplica_iva', event.target.checked)}
                        />
                        Aplica IVA
                      </label>
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio sin IVA</label>
                      <input
                        type="number"
                        min="0"
                        value={item.precio_unitario}
                        onChange={(event) => handleItemChange(index, 'precio_unitario', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Results row */}
                  {precio > 0 && (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-xs text-gray-500">Precio con IVA</span>
                        <p className="text-sm font-bold text-gray-800">{formatMoney(precioConIva)}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-xs text-gray-500">Total línea</span>
                        <p className="text-sm font-bold text-gray-800">{formatMoney(total)}</p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <span className="text-xs text-amber-600">Precio venta sugerido</span>
                        <p className="text-sm font-bold text-amber-800">{formatMoney(pvs)}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <span className="text-xs text-emerald-600">Ganancia estimada</span>
                        <p className="text-sm font-bold text-emerald-800">{formatMoney(ganancia)}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                      aria-label="Eliminar línea"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Agregar producto
            </button>
            <button
              type="button"
              onClick={() => setIsProductoModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Producto nuevo
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm md:grid-cols-5">
            <p>Subtotal: <span className="font-semibold">{formatMoney(resumen.subtotal)}</span></p>
            <p>IVA: <span className="font-semibold">{formatMoney(resumen.totalIva)}</span></p>
            <p>Encomienda: <span className="font-semibold text-red-600">-{formatMoney(resumen.encomienda)}</span></p>
            <p>Total factura: <span className="font-semibold text-gray-900">{formatMoney(resumen.totalFactura)}</span></p>
            <p>Ganancia estimada: <span className="font-semibold text-emerald-700">{formatMoney(resumen.totalGanancia)}</span></p>
          </div>

          <button
            type="submit"
            disabled={saving || loading}
            className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {saving ? 'Guardando factura...' : 'Guardar factura'}
          </button>
        </form>
      </section>

      <Modal isOpen={isProductoModalOpen} onClose={() => setIsProductoModalOpen(false)} title="Crear producto rápido">
        <form className="space-y-3" onSubmit={handleCreateProducto}>
          <input type="text" value={newProductoForm.nombre} onChange={(e) => setNewProductoForm((c) => ({ ...c, nombre: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Nombre del producto" />
          <input type="text" value={newProductoForm.codigo_barras} onChange={(e) => setNewProductoForm((c) => ({ ...c, codigo_barras: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Código de barras (opcional)" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min="0" value={newProductoForm.precio_costo} onChange={(e) => setNewProductoForm((c) => ({ ...c, precio_costo: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Precio costo" />
            <input type="number" min="0" value={newProductoForm.precio_venta} onChange={(e) => setNewProductoForm((c) => ({ ...c, precio_venta: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Precio venta" />
          </div>
          <input type="number" min="0" value={newProductoForm.stock_actual} onChange={(e) => setNewProductoForm((c) => ({ ...c, stock_actual: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Stock inicial" />
          <button type="submit" disabled={savingProducto} className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:bg-gray-300">{savingProducto ? 'Creando...' : 'Crear producto'}</button>
        </form>
      </Modal>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Facturas registradas</h2>

        {loading && <Skeleton lines={3} />}

        {!loading && facturas.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No hay facturas registradas.</p>
        )}

        {!loading && (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 font-semibold text-gray-700">Factura</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">No. Factura</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Proveedor</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Subtotal</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">IVA</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Encomienda</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Total</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">%Ganancia</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Items</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((factura) => (
                    <tr key={factura.id} className="border-b border-gray-100">
                      <td className="px-3 py-3 font-semibold text-gray-900">#{factura.id}</td>
                      <td className="px-3 py-3 text-gray-700">{factura.numero_factura || '-'}</td>
                      <td className="px-3 py-3 text-gray-700">{factura.proveedor_nombre}</td>
                      <td className="px-3 py-3 text-gray-700">{formatMoney(factura.subtotal)}</td>
                      <td className="px-3 py-3 text-gray-700">{formatMoney(factura.total_iva)}</td>
                      <td className="px-3 py-3 text-gray-700">{factura.encomienda ? formatMoney(factura.encomienda) : '-'}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(factura.total_factura)}</td>
                      <td className="px-3 py-3 text-gray-700">{factura.porcentaje_ganancia ? `${(factura.porcentaje_ganancia * 100).toFixed(0)}%` : '-'}</td>
                      <td className="px-3 py-3 text-gray-700">{Array.isArray(factura.items) ? factura.items.length : 0}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => handlePrintFactura(factura)}
                          className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-200"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Ticket
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {facturas.map((factura) => (
                <div key={factura.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="font-semibold text-gray-900">#{factura.id} - {factura.proveedor_nombre}</span>
                  </div>
                  {factura.numero_factura && (
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-500">No. Factura:</span>
                      <span className="font-semibold text-gray-900">{factura.numero_factura}</span>
                    </div>
                  )}
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Subtotal:</span>
                    <span className="text-gray-900">{formatMoney(factura.subtotal)}</span>
                  </div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-500">IVA:</span>
                    <span className="text-gray-900">{formatMoney(factura.total_iva)}</span>
                  </div>
                  {factura.encomienda ? (
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-500">Encomienda:</span>
                      <span className="text-gray-900">{formatMoney(factura.encomienda)}</span>
                    </div>
                  ) : null}
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Ganancia:</span>
                    <span className="text-gray-900">{factura.porcentaje_ganancia ? `${(factura.porcentaje_ganancia * 100).toFixed(0)}%` : '-'}</span>
                  </div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Total:</span>
                    <span className="font-semibold text-gray-900">{formatMoney(factura.total_factura)}</span>
                  </div>
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Ítems:</span>
                    <span className="text-gray-900">{Array.isArray(factura.items) ? factura.items.length : 0}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrintFactura(factura)}
                    className="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                  >
                    <Printer className="mr-1.5 inline-block h-4 w-4" />
                    Imprimir ticket
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {selectedPrintFactura && (
        <div className="print-ticket">
          <div className="w-full max-w-lg rounded-xl border border-gray-300 bg-white p-6 shadow-2xl">
            <div className="text-center">
              <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900">Variedades Angelly</h2>
              <p className="text-xs text-gray-600">NIT: 123.456.789-0</p>
              <p className="text-xs text-gray-600">Carrera XX #YY-ZZ, Ciudad</p>
              <p className="text-xs text-gray-600">Tel: (123) 456-7890</p>
            </div>

            <div className="my-3 border-t border-dashed border-gray-400" />

            <div className="mb-4">
              <h3 className="text-center text-sm font-bold uppercase tracking-wide text-gray-900">Factura de Compra</h3>
              <p className="text-center text-xs text-gray-600">No. {selectedPrintFactura.id}</p>
              {selectedPrintFactura.numero_factura && (
                <p className="text-center text-xs text-gray-600">Ref: {selectedPrintFactura.numero_factura}</p>
              )}
            </div>

            <div className="my-3 border-t border-dashed border-gray-400" />

            <div className="mb-4 space-y-1 text-xs text-gray-700">
              <p><span className="font-semibold">Proveedor:</span> {selectedPrintFactura.proveedor_nombre}</p>
              <p><span className="font-semibold">Fecha:</span> {new Date(selectedPrintFactura.fecha_creacion).toLocaleDateString()}</p>
              {selectedPrintFactura.encomienda ? <p><span className="font-semibold">Encomienda:</span> {formatMoney(selectedPrintFactura.encomienda)}</p> : null}
              {selectedPrintFactura.porcentaje_ganancia ? <p><span className="font-semibold">% Ganancia:</span> {(selectedPrintFactura.porcentaje_ganancia * 100).toFixed(0)}%</p> : null}
            </div>

            <div className="my-3 border-t border-dashed border-gray-400" />

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-gray-700">
                <thead>
                  <tr className="border-b border-gray-300 font-semibold text-gray-900">
                    <th className="whitespace-nowrap py-1 pr-2 text-left">Producto</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">Cant</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">P.Unit</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">Total</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">P.Venta</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">Ganancia</th>
                  </tr>
                </thead>
              <tbody>
                {Array.isArray(selectedPrintFactura.items) && selectedPrintFactura.items.map((item, idx) => {
                  const cantidad = Number(item.cantidad || 0);
                  const precio = Number(item.precio_unitario || 0);
                  const aplicaIva = Boolean(item.aplica_iva);
                  const total = cantidad * precio;
                  const precioConIva = precio * (aplicaIva ? 1.19 : 1);
                  const pvs = item.precio_venta_sugerido || (precioConIva / (selectedPrintFactura.porcentaje_ganancia || 0.70));
                  const ganancia = item.ganancia_estimada || (pvs - precioConIva);
                  return (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="whitespace-nowrap py-1 pr-2">{item.nombre_producto || `Producto #${item.producto_id}`}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{cantidad}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{formatMoney(precio)}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{formatMoney(total)}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{formatMoney(pvs)}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{formatMoney(ganancia)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            <div className="my-3 border-t border-dashed border-gray-400" />

            <div className="space-y-1 text-xs text-gray-700">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatMoney(selectedPrintFactura.subtotal || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA (19%):</span>
                <span>{formatMoney(selectedPrintFactura.total_iva || 0)}</span>
              </div>
              {selectedPrintFactura.encomienda ? (
                <div className="flex justify-between text-red-600">
                  <span>Encomienda:</span>
                  <span>-{formatMoney(selectedPrintFactura.encomienda)}</span>
                </div>
              ) : null}
            </div>

            <div className="my-3 border-t border-double border-gray-800" />

            <div className="flex justify-between text-sm font-bold text-gray-900">
              <span>TOTAL:</span>
              <span>{formatMoney(selectedPrintFactura.total_factura || 0)}</span>
            </div>

            <div className="mt-8 border-t border-gray-300" />

            <p className="mt-2 text-center text-xs text-gray-500">¡Gracias por su preferencia!</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Facturas;