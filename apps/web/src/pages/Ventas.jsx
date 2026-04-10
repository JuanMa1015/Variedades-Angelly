import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Minus,
  Search,
  X,
  Plus,
  ShoppingCart,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../api/httpClient';

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const INITIAL_ITEM = {
  producto_id: '',
  cantidad: 1,
};

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

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
  const [ventas, setVentas] = useState([]);
  const [clientesTienda, setClientesTienda] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [submittingVenta, setSubmittingVenta] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);

  const [esFiado, setEsFiado] = useState(false);
  const [clienteTiendaId, setClienteTiendaId] = useState('');
  const [items, setItems] = useState([{ ...INITIAL_ITEM }]);
  const [montoPago, setMontoPago] = useState('0');
  const [abonoInicialFiado, setAbonoInicialFiado] = useState('0');
  const [metodoPago, setMetodoPago] = useState('efectivo');

  const [newStoreClientName, setNewStoreClientName] = useState('');
  const [newStoreClientPhone, setNewStoreClientPhone] = useState('');
  const [isStoreClientModalOpen, setIsStoreClientModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

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
          endpoint: '/api/ventas',
          signal,
          errorMessage: 'No fue posible cargar ventas',
        }),
        fetchJson({
          endpoint: '/api/clientes/tienda-fiado',
          signal,
          errorMessage: 'No fue posible cargar clientes de fiado tienda',
        }),
      ];

      const [productosPayload, ventasPayload, tiendaPayload] = await Promise.all(requestList);

      if (signal?.aborted) return;

      setProductos(Array.isArray(productosPayload) ? productosPayload : []);
      setVentas(Array.isArray(ventasPayload) ? ventasPayload : []);
      setClientesTienda(Array.isArray(tiendaPayload) ? tiendaPayload : []);
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setProductos([]);
      setVentas([]);
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

  const handleAddItem = () => {
    setItems((current) => [...current, { ...INITIAL_ITEM }]);
  };

  const handleRemoveItem = (index) => {
    setItems((current) => {
      if (current.length === 1) {
        return [{ ...INITIAL_ITEM }];
      }
      return current.filter((_, rowIndex) => rowIndex !== index);
    });
  };

  const handleItemChange = (index, key, value) => {
    setItems((current) => current.map((item, rowIndex) => (
      rowIndex === index
        ? {
            ...item,
            [key]: value,
          }
        : item
    )));
  };

  const resetVentaForm = () => {
    setEsFiado(false);
    setClienteTiendaId('');
    setItems([{ ...INITIAL_ITEM }]);
    setMontoPago('0');
    setAbonoInicialFiado('0');
    setMetodoPago('efectivo');
  };

  const handleSubmitVenta = async (event) => {
    event.preventDefault();
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
      metodo_pago: metodoPago,
    };

    if (esFiado) {
      payload.fiado_origen = 'tienda';
      payload.cliente_tienda_id = Number(clienteTiendaId);
      payload.abono_inicial = abonoFiado;
    }

    try {
      setSubmittingVenta(true);

      const responsePayload = await apiPost('/api/ventas', payload);

      await loadData();
      resetVentaForm();
      const resumenCambio = !esFiado
        ? ` Pago: ${formatMoney(pago)}. Cambio: ${formatMoney(cambioContado)}.`
        : '';
      setSuccess((responsePayload.resumen_recibo || 'Venta registrada correctamente') + resumenCambio);
    } catch (err) {
      setError(err.message || 'No fue posible registrar la venta');
    } finally {
      setSubmittingVenta(false);
    }
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
      const index = current.findIndex((item) => Number(item.producto_id) === Number(productoId));
      if (index >= 0) {
        return current.map((item, rowIndex) => (rowIndex === index
          ? { ...item, cantidad: Number(item.cantidad || 0) + 1 }
          : item));
      }
      return [...current, { producto_id: String(productoId), cantidad: 1 }];
    });
  };

  const handleQtyStep = (index, delta) => {
    setItems((current) => current.map((item, rowIndex) => {
      if (rowIndex !== index) return item;
      const next = Math.max(1, Number(item.cantidad || 1) + delta);
      return { ...item, cantidad: next };
    }));
  };

  return (
    <div className="space-y-4">

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <section className="rounded-2xl border border-gray-300 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                cleanMessages();
                setEsFiado(false);
                setClienteTiendaId('');
              }}
              className={`rounded-xl border-2 px-5 py-2.5 text-sm font-extrabold uppercase tracking-wide shadow-sm transition active:scale-[0.98] ${
                !esFiado
                  ? 'border-rosewood bg-rosewood text-white ring-2 ring-rosewood/25'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              Contado
            </button>

            <button
              type="button"
              onClick={() => {
                cleanMessages();
                setEsFiado(true);
              }}
              className={`rounded-xl border-2 px-5 py-2.5 text-sm font-extrabold uppercase tracking-wide shadow-sm transition active:scale-[0.98] ${
                esFiado
                  ? 'border-amber-500 bg-amber-500 text-white ring-2 ring-amber-500/30'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              Fiado
            </button>

            <button
              type="button"
              onClick={() => setIsStoreClientModalOpen(true)}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border-2 border-rosewood/40 bg-blush-100 px-4 py-2.5 text-sm font-bold text-rosewood shadow-sm transition hover:border-rosewood hover:bg-blush-200 active:scale-[0.98]"
            >
              <UserRound className="h-4 w-4" />
              Nuevo cliente
            </button>
          </div>

          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Buscar producto por nombre"
              />
            </label>
          </div>

          <div className="mb-4 rounded-xl border border-gray-200 bg-white p-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {productosFiltrados.map((producto) => (
                <button
                  key={producto.id}
                  type="button"
                  onClick={() => handleQuickAddProducto(producto.id)}
                  className="group rounded-xl border-2 border-gray-300 bg-white px-3 py-3 text-left shadow-sm transition hover:border-rosewood hover:bg-blush-100 hover:shadow active:scale-[0.99]"
                >
                  <p className="truncate text-sm font-semibold text-gray-900">{producto.nombre}</p>
                  <p className="text-xs text-gray-500">{formatMoney(producto.precio_venta)} · Stock {producto.stock_actual}</p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-rosewood opacity-80 transition group-hover:opacity-100">
                    Clic para agregar
                  </p>
                </button>
              ))}
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmitVenta}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  cleanMessages();
                  setEsFiado(false);
                  setClienteTiendaId('');
                }}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  !esFiado
                    ? 'border-rosewood bg-blush-100 text-rosewood'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold">Venta de contado</p>
                <p className="text-xs text-gray-500">Pago completo al momento</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  cleanMessages();
                  setEsFiado(true);
                }}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  esFiado
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <p className="font-semibold">Venta a fiado</p>
                </div>
                <p className="text-xs text-gray-500">Registra saldo pendiente del cliente</p>
              </button>
            </div>

            {esFiado && (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block flex-1 space-y-1 text-sm">
                    <span className="font-medium text-gray-700">Cliente fiado tienda</span>
                    <select
                      value={clienteTiendaId}
                      onChange={(event) => setClienteTiendaId(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-rosewood focus:outline-none"
                    >
                      <option value="">Selecciona cliente</option>
                      {clientesTienda.map((cliente) => (
                        <option key={cliente.id} value={cliente.id}>
                          {cliente.nombre}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      cleanMessages();
                      setIsStoreClientModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-rosewood px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-100"
                  >
                    <UserRound className="h-4 w-4" />
                    Nuevo cliente
                  </button>
                </div>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-gray-700">Abono inicial (opcional)</span>
                  <input
                    type="number"
                    min="0"
                    value={abonoInicialFiado}
                    onChange={(event) => setAbonoInicialFiado(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-rosewood focus:outline-none"
                    placeholder="0"
                  />
                </label>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-gray-700">Método de pago</span>
                  <select
                    value={metodoPago}
                    onChange={(event) => setMetodoPago(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-rosewood focus:outline-none"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </label>
              </div>
            )}

            {!esFiado && (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-gray-700">¿Con cuánto paga?</span>
                  <input
                    type="number"
                    min="0"
                    value={montoPago}
                    onChange={(event) => setMontoPago(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-rosewood focus:outline-none"
                    placeholder="0"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-gray-700">Método de pago</span>
                  <select
                    value={metodoPago}
                    onChange={(event) => setMetodoPago(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-rosewood focus:outline-none"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </label>
                <p className="text-sm font-semibold text-emerald-900">
                  Cambio a devolver: {formatMoney(cambioContado)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Ticket actual</p>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Línea manual
                </button>
              </div>

              <div className="space-y-2">
                {items.map((item, index) => {
                  const producto = productosById.get(Number(item.producto_id));

                  return (
                    <div key={`linea-${index}`} className="rounded-lg border border-gray-200 bg-white p-2">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_150px_96px_40px]">
                        <select
                          value={item.producto_id}
                          onChange={(event) => handleItemChange(index, 'producto_id', event.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                        >
                          <option value="">Selecciona producto</option>
                          {productos.map((productoItem) => (
                            <option key={productoItem.id} value={productoItem.id}>
                              {productoItem.nombre}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center rounded-lg border border-gray-300">
                          <button type="button" className="px-2 text-gray-600" onClick={() => handleQtyStep(index, -1)}>
                            <Minus className="h-4 w-4" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.cantidad}
                            onChange={(event) => handleItemChange(index, 'cantidad', event.target.value)}
                            className="w-full border-x border-gray-300 px-2 py-2 text-center text-sm focus:outline-none"
                            placeholder="Cant."
                          />
                          <button type="button" className="px-2 text-gray-600" onClick={() => handleQtyStep(index, 1)}>
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-end px-2 text-sm font-semibold text-gray-800">
                          {formatMoney((producto?.precio_venta || 0) * Number(item.cantidad || 0))}
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

                      {producto && (
                        <p className="mt-2 text-xs text-gray-500">
                          Stock: {producto.stock_actual} | Precio venta: {formatMoney(producto.precio_venta)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Total estimado</p>
                <p className="text-2xl font-bold text-gray-900">{formatMoney(totalEstimado)}</p>
              </div>

              <button
                type="submit"
                disabled={submittingVenta || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rosewood px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <ShoppingCart className="h-4 w-4" />
                {submittingVenta ? 'Registrando...' : 'Realizar venta'}
              </button>
            </div>
          </form>
        </section>

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

    </div>
  );
};

export default Ventas;
