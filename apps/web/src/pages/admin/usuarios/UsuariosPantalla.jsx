import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { apiGet, apiRequest } from '../../../api/httpClient';
import { useAuth } from '../../../auth/AuthContext';
import EditFormModal from '../../../components/EditFormModal';
import ErrorMessage from '../../../components/ErrorMessage';
import Skeleton from '../../../components/Skeleton';
import SuccessMessage from '../../../components/SuccessMessage';
import useConfirm from '../../../components/useConfirm';
import CreateAdminDialog from '../components/CreateDialogs/CreateAdminDialog';
import CreateVendedorDialog from '../components/CreateDialogs/CreateVendedorDialog';

const TIPOS = {
  vendedores: { titulo: 'Vendedores', singular: 'vendedor', descripcion: 'Quienes venden en la tienda. Solo ven sus propios módulos.', Crear: CreateVendedorDialog },
  admins: { titulo: 'Administradores', singular: 'admin', descripcion: 'Quienes manejan la cartera. No ven los módulos de la tienda.', Crear: CreateAdminDialog },
};

const boton = 'rounded-full border px-3 py-1.5 text-xs font-semibold transition';
const CAMPOS_EDITAR = [
  { name: 'username', label: 'Usuario', type: 'text', required: true },
  { name: 'password', label: 'Nueva contraseña (en blanco para mantener)', type: 'password', required: false },
];

const Estado = ({ activo }) => (
  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
    {activo ? 'Activo' : 'Inactivo'}
  </span>
);

const Acciones = ({ usuario, onEditar, onAlternar, onCerrarSesiones }) => (
  <div className="flex flex-wrap gap-2">
    <button type="button" onClick={() => onEditar(usuario)} className={`${boton} border-gray-300 text-gray-700 hover:bg-gray-50`}>Editar</button>
    <button
      type="button"
      onClick={() => onAlternar(usuario)}
      className={`${boton} ${usuario.activo ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}
    >
      {usuario.activo ? 'Desactivar' : 'Reactivar'}
    </button>
    {usuario.activo && (
      <button type="button" onClick={() => onCerrarSesiones(usuario)} className={`${boton} border-amber-300 text-amber-700 hover:bg-amber-50`}>Cerrar sesiones</button>
    )}
  </div>
);

// Vendedores y admins comparten pantalla: un usuario no se borra, se desactiva (su historial se conserva).
const UsuariosPantalla = ({ tipo }) => {
  const config = TIPOS[tipo];
  const { token } = useAuth();
  const { confirm, ConfirmModal } = useConfirm();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);

  const base = `/api/superadmin/usuarios/${tipo}`;

  const cargar = useCallback(async (signal) => {
    if (!token) return;
    try {
      const lista = await apiGet(base, { signal });
      if (signal?.aborted) return;
      setUsuarios(Array.isArray(lista) ? lista : []);
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No fue posible cargar los usuarios');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token, base]);

  useEffect(() => {
    const controller = new AbortController();
    void cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return texto ? usuarios.filter((u) => u.username.toLowerCase().includes(texto)) : usuarios;
  }, [usuarios, busqueda]);

  // Ejecuta una accion sobre el usuario, recarga y avisa; cualquier fallo se muestra, no se pierde.
  const ejecutar = useCallback(async (endpoint, method, mensaje) => {
    setError('');
    setExito('');
    try {
      await apiRequest(endpoint, { method });
      await cargar();
      setExito(mensaje);
    } catch (err) {
      setError(err.message || 'No se pudo completar la acción');
    }
  }, [cargar]);

  const alternar = useCallback(async (usuario) => {
    const desactivar = usuario.activo;
    const ok = await confirm({
      title: desactivar ? `Desactivar ${config.singular}` : `Reactivar ${config.singular}`,
      message: desactivar
        ? `${usuario.username} ya no podrá entrar y se le cerrarán las sesiones abiertas. Su historial se conserva.`
        : `${usuario.username} podrá volver a entrar con su usuario y clave.`,
      confirmLabel: desactivar ? 'Desactivar' : 'Reactivar',
    });
    if (!ok) return;
    await ejecutar(
      desactivar ? `${base}/${usuario.id}` : `${base}/${usuario.id}/reactivar`,
      desactivar ? 'DELETE' : 'PUT',
      desactivar ? `${usuario.username} fue desactivado` : `${usuario.username} fue reactivado`,
    );
  }, [confirm, config.singular, base, ejecutar]);

  const cerrarSesiones = useCallback(async (usuario) => {
    const ok = await confirm({
      title: 'Cerrar sesiones',
      message: `${usuario.username} saldrá de todos sus dispositivos y tendrá que iniciar sesión otra vez. Su clave no cambia.`,
      confirmLabel: 'Cerrar sesiones',
    });
    if (!ok) return;
    await ejecutar(`${base}/${usuario.id}/cerrar-sesiones`, 'POST', `Se cerraron las sesiones de ${usuario.username}`);
  }, [confirm, base, ejecutar]);

  const guardarEdicion = async (valores) => {
    const cuerpo = { username: valores.username.trim() };
    if (valores.password?.trim()) cuerpo.password = valores.password;
    await apiRequest(`${base}/${editando.id}`, { method: 'PATCH', body: cuerpo });
    await cargar();
    setExito(`${cuerpo.username} fue actualizado${cuerpo.password ? ' y se cerraron sus sesiones' : ''}`);
  };

  const valoresIniciales = useMemo(() => ({ username: editando?.username ?? '', password: '' }), [editando]);
  const Crear = config.Crear;
  const acciones = { onEditar: setEditando, onAlternar: alternar, onCerrarSesiones: cerrarSesiones };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Users className="h-6 w-6 text-rosewood" /> {config.titulo}</h1>
          <p className="text-sm text-gray-600">{config.descripcion} Un usuario no se borra: se desactiva.</p>
        </div>
        <button type="button" onClick={() => { setError(''); setExito(''); setCreando(true); }} className="inline-flex items-center justify-center gap-2 rounded-full bg-rosewood px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Crear {config.singular}
        </button>
      </div>

      <SuccessMessage message={exito} onDismiss={() => setExito('')} />
      <ErrorMessage message={error} onDismiss={() => setError('')} />

      <label className="relative block max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input aria-label="Buscar usuario" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por usuario" className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none" />
      </label>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {busqueda ? 'Ningún usuario coincide con la búsqueda.' : `Todavía no hay ${config.titulo.toLowerCase()}.`}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.12em] text-gray-500">
                  <th className="px-3 py-3">Usuario</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 text-gray-800">
                    <td className="px-3 py-3 font-semibold">{u.username}</td>
                    <td className="px-3 py-3"><Estado activo={u.activo} /></td>
                    <td className="px-3 py-3"><Acciones usuario={u} {...acciones} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {visibles.map((u) => (
              <li key={u.id} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900">{u.username}</p>
                  <Estado activo={u.activo} />
                </div>
                <Acciones usuario={u} {...acciones} />
              </li>
            ))}
          </ul>
        </>
      )}

      <Crear isOpen={creando} onClose={() => setCreando(false)} onCreated={(mensaje) => { setCreando(false); setExito(mensaje); void cargar(); }} />
      <EditFormModal
        isOpen={Boolean(editando)}
        title={`Editar ${config.singular}`}
        fields={CAMPOS_EDITAR}
        initialValues={valoresIniciales}
        onSave={guardarEdicion}
        onClose={() => setEditando(null)}
      />
      {ConfirmModal}
    </div>
  );
};

export default UsuariosPantalla;
