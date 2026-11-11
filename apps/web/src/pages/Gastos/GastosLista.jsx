import { Fragment } from 'react';
import { Ban, Search } from 'lucide-react';
import PaymentBadge from '../../components/PaymentBadge';
import Skeleton from '../../components/Skeleton';
import { formatDateTime, formatMoney } from '../../utils/format';
import AnularVentaForm from '../Ventas/AnularVentaForm';
import { CATEGORIAS, ESTADOS_GASTO, MEDIOS_GASTO, etiquetaCategoria } from './gastosHelpers';

const SELECT = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';

const Filtros = ({ texto, onTexto, filtros, onFiltro }) => (
  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div className="relative sm:col-span-2 lg:col-span-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      <label htmlFor="gastos-buscar" className="sr-only">Buscar gasto</label>
      <input id="gastos-buscar" type="search" value={texto} onChange={(e) => onTexto(e.target.value)} placeholder="Buscar por detalle o quién lo registró" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none" />
    </div>
    <div>
      <label htmlFor="gastos-filtro-categoria" className="sr-only">Categoría</label>
      <select id="gastos-filtro-categoria" value={filtros.categoria} onChange={(e) => onFiltro({ categoria: e.target.value })} className={`${SELECT} w-full`}>
        <option value="">Todas las categorías</option>
        {CATEGORIAS.map(({ id, etiqueta }) => <option key={id} value={id}>{etiqueta}</option>)}
      </select>
    </div>
    <div>
      <label htmlFor="gastos-filtro-medio" className="sr-only">Medio de pago</label>
      <select id="gastos-filtro-medio" value={filtros.medio} onChange={(e) => onFiltro({ medio: e.target.value })} className={`${SELECT} w-full`}>
        <option value="">Todos los medios</option>
        {MEDIOS_GASTO.map(({ id, etiqueta }) => <option key={id} value={id}>{etiqueta.replace(' (sale del cajón)', '')}</option>)}
      </select>
    </div>
    <div>
      <label htmlFor="gastos-filtro-estado" className="sr-only">Estado</label>
      <select id="gastos-filtro-estado" value={filtros.estado} onChange={(e) => onFiltro({ estado: e.target.value })} className={`${SELECT} w-full`}>
        {ESTADOS_GASTO.map(({ id, etiqueta }) => <option key={id} value={id}>{etiqueta}</option>)}
      </select>
    </div>
  </div>
);

const BotonAnular = ({ gasto, onToggle }) => (
  <button type="button" onClick={() => onToggle(gasto.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50" aria-label={`Anular gasto ${gasto.id}`}>
    <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Anular
  </button>
);

const Anulado = ({ gasto }) => gasto.anulado && (
  <>
    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Anulado</span>
    {gasto.motivo_anulacion && <span className="block text-xs text-red-700">Motivo: {gasto.motivo_anulacion}</span>}
  </>
);

const FormularioAnular = ({ gasto, anulacion }) => (
  <AnularVentaForm
    pideAutorizacion={anulacion.pideAutorizacion}
    saving={anulacion.saving}
    error={anulacion.error}
    onSubmit={(datos) => anulacion.onAnular(gasto, datos)}
    onCancel={() => anulacion.onToggle(gasto.id)}
  />
);

const Tabla = ({ gastos, anulacion }) => (
  <div className="hidden overflow-x-auto md:block">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-gray-200 bg-gray-50">
        <tr>
          {['Fecha', 'Categoría', 'Descripción', 'Pagado con', 'Monto', 'Registrado por', 'Acciones'].map((titulo) => (
            <th key={titulo} className="px-3 py-3 font-semibold text-gray-700">{titulo}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {gastos.map((gasto) => (
          <Fragment key={gasto.id}>
            <tr className={`border-b border-gray-100 ${gasto.anulado ? 'bg-gray-50/60 text-gray-400' : ''}`}>
              <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDateTime(gasto.fecha)}</td>
              <td className="px-3 py-3"><span className="rounded-full bg-blush-100 px-2 py-1 text-xs font-semibold text-rosewood">{etiquetaCategoria(gasto.categoria)}</span></td>
              <td className="px-3 py-3 text-gray-700">{gasto.descripcion}<Anulado gasto={gasto} /></td>
              <td className="px-3 py-3"><PaymentBadge method={gasto.medio_pago} compact /></td>
              <td className={`whitespace-nowrap px-3 py-3 font-semibold ${gasto.anulado ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatMoney(gasto.monto)}</td>
              <td className="px-3 py-3 text-gray-700">{gasto.registrado_por}</td>
              <td className="px-3 py-3">{!gasto.anulado && <BotonAnular gasto={gasto} onToggle={anulacion.onToggle} />}</td>
            </tr>
            {anulacion.id === gasto.id && (
              <tr className="border-b border-gray-100"><td colSpan="7" className="px-3 pb-3"><FormularioAnular gasto={gasto} anulacion={anulacion} /></td></tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

const Tarjetas = ({ gastos, anulacion }) => (
  <ul className="space-y-3 md:hidden">
    {gastos.map((gasto) => (
      <li key={gasto.id} className={`rounded-xl border p-4 shadow-sm ${gasto.anulado ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-200 bg-white'}`}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="rounded-full bg-blush-100 px-2 py-1 text-xs font-semibold text-rosewood">{etiquetaCategoria(gasto.categoria)}</span>
          <PaymentBadge method={gasto.medio_pago} compact />
        </div>
        <p className="text-sm text-gray-800">{gasto.descripcion}<Anulado gasto={gasto} /></p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className={`text-lg font-bold ${gasto.anulado ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatMoney(gasto.monto)}</span>
          <span className="text-xs text-gray-500">{gasto.registrado_por} · {formatDateTime(gasto.fecha)}</span>
        </div>
        {!gasto.anulado && <div className="mt-3"><BotonAnular gasto={gasto} onToggle={anulacion.onToggle} /></div>}
        {anulacion.id === gasto.id && <FormularioAnular gasto={gasto} anulacion={anulacion} />}
      </li>
    ))}
  </ul>
);

// `anulacion`: { id (gasto abierto), pideAutorizacion, saving, error, onToggle, onAnular }.
const GastosLista = ({ gastos, loading, hayFiltros, texto, onTexto, filtros, onFiltro, anulacion }) => (
  <>
    <Filtros texto={texto} onTexto={onTexto} filtros={filtros} onFiltro={onFiltro} />
    {loading && <Skeleton lines={3} />}
    {!loading && gastos.length === 0 && (
      <p className="py-8 text-center text-sm text-gray-500">{hayFiltros ? 'No se encontraron gastos con ese criterio.' : 'No hay gastos registrados en este mes.'}</p>
    )}
    {!loading && gastos.length > 0 && (
      <>
        <Tabla gastos={gastos} anulacion={anulacion} />
        <Tarjetas gastos={gastos} anulacion={anulacion} />
      </>
    )}
  </>
);

export default GastosLista;
