import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, Plus, Search, Truck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiGet, apiPatch } from '../api/httpClient';
import { cambiarEstadoPedido } from '../api/proveedoresApi';
import ErrorMessage from '../components/ErrorMessage';
import PaginationControls from '../components/PaginationControls';
import SuccessMessage from '../components/SuccessMessage';
import useConfirm from '../components/useConfirm';
import { formatMoney } from '../utils/format';
import { mensajeReenvio } from '../utils/pedidosProveedor';
import { buildWhatsappUrl } from '../utils/whatsapp';
import NuevoPedidoModal from './Proveedores/NuevoPedidoModal';
import PedidosLista from './Proveedores/PedidosLista';
import ProveedorFormModal from './Proveedores/ProveedorFormModal';
import ProveedoresLista from './Proveedores/ProveedoresLista';
import { usePedidos } from './Proveedores/usePedidos';

const FILTROS_PEDIDO = [
  { id: 'enviado', etiqueta: 'Pendientes' },
  { id: 'recibido', etiqueta: 'Recibidos' },
  { id: 'cancelado', etiqueta: 'Cancelados' },
  { id: 'todos', etiqueta: 'Todos' },
];

const VACIO_PEDIDOS = {
  enviado: 'No hay pedidos pendientes.',
  recibido: 'Todavía no hay pedidos recibidos.',
  cancelado: 'No hay pedidos cancelados.',
  todos: 'Todavía no hay pedidos registrados.',
};

const BOTON_PRIMARIO = 'inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90';
const BOTON_SECUNDARIO = 'inline-flex items-center gap-2 rounded-lg border border-rosewood px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-rosewood/5';

