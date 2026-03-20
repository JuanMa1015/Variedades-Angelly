import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CircleDollarSign,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import PaginationControls from '../components/PaginationControls';
import RegistrarAbonoModal from '../components/RegistrarAbonoModal';
import VerDetalleModal from '../components/VerDetalleModal';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';
const CLIENTES_PAGE_SIZE = 20;
const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

const EMPTY_CLIENT_FORM = {
  nombre: '',
  documento: '',
  telefono_whatsapp: '',
  limite_credito: '',
};

const EMPTY_ITEM = {
  producto_id: '',
  cantidad: 1,
};

const Cartera = () => {
  const { token } = useAuth();

  const [clientes, setClientes] = useState([]);
  const [clientesCatalogo, setClientesCatalogo] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);

  const [clienteForm, setClienteForm] = useState(EMPTY_CLIENT_FORM);
  const [savingCliente, setSavingCliente] = useState(false);
  const [editingClienteId, setEditingClienteId] = useState(null);

  const [ventaClienteId, setVentaClienteId] = useState('');
  const [ventaFecha, setVentaFecha] = useState('');
  const [abonoInicial, setAbonoInicial] = useState('0');
  const [referenciaVenta, setReferenciaVenta] = useState('');
  const [ventaItems, setVentaItems] = useState([{ ...EMPTY_ITEM }]);
  const [savingVenta, setSavingVenta] = useState(false);

  const [selectedClienteAbono, setSelectedClienteAbono] = useState(null);
  const [selectedClienteDetalle, setSelectedClienteDetalle] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!token) {
      setClientes([]);
      setClientesCatalogo([]);
      setProductos([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        const params = new URLSearchParams({
          page: String(currentPage),
          limit: String(CLIENTES_PAGE_SIZE),
        });
        if (debouncedSearch) {
          params.set('search', debouncedSearch);
        }

        const [clientesResponse, clientesCatalogoResponse, productosResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/cartera/clientes?${params.toString()}`, {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch(`${API_BASE_URL}/api/clientes`, {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch(`${API_BASE_URL}/api/productos`, {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

        if (!clientesResponse.ok) {
          throw new Error('No fue posible cargar clientes de cartera');
        }

        if (!clientesCatalogoResponse.ok) {
          throw new Error('No fue posible cargar el catálogo de clientes');
        }

        if (!productosResponse.ok) {
          throw new Error('No fue posible cargar productos para registrar ventas');
        }

        const payload = await clientesResponse.json();
        const clientesCatalogoPayload = await clientesCatalogoResponse.json();
        const productosPayload = await productosResponse.json();

        if (controller.signal.aborted) return;

        setClientes(Array.isArray(payload.data) ? payload.data : []);
        setTotalPages(Math.max(1, Number(payload.total_pages ?? 1)));
        setClientesCatalogo(Array.isArray(clientesCatalogoPayload) ? clientesCatalogoPayload : []);
        setProductos(Array.isArray(productosPayload) ? productosPayload : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError('No fue posible cargar los clientes');
        setClientes([]);
        setClientesCatalogo([]);
        setProductos([]);
        setTotalPages(1);
      } finally {
        if (controller.signal.aborted) return;
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      controller.abort();
    };
  }, [currentPage, debouncedSearch, reloadTick, token]);

  const productosById = useMemo(
    () => new Map(productos.map((producto) => [Number(producto.id), producto])),
    [productos],
  );

  const totalVentaEstimado = useMemo(
    () => ventaItems.reduce((sum, item) => {
      const producto = productosById.get(Number(item.producto_id));
      if (!producto) return sum;
      return sum + Number(producto.precio_venta || 0) * Number(item.cantidad || 0);
    }, 0),
    [productosById, ventaItems],
  );

  const cleanMessages = () => {
    setError('');
    setSuccess('');
  };

  const refreshPage = () => {
    setReloadTick((current) => current + 1);
  };

  const startEditingCliente = (cliente) => {
    cleanMessages();
    setEditingClienteId(cliente.id);
    setClienteForm({
      nombre: cliente.nombre || '',
      documento: cliente.documento || '',
      telefono_whatsapp: cliente.telefono_whatsapp || '',
      limite_credito: String(cliente.limite_credito || ''),
    });
  };

  const cancelEditingCliente = () => {
    setEditingClienteId(null);
    setClienteForm(EMPTY_CLIENT_FORM);
  };

  const handleSubmitCliente = async (event) => {
    event.preventDefault();
    cleanMessages();

    const nombre = clienteForm.nombre.trim();
    const limiteCredito = Number(clienteForm.limite_credito);

    if (!nombre) {
      setError('El nombre del cliente es obligatorio');
      return;
    }

    if (!Number.isFinite(limiteCredito) || limiteCredito <= 0) {
      setError('El limite de credito debe ser mayor que cero');
      return;
    }

    const payload = {
      nombre,
      documento: clienteForm.documento.trim() || null,
      telefono_whatsapp: clienteForm.telefono_whatsapp.trim() || null,
      limite_credito: limiteCredito,
    };

    const isEdit = Boolean(editingClienteId);
    const endpoint = isEdit
      ? `${API_BASE_URL}/api/cartera/clientes/${editingClienteId}`
      : `${API_BASE_URL}/api/cartera/clientes`;
    const method = isEdit ? 'PATCH' : 'POST';

    try {
      setSavingCliente(true);

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responsePayload.detail || 'No se pudo guardar el cliente');
      }

      setSuccess(isEdit ? 'Cliente actualizado correctamente' : 'Cliente registrado correctamente');
      cancelEditingCliente();
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible guardar el cliente');
    } finally {
      setSavingCliente(false);
    }
  };

  const handleDeleteCliente = async (cliente) => {
    cleanMessages();
    const confirmed = window.confirm(`¿Eliminar cliente ${cliente.nombre}?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/cartera/clientes/${cliente.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'No se pudo eliminar el cliente');
      }

      setSuccess('Cliente eliminado correctamente');
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible eliminar el cliente');
    }
  };

  const handleAddVentaItem = () => {
    setVentaItems((current) => [...current, { ...EMPTY_ITEM }]);
  };

  const handleRemoveVentaItem = (index) => {
    setVentaItems((current) => {
      if (current.length === 1) return [{ ...EMPTY_ITEM }];
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const handleChangeVentaItem = (index, key, value) => {
    setVentaItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? {
            ...item,
            [key]: value,
          }
        : item
    )));
  };

  const handleSubmitVentaCartera = async (event) => {
    event.preventDefault();
    cleanMessages();

    if (!ventaClienteId) {
      setError('Selecciona un cliente para registrar la venta');
      return;
    }

    const itemsNormalizados = ventaItems
      .map((item) => ({
        producto_id: Number(item.producto_id),
        cantidad: Number(item.cantidad),
      }))
      .filter((item) => Number.isInteger(item.producto_id) && item.producto_id > 0 && Number.isInteger(item.cantidad) && item.cantidad > 0);

    if (itemsNormalizados.length === 0) {
      setError('Debes agregar al menos un articulo con cantidad valida');
      return;
    }

    const abono = Number(abonoInicial || 0);
    if (!Number.isFinite(abono) || abono < 0) {
      setError('El abono inicial debe ser un valor valido');
      return;
    }

    try {
      setSavingVenta(true);

      const response = await fetch(`${API_BASE_URL}/api/cartera/ventas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cliente_id: Number(ventaClienteId),
          items: itemsNormalizados,
          abono_inicial: abono,
          fecha_venta: ventaFecha ? new Date(ventaFecha).toISOString() : null,
          referencia: referenciaVenta.trim() || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'No fue posible registrar la venta en cartera');
      }

      setSuccess(payload.resumen_recibo || 'Venta de cartera registrada correctamente');
      setVentaItems([{ ...EMPTY_ITEM }]);
      setAbonoInicial('0');
      setVentaFecha('');
      setReferenciaVenta('');
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible registrar la venta en cartera');
    } finally {
      setSavingVenta(false);
    }
  };

  const handleRegistrarAbono = (cliente) => {
    setSelectedClienteAbono(cliente);
  };

  const handleVerDetalle = (cliente) => {
    setSelectedClienteDetalle(cliente);
  };

  const handleAbrirWhatsapp = (cliente) => {
    const telefono = String(cliente.telefono_whatsapp ?? '').replace(/\D/g, '');
    if (!telefono) {
      alert('Este cliente no tiene teléfono de WhatsApp registrado');
      return;
    }

    const deuda = Number(cliente.deuda_total ?? 0).toLocaleString('es-CO');
    const mensaje = encodeURIComponent(
      `Hola ${cliente.nombre}, te escribimos de Variedades Angelly. Tu saldo pendiente actual es $${deuda}.`,
    );
    window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
  };

  const handleConfirmAbono = async (monto) => {
    cleanMessages();
    if (!selectedClienteAbono) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/cartera/clientes/${selectedClienteAbono.id}/abonos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ monto }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'No fue posible registrar el abono');
      }

      setSuccess(`Abono registrado. Nuevo saldo: ${formatMoney(payload.saldo_cliente)}`);
      setSelectedClienteAbono(null);
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible registrar el abono');
    }
  };

  const totalDeuda = useMemo(
    () => clientes.reduce((sum, c) => sum + Number(c.deuda_total ?? 0), 0),
    [clientes],
  );

  const clientesConDeuda = useMemo(
    () => clientes.filter((c) => Number(c.deuda_total ?? 0) > 0).length,
    [clientes],
  );

  const porcentajeClientesConDeuda = useMemo(() => {
    if (clientes.length === 0) return 0;
    return Math.round((clientesConDeuda / clientes.length) * 100);
  }, [clientes.length, clientesConDeuda]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-center gap-3">
        <BookOpen className="w-8 h-8 text-rosewood" />
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Cartera</h1>
          <p className="text-gray-600 mt-1">Libro contable de clientes, ventas y abonos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-rosewood">
          <p className="text-gray-600 text-sm font-semibold uppercase">Clientes en pagina</p>
          <p className="text-4xl font-bold text-gray-900 mt-2">{clientes.length}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-gold-100">
          <p className="text-gray-600 text-sm font-semibold uppercase">Clientes con deuda</p>
          <p className="text-4xl font-bold text-gold-200 mt-2">{clientesConDeuda}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-blush-200">
          <p className="text-gray-600 text-sm font-semibold uppercase">Total deuda</p>
          <p className="text-4xl font-bold text-gray-900 mt-2">
            {formatMoney(totalDeuda)}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-gray-300">
          <p className="text-gray-600 text-sm font-semibold uppercase">% cartera activa</p>
          <p className="text-4xl font-bold text-gray-900 mt-2">{porcentajeClientesConDeuda}%</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 font-semibold">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 font-semibold">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {editingClienteId ? 'Editar cliente' : 'Registrar cliente'}
          </h2>

          <form className="space-y-3" onSubmit={handleSubmitCliente}>
            <input
              type="text"
              value={clienteForm.nombre}
              onChange={(event) => setClienteForm((current) => ({ ...current, nombre: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Nombre del cliente"
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={clienteForm.documento}
                onChange={(event) => setClienteForm((current) => ({ ...current, documento: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Cedula"
              />
              <input
                type="text"
                value={clienteForm.telefono_whatsapp}
                onChange={(event) => setClienteForm((current) => ({ ...current, telefono_whatsapp: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="WhatsApp"
              />
            </div>

            <input
              type="number"
              min="1"
              value={clienteForm.limite_credito}
              onChange={(event) => setClienteForm((current) => ({ ...current, limite_credito: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Limite de credito"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={savingCliente}
                className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <Plus className="h-4 w-4" />
                {savingCliente ? 'Guardando...' : editingClienteId ? 'Actualizar' : 'Crear cliente'}
              </button>
              {editingClienteId && (
                <button
                  type="button"
                  onClick={cancelEditingCliente}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-gray-900">Registrar venta en cartera</h2>
            <CircleDollarSign className="h-5 w-5 text-rosewood" />
          </div>

          <form className="space-y-3" onSubmit={handleSubmitVentaCartera}>
            <select
              value={ventaClienteId}
              onChange={(event) => setVentaClienteId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
            >
              <option value="">Selecciona cliente existente</option>
              {clientesCatalogo.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>
              ))}
            </select>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="datetime-local"
                value={ventaFecha}
                onChange={(event) => setVentaFecha(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              />
              <input
                type="number"
                min="0"
                value={abonoInicial}
                onChange={(event) => setAbonoInicial(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Abono inicial (0 si no pago)"
              />
            </div>

            <input
              type="text"
              value={referenciaVenta}
              onChange={(event) => setReferenciaVenta(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Referencia (opcional)"
            />

            <div className="space-y-2">
              {ventaItems.map((item, index) => (
                <div key={`item-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_40px]">
                  <select
                    value={item.producto_id}
                    onChange={(event) => handleChangeVentaItem(index, 'producto_id', event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  >
                    <option value="">Articulo</option>
                    {productos.map((producto) => (
                      <option key={producto.id} value={producto.id}>{producto.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={(event) => handleChangeVentaItem(index, 'cantidad', event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                    placeholder="Cant."
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveVentaItem(index)}
                    className="rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
                    title="Eliminar línea"
                  >
                    -
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleAddVentaItem}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                + Agregar articulo
              </button>
              <p className="text-sm font-semibold text-gray-700">
                Total estimado: <span className="text-gray-900">{formatMoney(totalVentaEstimado)}</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={savingVenta}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {savingVenta ? 'Registrando...' : 'Registrar venta en cartera'}
            </button>
          </form>
        </section>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-700">Filtro de cartera</p>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
            {clientes.length} clientes en pagina
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, cedula o WhatsApp"
            className="w-full pl-10 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rosewood transition"
          />
        </div>
      </div>

      {loading && (
        <div className="text-center py-12">
          <p className="text-2xl text-gray-600">Cargando clientes...</p>
        </div>
      )}

      {!loading && !error && clientes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-2xl text-gray-600">
            {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
          </p>
        </div>
      )}

      {!loading && !error && clientes.length > 0 && (
        <>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 sm:px-5">
              <h3 className="text-base font-bold text-gray-900">Libro de clientes de cartera</h3>
              <p className="text-xs text-gray-500">Vista contable con foco en cupo, deuda y saldo disponible.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Cliente</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Contacto</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 text-right">Limite</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 text-right">Deuda</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 text-right">Disponible</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Estado</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((cliente) => {
                    const deuda = Number(cliente.deuda_total || 0);
                    const limite = Number(cliente.limite_credito || 0);
                    const disponible = Math.max(limite - deuda, 0);
                    const ratioUso = limite > 0 ? deuda / limite : 0;

                    let estadoLabel = 'Al dia';
                    let estadoClass = 'bg-emerald-100 text-emerald-800';

                    if (deuda > 0 && ratioUso >= 0.8) {
                      estadoLabel = 'Alto riesgo';
                      estadoClass = 'bg-red-100 text-red-700';
                    } else if (deuda > 0) {
                      estadoLabel = 'Con deuda';
                      estadoClass = 'bg-amber-100 text-amber-800';
                    }

                    return (
                      <tr key={cliente.id} className="border-b border-gray-100 align-top hover:bg-gray-50/80">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-semibold text-gray-900 text-[15px]">{cliente.nombre}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Cedula: {cliente.documento || 'N/A'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-700">{cliente.telefono_whatsapp || 'Sin WhatsApp'}</p>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-800">{formatMoney(limite)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-900">{formatMoney(deuda)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-800">{formatMoney(disponible)}</td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${estadoClass}`}>
                            {estadoLabel}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => handleAbrirWhatsapp(cliente)}
                              disabled={!cliente.telefono_whatsapp}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              WhatsApp
                            </button>
                            <button
                              onClick={() => handleRegistrarAbono(cliente)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-rosewood px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                            >
                              Abono
                            </button>
                            <button
                              onClick={() => handleVerDetalle(cliente)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                            >
                              Detalle
                            </button>
                            <button
                              onClick={() => startEditingCliente(cliente)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteCliente(cliente)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      {selectedClienteAbono && (
        <RegistrarAbonoModal
          cliente={selectedClienteAbono}
          isOpen={true}
          onClose={() => setSelectedClienteAbono(null)}
          onConfirm={handleConfirmAbono}
        />
      )}

      {selectedClienteDetalle && (
        <VerDetalleModal
          cliente={selectedClienteDetalle}
          isOpen={true}
          apiBaseUrl={API_BASE_URL}
          token={token}
          onClose={() => setSelectedClienteDetalle(null)}
        />
      )}
    </div>
  );
};

export default Cartera;
