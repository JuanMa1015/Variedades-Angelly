import { Plus, Search } from 'lucide-react';
import { FILTROS, ORDENES } from './tiendaHelpers';

const Chip = ({ activo, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={activo}
    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
      activo ? 'border-rosewood bg-rosewood text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
    }`}
  >
    {children}
  </button>
);

// Buscador, filtros por estado, orden y alta de clientes: todo junto, arriba de la lista.
const ListaToolbar = ({ texto, onTexto, filtros, onFiltro, total, puedeVerEliminados, onNuevo }) => (
  <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[12rem] flex-1">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          type="search"
          value={texto}
          onChange={(event) => onTexto(event.target.value)}
          aria-label="Buscar clientes"
          placeholder="Buscar por nombre o WhatsApp"
          className="w-full rounded-xl border-2 border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-rosewood focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={onNuevo}
        className="inline-flex items-center gap-2 rounded-xl bg-rosewood px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo cliente
      </button>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {FILTROS.map((filtro) => (
        <Chip key={filtro.id} activo={!filtros.inactivos && filtros.filtro === filtro.id} onClick={() => onFiltro({ filtro: filtro.id, inactivos: false })}>
          {filtro.etiqueta}
        </Chip>
      ))}
      {puedeVerEliminados && (
        <Chip activo={filtros.inactivos} onClick={() => onFiltro({ inactivos: !filtros.inactivos, filtro: 'todos' })}>Eliminados</Chip>
      )}
      <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
        <span>{total} {total === 1 ? 'cliente' : 'clientes'}</span>
        <label htmlFor="orden-clientes" className="sr-only">Ordenar por</label>
        <select
          id="orden-clientes"
          value={filtros.orden}
          onChange={(event) => onFiltro({ orden: event.target.value })}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 focus:border-rosewood focus:outline-none"
        >
          {ORDENES.map((orden) => <option key={orden.id} value={orden.id}>{orden.etiqueta}</option>)}
        </select>
      </div>
    </div>
  </section>
);

export default ListaToolbar;