const Proveedores = () => {
  const { token, user } = useAuth();
  // Borrar proveedores es solo de admin/superadmin (el servidor responde 403 al vendedor).
  const puedeBorrar = user?.role === 'admin' || user?.role === 'superadmin';
  const { confirm, ConfirmModal } = useConfirm();
  const { filtros, setEstado, setPagina, texto, setTexto, lista, loading: loadingPedidos, error: errorPedidos, setError: setErrorPedidos, reload } = usePedidos(token);

  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [vista, setVista] = useState('activos');
  const [busqueda, setBusqueda] = useState('');
  const [creandoProveedor, setCreandoProveedor] = useState(false);
  const [editando, setEditando] = useState(null);
  const [creandoPedido, setCreandoPedido] = useState(false);

  const proveedoresPorId = useMemo(() => new Map(proveedores.map((p) => [Number(p.id), p])), [proveedores]);
  const activos = useMemo(() => proveedores.filter((p) => p.activo), [proveedores]);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    apiGet('/api/proveedores?include_inactivos=true', { signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted) setProveedores(Array.isArray(payload) ? payload : []); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message || 'No fue posible cargar proveedores'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token]);

  const avisar = (mensaje) => { setError(''); setErrorPedidos(''); setSuccess(mensaje); };
  const fallar = (mensaje) => { setSuccess(''); setError(mensaje); };

  // -- Proveedores --

  const handleProveedorGuardado = (guardado, mensaje) => {
    setProveedores((actual) => [...actual.filter((p) => p.id !== guardado.id), guardado]
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')));
    setCreandoProveedor(false);
    setEditando(null);
    avisar(mensaje);
  };

  const handleToggleActivo = async (proveedor) => {
    try {
      const actualizado = await apiPatch(`/api/proveedores/${proveedor.id}`, { activo: !proveedor.activo });
      setProveedores((actual) => actual.map((p) => (p.id === proveedor.id ? actualizado : p)));
      avisar(actualizado.activo ? `"${proveedor.nombre}" activado` : `"${proveedor.nombre}" desactivado: ya no aparece al crear pedidos`);
    } catch (err) {
      fallar(err.message || 'No se pudo cambiar el estado');
    }
  };

  const handleBorrar = async (proveedor) => {
    const ok = await confirm({ message: `¿Eliminar a "${proveedor.nombre}"? Sus productos quedarán sin proveedor. No se puede si tiene pedidos o facturas.` });
    if (!ok) return;
    try {
      await apiDelete(`/api/proveedores/${proveedor.id}`);
      setProveedores((actual) => actual.filter((p) => p.id !== proveedor.id));
      avisar(`Proveedor "${proveedor.nombre}" eliminado`);
    } catch (err) {
      fallar(err.message || 'No se pudo eliminar el proveedor');
    }
  };

  // -- Pedidos --

  const handlePedidoCreado = async (pedido, abrioWhatsapp) => {
    setCreandoPedido(false);
    avisar(abrioWhatsapp
      ? `Pedido #${pedido.id} registrado y abierto en WhatsApp`
      : `Pedido #${pedido.id} registrado. Agrega el WhatsApp del proveedor para enviarlo.`);
    await reload({ silent: true });
  };

  const handleWhatsapp = (pedido) => {
    const proveedor = proveedoresPorId.get(Number(pedido.proveedor_id));
    const url = buildWhatsappUrl(proveedor?.telefono, mensajeReenvio({ pedido, proveedor, formatMoney }));
    if (!url) {
      fallar('El proveedor no tiene telefono de WhatsApp registrado');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    avisar(`Pedido #${pedido.id} abierto en WhatsApp`);
  };

  const handleEstado = async (pedido, estado) => {
    if (estado === 'cancelado') {
      const ok = await confirm({ message: `¿Cancelar el pedido #${pedido.id} a ${pedido.proveedor_nombre}? Podrás reabrirlo después.`, variant: 'danger' });
      if (!ok) return;
    }
    try {
      await cambiarEstadoPedido(pedido.id, estado);
      const mensajes = { recibido: 'marcado como recibido', cancelado: 'cancelado', enviado: 'reabierto' };
      avisar(`Pedido #${pedido.id} ${mensajes[estado]}`);
      await reload({ silent: true });
    } catch (err) {
      fallar(err.message || 'No se pudo cambiar el estado del pedido');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Truck className="h-8 w-8 text-rosewood" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Proveedores</h1>
            <p className="text-gray-600">Pedidos de compra directos, sin aprobación administrativa</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { avisar(''); setCreandoProveedor(true); }} className={BOTON_SECUNDARIO}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo proveedor
          </button>
          <button type="button" onClick={() => { avisar(''); setCreandoPedido(true); }} className={BOTON_PRIMARIO}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" /> Nuevo pedido
          </button>
        </div>
      </div>

      <ErrorMessage message={error || errorPedidos} onDismiss={() => { setError(''); setErrorPedidos(''); }} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Pedidos</h2>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <label htmlFor="buscar-pedido" className="sr-only">Buscar pedido</label>
            <input id="buscar-pedido" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por proveedor o producto" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none" />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Estado de los pedidos">
            {FILTROS_PEDIDO.map(({ id, etiqueta }) => (
              <button key={id} type="button" aria-pressed={filtros.estado === id} onClick={() => setEstado(id)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filtros.estado === id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
        <PedidosLista
          pedidos={lista.data}
          loading={loadingPedidos}
          vacio={texto ? 'No se encontraron pedidos con ese criterio.' : VACIO_PEDIDOS[filtros.estado]}
          proveedoresPorId={proveedoresPorId}
          onWhatsapp={handleWhatsapp}
          onEstado={handleEstado}
        />
        {lista.totalPages > 1 && (
          <div className="mt-4">
            <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Listado de proveedores</h2>
        <ProveedoresLista
          proveedores={proveedores}
          loading={loading}
          vista={vista}
          onVista={setVista}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          puedeBorrar={puedeBorrar}
          onEditar={(proveedor) => { avisar(''); setEditando(proveedor); }}
          onToggle={handleToggleActivo}
          onBorrar={handleBorrar}
        />
      </section>

      <NuevoPedidoModal abierto={creandoPedido} proveedores={activos} onPedido={handlePedidoCreado} onClose={() => setCreandoPedido(false)} />
      <ProveedorFormModal abierto={creandoProveedor} onSaved={handleProveedorGuardado} onClose={() => setCreandoProveedor(false)} />
      <ProveedorFormModal abierto={editando !== null} proveedor={editando} onSaved={handleProveedorGuardado} onClose={() => setEditando(null)} />
      {ConfirmModal}
    </div>
  );
};

export default Proveedores;
