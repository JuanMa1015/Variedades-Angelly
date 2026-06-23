import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import ProductSelectionView from './Ventas/ProductSelectionView';
import CartPanel from './Ventas/CartPanel';
import SaleReceiptPanel from './Ventas/SaleReceiptPanel';
import { formatMoney } from '../utils/format';

const fetchJson = async ({ endpoint, signal, errorMessage }) => {
  try {
    return await apiGet(endpoint, { signal });
  } catch (error) {
    throw new Error(error.message || errorMessage);
  }
};

const Ventas = () => {
  const { token } = useAuth();

  const [productos, setProductos] = useState([]);
  const [clientesTienda, setClientesTienda] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [submittingVenta, setSubmittingVenta] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);

  const [esFiado, setEsFiado] = useState(false);
  const [clienteTiendaId, setClienteTiendaId] = useState('');
  const [items, setItems] = useState([]);
  const [montoPago, setMontoPago] = useState('0');
  const [abonoInicialFiado, setAbonoInicialFiado] = useState('0');
  const [metodoPago, setMetodoPago] = useState('efectivo');

  const [newStoreClientName, setNewStoreClientName] = useState('');
  const [newStoreClientPhone, setNewStoreClientPhone] = useState('');
  const [isStoreClientModalOpen, setIsStoreClientModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const [ventaCompletada, setVentaCompletada] = useState(null);

  const loadData = useCallback(
    async (signal) => {
      if (!token) return;

      const requestList = [
        fetchJson({
          endpoint: '/api/productos?catalogo=tienda',
          signal,
          errorMessage: 'No fue posible cargar productos',
        }),
        fetchJson({
          endpoint: '/api/clientes/tienda-fiado',
          signal,
          errorMessage: 'No fue posible cargar clientes de fiado tienda',
        }),
      ];

      const [productosPayload, tiendaPayload] = await Promise.all(requestList);

      if (signal?.aborted) return;

      setProductos(Array.isArray(productosPayload) ? productosPayload : []);
      setClientesTienda(Array.isArray(tiendaPayload) ? tiendaPayload : []);
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setProductos([]);
      setClientesTienda([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadData(controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || 'No se pudo cargar el módulo de ventas');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => controller.abort();
  }, [loadData, token]);

  const productosById = useMemo(
    () => new Map(productos.map((producto) => [Number(producto.id), producto])),
    [productos],
  );

  const totalEstimado = useMemo(
    () => items.reduce((acc, item) => {
      const producto = productosById.get(Number(item.producto_id));
      const cantidad = Number(item.cantidad || 0);
      if (!producto || cantidad <= 0) return acc;
      return acc + Number(producto.precio_venta || 0) * cantidad;
    }, 0),
    [items, productosById],
  );

  const cambioContado = useMemo(() => {
    const pago = Number(montoPago || 0);
    if (!Number.isFinite(pago)) return 0;
    return Math.max(0, pago - totalEstimado);
  }, [montoPago, totalEstimado]);

  const cleanMessages = () => {
    setError('');
    setSuccess('');
  };

  const resetVentaForm = () => {
    setEsFiado(false);
    setClienteTiendaId('');
    setItems([]);
    setMontoPago('0');
    setAbonoInicialFiado('0');
    setMetodoPago('efectivo');
  };

  const handleSubmitVenta = async (event) => {
    event?.preventDefault?.();
    cleanMessages();

    const groupedItems = new Map();

    for (const item of items) {
      const productoId = Number(item.producto_id);
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(productoId) || productoId <= 0) continue;
      if (!Number.isInteger(cantidad) || cantidad <= 0) continue;
      groupedItems.set(productoId, (groupedItems.get(productoId) || 0) + cantidad);
    }

    if (groupedItems.size === 0) {
      setError('Debes agregar al menos un producto válido a la venta');
      return;
    }

    for (const [productoId, cantidad] of groupedItems) {
      const producto = productos.find((p) => Number(p.id) === Number(productoId));
      if (!producto) continue;
      const stock = Number(producto.stock_actual || 0);
      if (cantidad > stock) {
        setError(`Stock insuficiente para "${producto.nombre}": solicitaste ${cantidad}, hay ${stock} disponibles.`);
        return;
      }
    }

    if (esFiado && !clienteTiendaId) {
      setError('Selecciona un cliente de fiado tienda para registrar el fiado');
      return;
    }

    const pago = Number(montoPago || 0);
    const abonoFiado = Number(abonoInicialFiado || 0);

    if (!esFiado) {
      if (!Number.isFinite(pago) || pago < totalEstimado) {
        setError('Para contado, el pago debe ser mayor o igual al total');
        return;
      }
    }

    if (esFiado) {
      if (!Number.isFinite(abonoFiado) || abonoFiado < 0) {
        setError('El abono inicial debe ser un valor válido');
        return;
      }
      if (abonoFiado > totalEstimado) {
        setError('El abono inicial no puede superar el total de la venta');
        return;
      }
    }

    const payload = {
      items: Array.from(groupedItems.entries()).map(([producto_id, cantidad]) => ({
        producto_id,
        cantidad,
      })),
      es_fiado: esFiado,
      metodo_pago: metodoPago === 'nequi' || metodoPago === 'tarjeta' ? 'transferencia' : metodoPago,
    };

    if (esFiado) {
      payload.fiado_origen = 'tienda';
      payload.cliente_tienda_id = Number(clienteTiendaId);
      payload.abono_inicial = abonoFiado;
    }

    try {
      setSubmittingVenta(true);

      await apiPost('/api/ventas', payload);

      await loadData();

      const selectedCliente = esFiado && clienteTiendaId
        ? clientesTienda.find((c) => String(c.id) === String(clienteTiendaId))
        : null;

      const receiptItems = items.map((item) => {
        const producto = productosById.get(Number(item.producto_id));
        const cantidad = Number(item.cantidad || 0);
        const precio = Number(producto?.precio_venta || 0);
        return {
          nombre: producto?.nombre || `#${item.producto_id}`,
          cantidad,
          precio,
          subtotal: cantidad * precio,
        };
      });

      setVentaCompletada({
        items: receiptItems,
        total: totalEstimado,
        metodoPago,
        pago,
        cambio: cambioContado,
        esFiado,
        cliente: selectedCliente?.nombre || null,
        timestamp: new Date().toLocaleString('es-CO'),
      });

      resetVentaForm();
    } catch (err) {
      setError(err.message || 'No fue posible registrar la venta');
    } finally {
      setSubmittingVenta(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleNewSale = () => {
    setVentaCompletada(null);
    cleanMessages();
  };

  const handleCreateStoreClient = async (event) => {
    event.preventDefault();
    cleanMessages();

    const nombre = newStoreClientName.trim();
    const telefono = String(newStoreClientPhone || '').replace(/\D/g, '');
    const telefonoNormalizado = telefono.length === 10 ? `57${telefono}` : telefono;

    if (!nombre) {
      setError('Ingresa el nombre del cliente fiado tienda');
      return;
    }

    try {
      setCreatingClient(true);
      const payload = await apiPost('/api/clientes/tienda-fiado', {
        nombre,
        telefono_whatsapp: telefonoNormalizado || null,
      });

      setClientesTienda((current) => [
        ...current,
        payload,
      ].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')));

      setEsFiado(true);
      setClienteTiendaId(String(payload.id));
      setNewStoreClientName('');
      setNewStoreClientPhone('');
      setIsStoreClientModalOpen(false);
      setSuccess('Cliente fiado tienda creado correctamente');
    } catch (err) {
      setError(err.message || 'No se pudo crear el cliente fiado tienda');
    } finally {
      setCreatingClient(false);
    }
  };

  const productosFiltrados = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return productos;
    return productos.filter((producto) => producto.nombre.toLowerCase().includes(term));
  }, [productos, productSearch]);

  const handleQuickAddProducto = (productoId) => {
    setItems((current) => {
      const qtyInCart = current.find((item) => Number(item.producto_id) === Number(productoId))?.cantidad || 0;
      const producto = productos.find((p) => Number(p.id) === Number(productoId));
      const stock = Number(producto?.stock_actual || 0);
      if (qtyInCart >= stock) return current;

      const index = current.findIndex((item) => Number(item.producto_id) === Number(productoId));
      if (index >= 0) {
        return current.map((item, rowIndex) => (rowIndex === index
          ? { ...item, cantidad: Number(item.cantidad || 0) + 1 }
          : item));
      }
      return [...current, { producto_id: String(productoId), cantidad: 1 }];
    });
  };

  const handleRemoveProducto = (productoId) => {
    setItems((current) => current.filter((item) => Number(item.producto_id) !== Number(productoId)));
  };

  const handleChangeQty = (index, delta) => {
    setItems((current) => current.reduce((acc, item, rowIndex) => {
      if (rowIndex !== index) {
        acc.push(item);
        return acc;
      }

      const nextQty = Number(item.cantidad || 0) + delta;
      if (nextQty <= 0) {
        return acc;
      }

      acc.push({ ...item, cantidad: nextQty });
      return acc;
    }, []));
  };

  const cartItems = useMemo(
    () => items.filter((item) => Number(item.producto_id) > 0 && Number(item.cantidad || 0) > 0),
    [items],
  );

  const printReceipt = ventaCompletada || null;

  return (
    <div className="space-y-4">
      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`lg:overflow-y-auto lg:max-h-[calc(100vh-8rem)] ${ventaCompletada ? 'pointer-events-none opacity-40' : ''}`}>
          <ProductSelectionView
            productos={productosFiltrados}
            searchTerm={productSearch}
            onSearchChange={setProductSearch}
            onAddItem={handleQuickAddProducto}
            cart={cartItems}
            formatMoney={formatMoney}
            loading={loading}
          />
        </div>

        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]">
          {ventaCompletada ? (
            <SaleReceiptPanel
              receipt={ventaCompletada}
              formatMoney={formatMoney}
              onPrint={handlePrintReceipt}
              onNewSale={handleNewSale}
            />
          ) : (
            <CartPanel
              cart={cartItems}
              productosById={productosById}
              totalEstimado={totalEstimado}
              onChangeQty={handleChangeQty}
              onRemoveItem={handleRemoveProducto}
              formatMoney={formatMoney}
              esFiado={esFiado}
              onSetEsFiado={setEsFiado}
              montoPago={montoPago}
              onSetMontoPago={setMontoPago}
              metodoPago={metodoPago}
              onSetMetodoPago={setMetodoPago}
              cambioContado={cambioContado}
              clientesTiendaFiado={clientesTienda}
              clienteTiendaId={clienteTiendaId}
              onSetClienteTiendaId={setClienteTiendaId}
              onCrearCliente={() => {
                cleanMessages();
                setIsStoreClientModalOpen(true);
              }}
              onConfirmar={handleSubmitVenta}
              submittingVenta={submittingVenta}
            />
          )}
        </div>
      </div>

      {isStoreClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rosewood">Tienda Angelly</p>
                <h3 className="mt-1 text-2xl font-bold text-gray-900">Nuevo cliente fiado tienda</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStoreClientModalOpen(false)}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleCreateStoreClient}>
              <input
                type="text"
                value={newStoreClientName}
                onChange={(event) => setNewStoreClientName(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Nombre del cliente"
                maxLength={120}
              />

              <input
                type="text"
                value={newStoreClientPhone}
                onChange={(event) => setNewStoreClientPhone(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-rosewood focus:outline-none"
                placeholder="WhatsApp (opcional)"
                maxLength={25}
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStoreClientModalOpen(false)}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingClient}
                  className="flex-1 rounded-xl bg-rosewood px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {creatingClient ? 'Guardando...' : 'Guardar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden !important; }
          #print-receipt, #print-receipt * { visibility: visible !important; }
          #print-receipt { position: fixed !important; left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; display: flex !important; align-items: center !important; justify-content: center !important; background: white !important; z-index: 99999 !important; }
          #print-receipt > div { width: 80mm !important; max-width: 80mm !important; border: none !important; box-shadow: none !important; padding: 8px 4px !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="print-receipt" className="hidden print:block">
        <div className="mx-auto bg-white p-2 text-xs text-gray-800">
          <div className="mb-3 text-center">
            <p className="text-base font-bold uppercase tracking-wide">Variedades Angelly</p>
            <p className="text-[10px] text-gray-600">NIT: 123.456.789-0</p>
            <p className="text-[10px] text-gray-600">Carrera XX #YY-ZZ, Ciudad</p>
            <p className="text-[10px] text-gray-600">Tel: (123) 456-7890</p>
          </div>

          <div className="mb-2 border-t border-dashed border-gray-400" />

          <div className="mb-2 text-center">
            <p className="text-xs font-bold uppercase tracking-wide">Factura de Venta</p>
            <p className="text-[10px] text-gray-600">{printReceipt?.timestamp || ''}</p>
          </div>

          <div className="mb-2 border-t border-dashed border-gray-400" />

          {printReceipt && (
            <p className="mb-2 text-[10px] text-gray-600">
              Método de pago: {printReceipt.metodoPago === 'efectivo' ? 'Efectivo' : printReceipt.metodoPago === 'nequi' ? 'Nequi' : 'Tarjeta'}
            </p>
          )}

          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-dashed border-gray-400 font-semibold">
                <th className="py-1 text-left">Producto</th>
                <th className="py-1 text-right">Cant</th>
                <th className="py-1 text-right">Precio</th>
                <th className="py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(printReceipt?.items || []).map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1 pr-1">{item.nombre}</td>
                  <td className="py-1 text-right">{item.cantidad}</td>
                  <td className="py-1 text-right">{formatMoney(item.precio)}</td>
                  <td className="py-1 text-right font-medium">{formatMoney(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="my-2 border-t border-dashed border-gray-400" />

          {printReceipt && (
            <div className="space-y-0.5 text-[10px]">
              <div className="flex justify-between font-bold">
                <span>TOTAL:</span>
                <span>{formatMoney(printReceipt.total)}</span>
              </div>
              {!printReceipt.esFiado && (
                <>
                  <div className="flex justify-between">
                    <span>Pago:</span>
                    <span>{formatMoney(printReceipt.pago)}</span>
                  </div>
                  {printReceipt.cambio > 0 && (
                    <div className="flex justify-between">
                      <span>Cambio:</span>
                      <span>{formatMoney(printReceipt.cambio)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-4 border-t border-dashed border-gray-400" />

          <p className="mt-2 text-center text-[10px] text-gray-500">¡Gracias por su preferencia!</p>
        </div>
      </div>

    </div>
  );
};

export default Ventas;
