import { RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import ErrorMessage from '../../../components/ErrorMessage';
import PaginationControls from '../../../components/PaginationControls';
import Skeleton from '../../../components/Skeleton';
import { formatDateTime } from '../../../utils/format';
import { useAuditorias } from './useAuditorias';

const MODULOS = [
  ['cartera', 'Cartera'], ['clientes_cartera', 'Clientes de cartera'], ['clientes_tienda', 'Clientes de tienda'],
  ['caja', 'Caja'], ['facturas', 'Facturas de compra'], ['fidelizacion', 'Fidelización'], ['gastos', 'Gastos'],
  ['productos', 'Productos'], ['proveedores', 'Proveedores'], ['usuarios', 'Usuarios'], ['ventas', 'Ventas'],
];
const ACCIONES = [
  ['crear', 'Crear'], ['editar', 'Editar'], ['actualizar', 'Actualizar'], ['anular', 'Anular'], ['anular_abono', 'Anular abono'],
  ['eliminar', 'Eliminar'], ['desactivar', 'Desactivar'], ['reactivar', 'Reactivar'], ['cerrar_sesiones', 'Cerrar sesiones'],
  ['ajuste_stock', 'Ajuste de stock'], ['abono', 'Abono'], ['compra', 'Compra'],
];

const campo = 'rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-rosewood focus:outline-none';
const nombreDe = (lista, valor) => lista.find(([clave]) => clave === valor)?.[1] ?? valor;

const Selector = ({ etiqueta, valor, opciones, onChange, todas }) => (
  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
    {etiqueta}
    <select aria-label={etiqueta} value={valor} onChange={(e) => onChange(e.target.value)} className={campo}>
      <option value="">{todas}</option>
      {opciones.map(([clave, texto]) => <option key={clave} value={clave}>{texto}</option>)}
    </select>
  </label>
);

const AuditoriasPantalla = () => {
  const { token } = useAuth();
  const { filtros, setFiltro, setPagina, texto, setTexto, limpiar, hayFiltros, lista, loading, error, reload } = useAuditorias(token);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ShieldCheck className="h-6 w-6 text-rosewood" /> Auditorías
        </h1>
        <p className="text-sm text-gray-600">Historial de todo lo que se hace en el sistema. Solo se consulta: nadie lo edita ni lo borra.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 sm:col-span-2 lg:col-span-1">
          Buscar
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Buscar"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Detalle, entidad o usuario"
              className={`${campo} w-full pl-9`}
            />
          </span>
        </label>
        <Selector etiqueta="Módulo" valor={filtros.modulo} opciones={MODULOS} onChange={(modulo) => setFiltro({ modulo })} todas="Todos" />
        <Selector etiqueta="Acción" valor={filtros.accion} opciones={ACCIONES} onChange={(accion) => setFiltro({ accion })} todas="Todas" />
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
          Desde
          <input aria-label="Desde" type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => setFiltro({ desde: e.target.value })} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
          Hasta
          <input aria-label="Hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => setFiltro({ hasta: e.target.value })} className={campo} />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
        <span>{loading ? 'Cargando…' : `${lista.total} ${lista.total === 1 ? 'registro' : 'registros'}`}</span>
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <RotateCcw className="h-3.5 w-3.5" /> Limpiar filtros
          </button>
        )}
      </div>

      {error ? (
        <div className="space-y-3">
          <ErrorMessage message={error} />
          <button type="button" onClick={() => reload()} className="rounded-full bg-rosewood px-4 py-2 text-sm font-semibold text-white">Reintentar</button>
        </div>
      ) : loading && lista.data.length === 0 ? (
        <Skeleton className="h-64 w-full" />
      ) : lista.data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {hayFiltros ? 'Ningún registro coincide con esos filtros.' : 'Todavía no hay registros.'}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.12em] text-gray-500">
                  <th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Usuario</th><th className="px-3 py-3">Módulo</th>
                  <th className="px-3 py-3">Acción</th><th className="px-3 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {lista.data.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 align-top text-gray-800">
                    <td className="whitespace-nowrap px-3 py-3">{formatDateTime(a.fecha)}</td>
                    <td className="px-3 py-3 font-semibold">{a.usuario}</td>
                    <td className="px-3 py-3">{nombreDe(MODULOS, a.modulo)}</td>
                    <td className="px-3 py-3">{nombreDe(ACCIONES, a.accion)}</td>
                    <td className="px-3 py-3">{a.detalle || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {lista.data.map((a) => (
              <li key={a.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900">{nombreDe(ACCIONES, a.accion)} · {nombreDe(MODULOS, a.modulo)}</p>
                  <span className="text-xs text-gray-500">{formatDateTime(a.fecha)}</span>
                </div>
                <p className="mt-1 text-sm text-gray-700">{a.detalle || '-'}</p>
                <p className="mt-2 text-xs text-gray-500">Por {a.usuario}</p>
              </li>
            ))}
          </ul>

          {lista.totalPages > 1 && <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />}
        </>
      )}
    </div>
  );
};

export default AuditoriasPantalla;
