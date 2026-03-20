import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Truck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

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
    '*Pedido de compra - Variedades Angelly*',
    `Pedido: #${pedido.id}`,
    `Proveedor: ${pedido.proveedor_nombre}`,
    `Descripcion: ${pedido.descripcion}`,
    `Monto estimado: ${formatMoney(pedido.monto_estimado)}`,
    `Solicitado por: ${pedido.creado_por}`,
    `Fecha: ${fecha}`,
    '',
    'Por favor confirmar disponibilidad y tiempo de entrega.',
    'Gracias.',
  ].join('\n');
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

const Proveedores = () => {
  const { token } = useAuth();

  const [proveedores, setProveedores] = useState([]);
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

  const [pedidoForm, setPedidoForm] = useState({
    proveedor_id: '',
    descripcion: '',
    monto_estimado: '',
  });

  const proveedoresById = useMemo(
    () => new Map(proveedores.map((proveedor) => [Number(proveedor.id), proveedor])),
    [proveedores],
  );

  const loadData = useCallback(
    async (signal) => {
      if (!token) return;

      const [proveedoresPayload, pedidosPayload] = await Promise.all([
        fetchJson({
          endpoint: '/api/proveedores',
          token,
          signal,
          errorMessage: 'No fue posible cargar proveedores',
        }),
        fetchJson({
          endpoint: '/api/proveedores/pedidos',
          token,
          signal,
          errorMessage: 'No fue posible cargar pedidos',
        }),
      ]);

      if (signal?.aborted) return;

      const proveedoresList = Array.isArray(proveedoresPayload) ? proveedoresPayload : [];
      const pedidosList = Array.isArray(pedidosPayload) ? pedidosPayload : [];

      setProveedores(proveedoresList);
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

      const response = await fetch(`${API_BASE_URL}/api/proveedores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nombre,
          contacto: proveedorForm.contacto.trim() || null,
          telefono: proveedorForm.telefono.trim() || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'No se pudo crear el proveedor');
      }

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
    const monto = Number(pedidoForm.monto_estimado);

    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      setError('Selecciona un proveedor para crear el pedido');
      return;
    }

    if (!pedidoForm.descripcion.trim()) {
      setError('Describe el pedido a proveedor');
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      setError('El monto estimado debe ser mayor que cero');
      return;
    }

    try {
      setSavingPedido(true);

      const response = await fetch(`${API_BASE_URL}/api/proveedores/pedidos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          proveedor_id: proveedorId,
          descripcion: pedidoForm.descripcion.trim(),
          monto_estimado: monto,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'No se pudo crear el pedido');
      }

      setPedidos((current) => [payload, ...current]);
      setPedidoForm((current) => ({
        ...current,
        descripcion: '',
        monto_estimado: '',
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Activos</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{resumen.proveedoresActivos}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Pedidos emitidos</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{resumen.pedidosEmitidos}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Monto solicitado</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumen.montoSolicitado)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Listos por WhatsApp</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{resumen.pedidosConWhatsapp}</p>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Registrar proveedor</h2>

          <form className="space-y-3" onSubmit={handleCreateProveedor}>
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
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {savingProveedor ? 'Guardando proveedor...' : 'Guardar proveedor'}
            </button>
          </form>
        </section>

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

            <textarea
              value={pedidoForm.descripcion}
              onChange={(event) => handlePedidoChange('descripcion', event.target.value)}
              className="h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Detalle del pedido"
              maxLength={255}
            />

            <input
              type="number"
              min="1"
              value={pedidoForm.monto_estimado}
              onChange={(event) => handlePedidoChange('monto_estimado', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Monto estimado"
            />

            <button
              type="submit"
              disabled={savingPedido}
              className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {savingPedido ? 'Creando pedido...' : 'Crear pedido'}
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Pedidos registrados</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
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
              {loading && (
                <tr>
                  <td colSpan="7" className="px-3 py-8 text-center text-gray-500">
                    Cargando pedidos...
                  </td>
                </tr>
              )}

              {!loading && pedidos.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-3 py-8 text-center text-gray-500">
                    No hay pedidos registrados.
                  </td>
                </tr>
              )}

              {!loading && pedidos.map((pedido) => {
                const estadoNormalizado = String(pedido.estado || '').toLowerCase();
                const isEnviado = estadoNormalizado === 'enviado' || estadoNormalizado === 'aprobado';
                const isLegacyPendiente = estadoNormalizado === 'pendiente';
                const isLegacyRechazado = estadoNormalizado === 'rechazado';
                const proveedor = proveedoresById.get(Number(pedido.proveedor_id));
                const hasWhatsapp = Boolean(normalizeWhatsappNumber(proveedor?.telefono));

                return (
                  <tr key={pedido.id} className="border-b border-gray-100">
                    <td className="px-3 py-3 font-medium text-gray-900">{pedido.proveedor_nombre}</td>
                    <td className="px-3 py-3 text-gray-700">{pedido.descripcion}</td>
                    <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(pedido.monto_estimado)}</td>
                    <td className="px-3 py-3">
                      {isEnviado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Enviado
                        </span>
                      )}

                      {isLegacyPendiente && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                          Pendiente (legado)
                        </span>
                      )}

                      {isLegacyRechazado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          Rechazado (legado)
                        </span>
                      )}

                      {!isEnviado && !isLegacyPendiente && !isLegacyRechazado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                          {pedido.estado || 'Sin estado'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-700">{pedido.creado_por}</td>
                    <td className="px-3 py-3 text-gray-700">{formatDateTime(pedido.fecha_creacion)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEnviarPedidoWhatsapp(pedido)}
                          disabled={!hasWhatsapp}
                          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                          title={hasWhatsapp ? 'Enviar pedido por WhatsApp' : 'Proveedor sin telefono registrado'}
                        >
                          Enviar WhatsApp
                        </button>

                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Flujo directo
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Listado de proveedores</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-3 font-semibold text-gray-700">Nombre</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Contacto</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Teléfono</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="4" className="px-3 py-8 text-center text-gray-500">
                    Cargando proveedores...
                  </td>
                </tr>
              )}

              {!loading && proveedores.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-3 py-8 text-center text-gray-500">
                    No hay proveedores registrados.
                  </td>
                </tr>
              )}

              {!loading && proveedores.map((proveedor) => (
                <tr key={proveedor.id} className="border-b border-gray-100">
                  <td className="px-3 py-3 font-medium text-gray-900">{proveedor.nombre}</td>
                  <td className="px-3 py-3 text-gray-700">{proveedor.contacto || '-'}</td>
                  <td className="px-3 py-3 text-gray-700">{proveedor.telefono || '-'}</td>
                  <td className="px-3 py-3">
                    {proveedor.activo ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                        Activo
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">
                        Inactivo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Proveedores;
