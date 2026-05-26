import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Truck, X } from 'lucide-react';
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

const normalizeWhatsappNumber = (rawValue) => {
  const digits = String(rawValue || '').replace(/\D/g, '');
  if (!digits) return '';

  // Si llega numero local colombiano de 10 digitos, anteponer prefijo pais.
  if (digits.length === 10) {
    return `57${digits}`;
  }

  return digits;
};

const buildWhatsappPedidoMessage = (pedido, proveedor) => {
  const fecha = formatDateTime(pedido.fecha_creacion);
  const saludo = proveedor?.contacto || proveedor?.nombre || pedido.proveedor_nombre;

  return [
    `Hola ${saludo}, buen dia.`,
    '',
    '*Pedido de compra - Tienda Angelly*',
    `Pedido: #${pedido.id}`,
    `Proveedor: ${pedido.proveedor_nombre}`,
    'Detalle del pedido:',
    pedido.descripcion,
    `Monto estimado: ${formatMoney(pedido.monto_estimado)}`,
    `Solicitado por: ${pedido.creado_por}`,
    `Fecha: ${fecha}`,
    '',
    'Por favor confirmar disponibilidad y tiempo de entrega.',
    'Gracias.',
  ].join('\n');
};

const fetchJson = async ({ endpoint, signal, errorMessage }) => {
  try {
    return await apiGet(endpoint, { signal });
  } catch (error) {
    throw new Error(error.message || errorMessage);
  }
};

