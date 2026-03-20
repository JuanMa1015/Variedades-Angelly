import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleDollarSign,
  Plus,
  ShoppingCart,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

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

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isSameLocalDate = (value, reference) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getDate() === reference.getDate()
    && date.getMonth() === reference.getMonth()
    && date.getFullYear() === reference.getFullYear()
  );
};

const fetchJson = async ({ endpoint, token, signal, errorMessage }) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || errorMessage);
  }

  return payload;
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

  const [newStoreClientName, setNewStoreClientName] = useState('');
  const [newStoreClientPhone, setNewStoreClientPhone] = useState('');

  const loadData = useCallback(
    async (signal) => {
      if (!token) return;

      const requestList = [
        fetchJson({
          endpoint: '/api/productos',
          token,
          signal,
          errorMessage: 'No fue posible cargar productos',
        }),
        fetchJson({
          endpoint: '/api/ventas',
          token,
          signal,
          errorMessage: 'No fue posible cargar ventas',
        }),
        fetchJson({
          endpoint: '/api/clientes/tienda-fiado',
          token,
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

  const resumenHoy = useMemo(() => {
    const now = new Date();
    const ventasHoy = ventas.filter((venta) => isSameLocalDate(venta.fecha, now));

    const ingresos = ventasHoy.reduce(
      (acc, venta) => acc + Number(venta.total || 0),
      0,
    );

    const credito = ventasHoy
      .filter((venta) => Boolean(venta.es_fiado))
      .reduce((acc, venta) => acc + Number(venta.total || 0), 0);

    return {
      ventas: ventasHoy.length,
      ingresos,
      credito,
    };
  }, [ventas]);

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

    const payload = {
      items: Array.from(groupedItems.entries()).map(([producto_id, cantidad]) => ({
        producto_id,
        cantidad,
      })),
      es_fiado: esFiado,
    };

    if (esFiado) {
      payload.fiado_origen = 'tienda';
      payload.cliente_tienda_id = Number(clienteTiendaId);
    }

    try {
      setSubmittingVenta(true);

      const response = await fetch(`${API_BASE_URL}/api/ventas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responsePayload.detail || 'No fue posible registrar la venta');
      }

      await loadData();
      resetVentaForm();
      setSuccess(responsePayload.resumen_recibo || 'Venta registrada correctamente');
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
    const telefono = newStoreClientPhone.trim();

    if (!nombre) {
      setError('Ingresa el nombre del cliente fiado tienda');
      return;
    }

    try {
      setCreatingClient(true);
      const response = await fetch(`${API_BASE_URL}/api/clientes/tienda-fiado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nombre,
          telefono_whatsapp: telefono || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'No se pudo crear el cliente fiado tienda');
      }

      setClientesTienda((current) => [
        ...current,
        payload,
      ].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')));

      setEsFiado(true);
      setClienteTiendaId(String(payload.id));
      setNewStoreClientName('');
      setNewStoreClientPhone('');
      setSuccess('Cliente fiado tienda creado correctamente');
    } catch (err) {
      setError(err.message || 'No se pudo crear el cliente fiado tienda');
    } finally {
      setCreatingClient(false);
    }
  };

  const ventasRecientes = useMemo(() => ventas.slice(0, 12), [ventas]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Punto de Venta</h1>
          <p className="text-gray-600">Contado y fiado tienda en una sola operación</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Transacciones hoy</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{resumenHoy.ventas}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Ingresos hoy</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumenHoy.ingresos)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Crédito hoy</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{formatMoney(resumenHoy.credito)}</p>
        </div>
      </div>

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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-gray-900">Registrar venta</h2>
            <CircleDollarSign className="h-6 w-6 text-rosewood" />
          </div>

          <form className="space-y-5" onSubmit={handleSubmitVenta}>
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
                <label className="block space-y-1 text-sm">
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
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Productos</p>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" />
                  Agregar línea
                </button>
              </div>

              <div className="space-y-2">
                {items.map((item, index) => {
                  const producto = productosById.get(Number(item.producto_id));

                  return (
                    <div
                      key={`linea-${index}`}
                      className="rounded-xl border border-gray-200 bg-white p-3"
                    >
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_110px_48px]">
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

                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(event) => handleItemChange(index, 'cantidad', event.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                          placeholder="Cant."
                        />

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

        <aside className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-rosewood" />
            <h3 className="text-lg font-bold text-gray-900">Nuevo cliente fiado tienda</h3>
          </div>

          <form className="space-y-3" onSubmit={handleCreateStoreClient}>
            <input
              type="text"
              value={newStoreClientName}
              onChange={(event) => setNewStoreClientName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Nombre del cliente"
              maxLength={120}
            />

            <input
              type="text"
              value={newStoreClientPhone}
              onChange={(event) => setNewStoreClientPhone(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="WhatsApp (opcional)"
              maxLength={25}
            />

            <button
              type="submit"
              disabled={creatingClient}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {creatingClient ? 'Guardando cliente...' : 'Guardar cliente'}
            </button>
          </form>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            Usa fiado tienda para clientes operativos del punto de venta. El fiado cartera permanece
            exclusivo para administración.
          </div>
        </aside>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Ventas recientes</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-3 font-semibold text-gray-700">Fecha</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Cliente</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Tipo</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Total</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Saldo pendiente</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="5" className="px-3 py-8 text-center text-gray-500">
                    Cargando ventas...
                  </td>
                </tr>
              )}

              {!loading && ventasRecientes.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-3 py-8 text-center text-gray-500">
                    Aún no hay ventas registradas.
                  </td>
                </tr>
              )}

              {!loading && ventasRecientes.map((venta) => (
                <tr key={venta.venta_id} className="border-b border-gray-100">
                  <td className="px-3 py-3 text-gray-700">{formatDateTime(venta.fecha)}</td>
                  <td className="px-3 py-3 font-medium text-gray-900">{venta.cliente_nombre || 'Mostrador'}</td>
                  <td className="px-3 py-3">
                    {venta.es_fiado ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                        Fiado {venta.fiado_origen ? `(${venta.fiado_origen})` : ''}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                        Contado
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(venta.total)}</td>
                  <td className="px-3 py-3 text-gray-700">{formatMoney(venta.saldo_pendiente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Ventas;
