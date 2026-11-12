import { RotateCcw, Search, X } from 'lucide-react';
import { FILTROS_STOCK } from './inventarioHelpers';

const SELECT = 'rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 focus:border-rosewood focus:outline-none';

const Chip = ({ activo, onClick, children }) => (
  <button
    type="button"
    aria-pressed={activo}
    onClick={onClick}
    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activo ? 'border-rosewood bg-rosewood text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
  >
    {children}
  </button>
);

// Buscador (nombre, codigo o proveedor), filtro por estado de stock, proveedor y orden: todo lo resuelve el servidor.
// Sin `proveedores` (cartera no los usa) no se muestra el filtro de proveedor.
const InventarioToolbar = ({ texto, onTexto, filtros, onFiltro, proveedores, puedeVerDesactivados, onRecargar, placeholder = 'Buscar por nombre, código o proveedor' }) => (
  <div className="mb-4 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[14rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          type="text"
          placeholder={placeholder}
          aria-label="Buscar productos"
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-8 text-sm focus:border-rosewood focus:outline-none"
        />
        {texto && (
          <button type="button" onClick={() => onTexto('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <button type="button" onClick={onRecargar} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Recargar
      </button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {FILTROS_STOCK.map((filtro) => (
        <Chip key={filtro.id} activo={!filtros.soloInactivos && filtros.estado === filtro.id} onClick={() => onFiltro({ estado: filtro.id, soloInactivos: false })}>
          {filtro.etiqueta}
        </Chip>
      ))}
      {puedeVerDesactivados && (
        <Chip activo={filtros.soloInactivos} onClick={() => onFiltro({ soloInactivos: !filtros.soloInactivos, estado: 'todos' })}>Desactivados</Chip>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {proveedores && (
          <>
            <label htmlFor="filtro-proveedor" className="sr-only">Proveedor</label>
            <select id="filtro-proveedor" value={filtros.proveedorId ?? ''} onChange={(e) => onFiltro({ proveedorId: e.target.value ? Number(e.target.value) : null })} className={SELECT}>
              <option value="">Todos los proveedores</option>
              {proveedores.filter((p) => p.activo).map((prov) => <option key={prov.id} value={prov.id}>{prov.nombre}</option>)}
            </select>
          </>
        )}
        <label htmlFor="orden-productos" className="sr-only">Ordenar por</label>
        <select id="orden-productos" value={filtros.orden} onChange={(e) => onFiltro({ orden: e.target.value })} className={SELECT}>
          <option value="nombre">Nombre</option>
          <option value="stock">Menos stock primero</option>
          <option value="precio">Mayor precio</option>
        </select>
      </div>
    </div>
  </div>
);

export default InventarioToolbar;