const Proveedores = () => {
  const { token } = useAuth();

  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [pedidos, setPedidos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [savingProveedor, setSavingProveedor] = useState(false);
  const [savingPedido, setSavingPedido] = useState(false);

  const [proveedorForm, setProveedorForm] = useState({
    nombre: '',
    contacto: '',
    telefono: '',
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [pedidoForm, setPedidoForm] = useState({
    proveedor_id: '',
    items: [{ producto_id: '', cantidad: 1 }],
  });

  const proveedoresById = useMemo(
    () => new Map(proveedores.map((proveedor) => [Number(proveedor.id), proveedor])),
    [proveedores],
  );

  const loadData = useCallback(
    async (signal) => {
      if (!token) return;

      const [proveedoresPayload, productosPayload, pedidosPayload] = await Promise.all([
        fetchJson({
          endpoint: '/api/proveedores',
          signal,
          errorMessage: 'No fue posible cargar proveedores',
        }),
        fetchJson({
          endpoint: '/api/productos?catalogo=tienda',
          signal,
          errorMessage: 'No fue posible cargar productos',
        }),
        fetchJson({
          endpoint: '/api/proveedores/pedidos',
          signal,
          errorMessage: 'No fue posible cargar pedidos',
        }),
      ]);

      if (signal?.aborted) return;

      const proveedoresList = Array.isArray(proveedoresPayload) ? proveedoresPayload : [];
      const productosList = Array.isArray(productosPayload) ? productosPayload : [];
      const pedidosList = Array.isArray(pedidosPayload) ? pedidosPayload : [];

      setProveedores(proveedoresList);
      setProductos(productosList);
      setPedidos(pedidosList);

      setPedidoForm((current) => {
        if (current.proveedor_id || proveedoresList.length === 0) {
          return current;
        }

        return {
          ...current,
          proveedor_id: String(proveedoresList[0].id),
        };
      });
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setProveedores([]);
      setPedidos([]);
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
        setError(err.message || 'No se pudo cargar el módulo de proveedores');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => controller.abort();
  }, [loadData, token]);

  const resumen = useMemo(() => {
    const proveedoresActivos = proveedores.filter((item) => Boolean(item.activo)).length;
    const pedidosEmitidos = pedidos.length;
    const montoSolicitado = pedidos.reduce(
      (acc, item) => acc + Number(item.monto_estimado || 0),
      0,
    );
    const pedidosConWhatsapp = pedidos.filter((item) => {
      const proveedor = proveedoresById.get(Number(item.proveedor_id));
      return Boolean(normalizeWhatsappNumber(proveedor?.telefono));
    }).length;

    return {
      proveedoresActivos,
      pedidosEmitidos,
      montoSolicitado,
      pedidosConWhatsapp,
    };
  }, [pedidos, proveedores, proveedoresById]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const handleProveedorChange = (key, value) => {
    setProveedorForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handlePedidoChange = (key, value) => {
    setPedidoForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handlePedidoItemChange = (index, key, value) => {
    setPedidoForm((current) => ({
      ...current,
      items: current.items.map((item, rowIndex) => (rowIndex === index ? { ...item, [key]: value } : item)),
    }));
  };

  const handleAddPedidoItem = () => {
    setPedidoForm((current) => ({
      ...current,
      items: [...current.items, { producto_id: '', cantidad: 1 }],
    }));
  };

  const handleRemovePedidoItem = (index) => {
    setPedidoForm((current) => ({
      ...current,
      items: current.items.length === 1
        ? [{ producto_id: '', cantidad: 1 }]
        : current.items.filter((_, row) => row !== index),
    }));
  };

  const handleEnviarPedidoWhatsapp = (pedido) => {
    clearMessages();

    const proveedor = proveedoresById.get(Number(pedido.proveedor_id));
    const phone = normalizeWhatsappNumber(proveedor?.telefono);

    if (!phone) {
      setError('El proveedor no tiene telefono de WhatsApp registrado');
      return;
    }

    const message = buildWhatsappPedidoMessage(pedido, proveedor);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setSuccess(`Pedido #${pedido.id} listo para envio por WhatsApp`);
  };

  const handleCreateProveedor = async (event) => {
    event.preventDefault();
    clearMessages();

    const nombre = proveedorForm.nombre.trim();
    if (!nombre) {
      setError('El nombre del proveedor es obligatorio');
      return;
    }

    try {
      setSavingProveedor(true);

      const payload = await apiPost('/api/proveedores', {
        nombre,
        contacto: proveedorForm.contacto.trim() || null,
        telefono: proveedorForm.telefono.trim() || null,
      });

      setProveedores((current) => [
        ...current,
        payload,
      ].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')));

      setProveedorForm({ nombre: '', contacto: '', telefono: '' });
      setPedidoForm((current) => ({
        ...current,
        proveedor_id: current.proveedor_id || String(payload.id),
      }));
      setSuccess('Proveedor creado correctamente');
      setIsCreateModalOpen(false);
    } catch (err) {
      setError(err.message || 'No se pudo crear el proveedor');
    } finally {
      setSavingProveedor(false);
    }
  };

  const handleCreatePedido = async (event) => {
    event.preventDefault();
    clearMessages();

    const proveedorId = Number(pedidoForm.proveedor_id);

    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      setError('Selecciona un proveedor para crear el pedido');
      return;
    }

    const itemsNormalizados = pedidoForm.items
      .map((item) => ({
        producto_id: Number(item.producto_id),
        cantidad: Number(item.cantidad),
      }))
      .filter((item) => Number.isInteger(item.producto_id) && item.producto_id > 0 && Number.isInteger(item.cantidad) && item.cantidad > 0);

    if (itemsNormalizados.length === 0) {
      setError('Agrega al menos un producto con cantidad válida');
      return;
    }

    const productosById = new Map(productos.map((item) => [Number(item.id), item]));
    const lineas = itemsNormalizados.map((item) => {
      const producto = productosById.get(item.producto_id);
      return {
        nombre: producto?.nombre || `Producto ${item.producto_id}`,
        cantidad: item.cantidad,
        precio: Number(producto?.precio_costo || 0),
      };
    });

    const descripcion = lineas
      .map((linea) => `- ${linea.nombre} x${linea.cantidad} (${formatMoney(linea.precio)})`)
      .join('\n');

    const monto = lineas.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

    try {
      setSavingPedido(true);

      const payload = await apiPost('/api/proveedores/pedidos', {
        proveedor_id: proveedorId,
        descripcion,
        monto_estimado: monto,
      });

      setPedidos((current) => [payload, ...current]);
      setPedidoForm((current) => ({
        ...current,
        items: [{ producto_id: '', cantidad: 1 }],
      }));

      const proveedor = proveedoresById.get(proveedorId);
      const phone = normalizeWhatsappNumber(proveedor?.telefono);
      if (phone) {
        setSuccess('Pedido creado y listo para envio inmediato por WhatsApp.');
      } else {
        setSuccess('Pedido creado. Agrega telefono al proveedor para enviarlo por WhatsApp.');
      }
    } catch (err) {
      setError(err.message || 'No se pudo crear el pedido');
    } finally {
      setSavingPedido(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Truck className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Proveedores</h1>
          <p className="text-gray-600">Pedidos de compra directos, sin aprobacion administrativa</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Activos</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">{resumen.proveedoresActivos}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Pedidos</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">{resumen.pedidosEmitidos}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Monto solicitado</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">{formatMoney(resumen.montoSolicitado)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">WhatsApp</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700 sm:text-3xl">{resumen.pedidosConWhatsapp}</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Registrar proveedor</h2>
            <p className="text-sm text-gray-600">Agrega un nuevo proveedor al sistema.</p>
          </div>
          <button
            type="button"
            onClick={() => { clearMessages(); setIsCreateModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </button>
        </div>
      </section>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6" onClick={() => setIsCreateModalOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-gray-900">Nuevo proveedor</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleCreateProveedor}>
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <input
                type="text"
                value={proveedorForm.nombre}
                onChange={(event) => handleProveedorChange('nombre', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Nombre del proveedor"
                maxLength={120}
              />

              <input
                type="text"
                value={proveedorForm.contacto}
                onChange={(event) => handleProveedorChange('contacto', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Contacto principal"
                maxLength={120}
              />

              <input
                type="text"
                value={proveedorForm.telefono}
                onChange={(event) => handleProveedorChange('telefono', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Teléfono"
                maxLength={25}
              />

              <button
                type="submit"
                disabled={savingProveedor}
                className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {savingProveedor ? 'Guardando proveedor...' : 'Guardar proveedor'}
              </button>
            </form>
          </div>
        </div>
      )}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Crear pedido a proveedor</h2>

          <form className="space-y-3" onSubmit={handleCreatePedido}>
            <select
              value={pedidoForm.proveedor_id}
              onChange={(event) => handlePedidoChange('proveedor_id', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
            >
              <option value="">Selecciona proveedor</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.nombre}
                </option>
              ))}
            </select>

              <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                {pedidoForm.items.map((item, index) => (
                    <div key={`pedido-item-${index}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_36px]">
                  <select
                    value={item.producto_id}
                    onChange={(event) => handlePedidoItemChange(index, 'producto_id', event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  >
                    <option value="">Selecciona producto</option>
                    {productos.map((producto) => (
                      <option key={producto.id} value={producto.id}>
                        {producto.nombre}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={(event) => handlePedidoItemChange(index, 'cantidad', event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                    placeholder="Cantidad"
                  />

                  <button
                    type="button"
                    onClick={() => handleRemovePedidoItem(index)}
                    className="flex items-center justify-center rounded-lg border border-gray-300 px-2 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    -
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddPedidoItem}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Agregar producto
              </button>
            </div>

            <button
              type="submit"
              disabled={savingPedido}
              className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {savingPedido ? 'Creando pedido...' : 'Crear pedido'}
            </button>
          </form>
        </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Pedidos registrados</h2>

        {loading && <Skeleton lines={3} />}

        {!loading && pedidos.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No hay pedidos registrados.</p>
        )}

        {!loading && (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 font-semibold text-gray-700">Proveedor</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Descripción</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Monto</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Estado</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Creado por</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Fecha</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((pedido) => {
                    const estadoNormalizado = String(pedido.estado || '').toLowerCase();
                    const isEnviado = estadoNormalizado === 'enviado' || estadoNormalizado === 'aprobado';
                    const proveedor = proveedoresById.get(Number(pedido.proveedor_id));
                    const hasWhatsapp = Boolean(normalizeWhatsappNumber(proveedor?.telefono));

                    return (
                      <tr key={pedido.id} className="border-b border-gray-100">
                        <td className="px-3 py-3 font-medium text-gray-900">{pedido.proveedor_nombre}</td>
                        <td className="max-w-[200px] truncate px-3 py-3 text-gray-700" title={pedido.descripcion}>{pedido.descripcion}</td>
                        <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(pedido.monto_estimado)}</td>
                        <td className="px-3 py-3">
                          {isEnviado && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Enviado
                            </span>
                          )}
                          {!isEnviado && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                              {pedido.estado || 'Sin estado'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-700">{pedido.creado_por}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDateTime(pedido.fecha_creacion)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEnviarPedidoWhatsapp(pedido)}
                              disabled={!hasWhatsapp}
                              className="whitespace-nowrap rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                            >
                              WhatsApp
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {pedidos.map((pedido) => {
                const estadoNormalizado = String(pedido.estado || '').toLowerCase();
                const isEnviado = estadoNormalizado === 'enviado' || estadoNormalizado === 'aprobado';
                const proveedor = proveedoresById.get(Number(pedido.proveedor_id));
                const hasWhatsapp = Boolean(normalizeWhatsappNumber(proveedor?.telefono));

                return (
                  <div key={pedido.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="font-semibold text-gray-900">{pedido.proveedor_nombre}</span>
                      {isEnviado ? (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Enviado</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{pedido.estado || 'Sin estado'}</span>
                      )}
                    </div>
                    <p className="mb-2 text-sm text-gray-600 line-clamp-2">{pedido.descripcion}</p>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-gray-500">Monto:</span>
                      <span className="font-semibold text-gray-900">{formatMoney(pedido.monto_estimado)}</span>
                    </div>
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="text-gray-500">{pedido.creado_por}</span>
                      <span className="text-gray-500">{formatDateTime(pedido.fecha_creacion)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEnviarPedidoWhatsapp(pedido)}
                      disabled={!hasWhatsapp}
                      className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      Enviar por WhatsApp
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Listado de proveedores</h2>

        {loading && <Skeleton lines={3} />}
        {!loading && proveedores.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No hay proveedores registrados.</p>
        )}
        {!loading && (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 font-semibold text-gray-700">Nombre</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Contacto</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Teléfono</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((proveedor) => (
                    <tr key={proveedor.id} className="border-b border-gray-100">
                      <td className="px-3 py-3 font-medium text-gray-900">{proveedor.nombre}</td>
                      <td className="px-3 py-3 text-gray-700">{proveedor.contacto || '-'}</td>
                      <td className="px-3 py-3 text-gray-700">{proveedor.telefono || '-'}</td>
                      <td className="px-3 py-3">
                        {proveedor.activo ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Activo</span>
                        ) : (
                          <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">Inactivo</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {proveedores.map((proveedor) => (
                <div key={proveedor.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="font-semibold text-gray-900">{proveedor.nombre}</span>
                    {proveedor.activo ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Activo</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">Inactivo</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">Contacto: {proveedor.contacto || '-'}</p>
                  <p className="text-sm text-gray-600">Tel: {proveedor.telefono || '-'}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default Proveedores;
