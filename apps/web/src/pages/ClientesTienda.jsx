import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiPatch, apiPost, apiRequest } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import PaginationControls from '../components/PaginationControls';
import Skeleton from '../components/Skeleton';
import SuccessMessage from '../components/SuccessMessage';
import useConfirm from '../components/useConfirm';
import AbonoModal from './ClientesTienda/AbonoModal';
import ClienteFila from './ClientesTienda/ClienteFila';
import ClienteFormModal from './ClientesTienda/ClienteFormModal';
import HistorialClienteModal from './ClientesTienda/HistorialClienteModal';
import ListaToolbar from './ClientesTienda/ListaToolbar';
import ResumenDeuda from './ClientesTienda/ResumenDeuda';
import { buildWhatsappUrl, cobroMessage, formatPhone } from './ClientesTienda/tiendaHelpers';
import { useClientesTienda } from './ClientesTienda/useClientesTienda';

const env = import.meta.env;
const FORMAS_DE_PAGO = { banco: env.VITE_COBRO_BANCO, tipoCuenta: env.VITE_COBRO_TIPO_CUENTA, cuenta: env.VITE_COBRO_NUMERO_CUENTA, nequi: env.VITE_COBRO_NEQUI_NUMERO };

const ClientesTienda = () => {
  const { token, user } = useAuth();
  const { confirm, ConfirmModal } = useConfirm();
  const { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload } = useClientesTienda(token);
  const [success, setSuccess] = useState('');
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [abonando, setAbonando] = useState(null);
  const [historial, setHistorial] = useState(null);

  const refrescar = () => reload({ silent: true });
  const puedeVerEliminados = user?.role === 'admin' || user?.role === 'superadmin';

  const abrirFormulario = (cliente) => { setError(''); setSuccess(''); setEditando(cliente); setFormAbierto(true); };
  const cerrarFormulario = () => { setFormAbierto(false); setEditando(null); };

  // Un homonimo (mismo nombre, otro numero) se registra solo si quien atiende confirma que es otra persona.
  const enviarConHomonimo = async (guardar, payload, error409) => {
    const otro = error409.payload?.coincidencias?.[0];
    const detalle = otro ? `«${otro.nombre}»${otro.telefono_whatsapp ? ` (${formatPhone(otro.telefono_whatsapp)})` : ''}` : 'ese nombre';
    const esOtraPersona = await confirm({ title: '¿Es otra persona?', message: `Ya hay un cliente llamado ${detalle}. ¿Es otra persona con el mismo nombre?`, variant: 'primary' });
    if (!esOtraPersona) throw new Error('No se guardó: ya existe un cliente con ese nombre.');
    return guardar({ ...payload, confirmar_homonimo: true });
  };

  const handleGuardar = async (payload, id) => {
    const guardar = (cuerpo) => (id ? apiPatch(`/api/clientes/tienda-fiado/${id}`, cuerpo) : apiPost('/api/clientes/tienda-fiado', cuerpo));
    try {
      await guardar(payload);
    } catch (err) {
      if (err.status !== 409 || !err.payload?.homonimo) throw err;
      await enviarConHomonimo(guardar, payload, err);
    }
    cerrarFormulario();
    setSuccess(id ? 'Cliente actualizado correctamente' : 'Cliente creado correctamente');
    await refrescar();
  };

  const handleEliminar = async (cliente) => {
    const ok = await confirm({ title: 'Eliminar cliente', message: `¿Eliminar a ${cliente.nombre}? Podrás verlo y reactivarlo en «Eliminados».` });
    if (!ok) return;
    try {
      await apiDelete(`/api/clientes/tienda-fiado/${cliente.id}`);
      setSuccess('Cliente eliminado correctamente');
      await refrescar();
    } catch (err) {
      setError(err.message || 'No fue posible eliminar el cliente');
    }
  };

  const handleReactivar = async (cliente) => {
    try {
      await apiRequest(`/api/clientes/tienda-fiado/${cliente.id}/reactivar`, { method: 'PUT' });
      setSuccess(`${cliente.nombre} quedó activo de nuevo`);
      await refrescar();
    } catch (err) {
      setError(err.message || 'No fue posible reactivar el cliente');
    }
  };

  const handleWhatsapp = (cliente) => {
    const enlace = buildWhatsappUrl(cliente.telefono_whatsapp, cobroMessage(cliente, FORMAS_DE_PAGO));
    if (!enlace) { setError('Este cliente no tiene un WhatsApp válido'); return; }
    window.open(enlace, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <UserRound className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes de Tienda</h1>
          <p className="text-gray-600">Quién debe, desde cuándo y cuánto: cobra y registra abonos desde aquí</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <ResumenDeuda resumen={resumen} />
      <ListaToolbar
        texto={texto}
        onTexto={setTexto}
        filtros={filtros}
        onFiltro={setFiltro}
        total={lista.total}
        puedeVerEliminados={puedeVerEliminados}
        onNuevo={() => abrirFormulario(null)}
      />

      {loading && <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"><Skeleton lines={3} /></div>}
      {!loading && lista.data.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600 shadow-sm">
          {texto || filtros.filtro !== 'todos' ? 'No hay clientes que coincidan con la búsqueda.' : 'Todavía no hay clientes registrados.'}
        </div>
      )}
      {!loading && lista.data.length > 0 && (
        <ul className="space-y-3">
          {lista.data.map((cliente) => (
            <ClienteFila
              key={cliente.id}
              cliente={cliente}
              onAbonar={setAbonando}
              onHistorial={setHistorial}
              onWhatsapp={handleWhatsapp}
              onEditar={abrirFormulario}
              onEliminar={handleEliminar}
              onReactivar={handleReactivar}
            />
          ))}
        </ul>
      )}
      {lista.total_pages > 1 && <PaginationControls currentPage={filtros.page} totalPages={lista.total_pages} onPageChange={setPagina} />}

      <ClienteFormModal abierto={formAbierto} cliente={editando} onSubmit={handleGuardar} onClose={cerrarFormulario} />
      <AbonoModal cliente={abonando} onRegistrado={refrescar} onClose={() => setAbonando(null)} />
      <HistorialClienteModal cliente={historial} role={user?.role} onChanged={refrescar} onClose={() => setHistorial(null)} />
      {ConfirmModal}
    </div>
  );
};

export default ClientesTienda;
