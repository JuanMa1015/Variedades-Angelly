import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage'
import SuccessMessage from '../components/SuccessMessage'

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

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

  return (
    <div className="space-y-6">
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
                    placeholder="P. unit"
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

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Facturas registradas</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-3 font-semibold text-gray-700">Factura</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Proveedor</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Subtotal</th>
                <th className="px-3 py-3 font-semibold text-gray-700">IVA</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Total</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Ítems</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6" className="px-3 py-8 text-center text-gray-500">Cargando facturas...</td>
                </tr>
              )}

              {!loading && facturas.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-3 py-8 text-center text-gray-500">No hay facturas registradas.</td>
                </tr>
              )}

              {!loading && facturas.map((factura) => (
                <tr key={factura.id} className="border-b border-gray-100">
                  <td className="px-3 py-3 font-semibold text-gray-900">#{factura.id}</td>
                  <td className="px-3 py-3 text-gray-700">{factura.proveedor_nombre}</td>
                  <td className="px-3 py-3 text-gray-700">{formatMoney(factura.subtotal)}</td>
                  <td className="px-3 py-3 text-gray-700">{formatMoney(factura.total_iva)}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(factura.total_factura)}</td>
                  <td className="px-3 py-3 text-gray-700">{Array.isArray(factura.items) ? factura.items.length : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Facturas;
