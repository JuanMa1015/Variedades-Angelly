import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage'
import SuccessMessage from '../components/SuccessMessage'
import Skeleton from '../components/Skeleton'

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const EMPTY_ITEM = {
  producto_id: '',
  cantidad: 1,
  aplica_iva: false,
  precio_unitario: '',
};

const Facturas = () => {
  const { token } = useAuth();

  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [facturas, setFacturas] = useState([]);

  const [proveedorId, setProveedorId] = useState('');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPrintFactura, setSelectedPrintFactura] = useState(null);

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

  const productosById = useMemo(
    () => new Map(productos.map((item) => [Number(item.id), item])),
    [productos],
  );

  const resumen = useMemo(() => {
    let subtotal = 0;
    let totalIva = 0;

    for (const item of items) {
      const cantidad = Number(item.cantidad || 0);
      const precio = Number(item.precio_unitario || 0);
      if (cantidad <= 0 || precio <= 0) continue;
      const base = cantidad * precio;
      subtotal += base;
      if (item.aplica_iva) totalIva += base * 0.19;
    }

    return {
      subtotal,
      totalIva,
      totalFactura: subtotal + totalIva,
    };
  }, [items]);

  const handleAddItem = () => setItems((current) => [...current, { ...EMPTY_ITEM }]);

  const handleRemoveItem = (index) => {
    setItems((current) => {
      if (current.length === 1) return [{ ...EMPTY_ITEM }];
      return current.filter((_, row) => row !== index);
    });
  };

  const handleItemChange = (index, key, value) => {
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
      });

      setFacturas((current) => [payload, ...current]);
      setItems([{ ...EMPTY_ITEM }]);
      setSuccess(`Factura #${payload.id} registrada correctamente`);
    } catch (err) {
      setError(err.message || 'No se pudo registrar la factura');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintFactura = (factura) => {
    setSelectedPrintFactura(factura);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-ticket, #print-ticket * { visibility: visible !important; }
          #print-ticket { position: fixed !important; left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; display: flex !important; align-items: center !important; justify-content: center !important; background: white !important; z-index: 99999 !important; }
          #print-ticket > div { width: 80mm !important; max-width: 80mm !important; border: none !important; box-shadow: none !important; padding: 8px 4px !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Facturas de compra</h1>
          <p className="text-gray-600">Registra facturas por proveedor con detalle de productos</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Añadir factura</h2>

        <form className="space-y-4" onSubmit={handleCreateFactura}>
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

          <div className="space-y-2">
            {items.map((item, index) => {
              const cantidad = Number(item.cantidad || 0);
              const precio = Number(item.precio_unitario || 0);
              const base = cantidad * precio;
              const iva = item.aplica_iva ? base * 0.19 : 0;
              const total = base + iva;

              return (
                <div key={`factura-item-${index}`} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 p-3 md:grid-cols-[1.5fr_110px_110px_120px_120px_44px]">
                  <select
                    value={item.producto_id}
                    onChange={(event) => handleSelectProducto(index, event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  >
                    <option value="">Producto</option>
                    {productos.map((producto) => (
                      <option key={producto.id} value={producto.id}>{producto.nombre}</option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={(event) => handleItemChange(index, 'cantidad', event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                    placeholder="Cantidad"
                  />

                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.aplica_iva}
                      onChange={(event) => handleItemChange(index, 'aplica_iva', event.target.checked)}
                    />
                    IVA
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={item.precio_unitario}
                    onChange={(event) => handleItemChange(index, 'precio_unitario', event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                    placeholder="Precio unit."
                  />

                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
                    {formatMoney(total)}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-50"
                    aria-label="Eliminar línea"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Agregar producto
          </button>

          <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm md:grid-cols-3">
            <p>Subtotal: <span className="font-semibold">{formatMoney(resumen.subtotal)}</span></p>
            <p>IVA: <span className="font-semibold">{formatMoney(resumen.totalIva)}</span></p>
            <p>Total factura: <span className="font-semibold">{formatMoney(resumen.totalFactura)}</span></p>
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
                    <th className="px-3 py-3 font-semibold text-gray-700">Proveedor</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Subtotal</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">IVA</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Total</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Ítems</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((factura) => (
                    <tr key={factura.id} className="border-b border-gray-100">
                      <td className="px-3 py-3 font-semibold text-gray-900">#{factura.id}</td>
                      <td className="px-3 py-3 text-gray-700">{factura.proveedor_nombre}</td>
                      <td className="px-3 py-3 text-gray-700">{formatMoney(factura.subtotal)}</td>
                      <td className="px-3 py-3 text-gray-700">{formatMoney(factura.total_iva)}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(factura.total_factura)}</td>
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
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Subtotal:</span>
                    <span className="text-gray-900">{formatMoney(factura.subtotal)}</span>
                  </div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-500">IVA:</span>
                    <span className="text-gray-900">{formatMoney(factura.total_iva)}</span>
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
        <div id="print-ticket" className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 print:static print:inset-auto print:z-auto">
          <div className="w-[80mm] max-w-sm rounded-xl border border-gray-300 bg-white p-6 shadow-2xl print:border-0 print:shadow-none print:p-4">
            <div className="mb-4 text-center">
              <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900">Variedades Angelly</h2>
              <p className="text-xs text-gray-600">NIT: 123.456.789-0</p>
              <p className="text-xs text-gray-600">Carrera XX #YY-ZZ, Ciudad</p>
              <p className="text-xs text-gray-600">Tel: (123) 456-7890</p>
            </div>

            <div className="mb-3 border-t border-dashed border-gray-400" />

            <div className="mb-2 text-center">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900">Factura de Compra</h3>
              <p className="text-xs text-gray-600">#{selectedPrintFactura.id}</p>
            </div>

            <div className="mb-3 border-t border-dashed border-gray-400" />

            <div className="mb-2 space-y-0.5 text-xs text-gray-700">
              <p><span className="font-semibold">Proveedor:</span> {selectedPrintFactura.proveedor_nombre}</p>
              <p><span className="font-semibold">Fecha:</span> {formatDate(selectedPrintFactura.fecha_creacion)}</p>
            </div>

            <div className="mb-1 border-t border-dashed border-gray-400" />

            <div className="grid grid-cols-[2fr_1fr_1fr] gap-x-1 gap-y-0.5 text-xs font-semibold text-gray-700">
              <span>Producto</span>
              <span className="text-right">Cant</span>
              <span className="text-right">Precio</span>
            </div>

            <div className="mb-1 border-b border-dashed border-gray-400" />

            <div className="space-y-0.5 text-xs text-gray-700">
              {Array.isArray(selectedPrintFactura.items) && selectedPrintFactura.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[2fr_1fr_1fr] gap-x-1">
                  <span className="truncate">{item.producto_nombre || `Producto #${item.producto_id}`}</span>
                  <span className="text-right">{item.cantidad}</span>
                  <span className="text-right">{formatMoney(item.precio_unitario || 0)}</span>
                </div>
              ))}
            </div>

            <div className="my-2 border-t border-dashed border-gray-400" />

            <div className="space-y-0.5 text-xs text-gray-700">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold">{formatMoney(selectedPrintFactura.subtotal || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA (19%):</span>
                <span className="font-semibold">{formatMoney(selectedPrintFactura.total_iva || 0)}</span>
              </div>
            </div>

            <div className="my-2 border-t border-double border-gray-800" />

            <div className="flex justify-between text-sm font-bold text-gray-900">
              <span>TOTAL:</span>
              <span>{formatMoney(selectedPrintFactura.total_factura || 0)}</span>
            </div>

            <div className="mt-4 border-t border-dashed border-gray-400" />

            <p className="mt-3 text-center text-xs text-gray-500">¡Gracias por su preferencia!</p>

            <button
              type="button"
              onClick={() => setSelectedPrintFactura(null)}
              className="mt-4 w-full rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-300 print:hidden"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Facturas;
