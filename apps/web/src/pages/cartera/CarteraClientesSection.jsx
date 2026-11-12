import { Search } from 'lucide-react';
import ErrorMessage from '../../components/ErrorMessage';
import PaginationControls from '../../components/PaginationControls';
import ClientesCarteraLista from './clientes/ClientesCarteraLista';
import ResumenDeudaClientes from './clientes/ResumenDeudaClientes';
import { useClientesCartera } from './clientes/useClientesCartera';

const FILTROS = [
  { id: 'activos', etiqueta: 'Activos' },
  { id: 'con_deuda', etiqueta: 'Con deuda' },
  { id: 'alerta', etiqueta: 'En alerta' },
  { id: 'moroso', etiqueta: 'Morosos' },
  { id: 'desactivados', etiqueta: 'Desactivados' },
];

// Lista de clientes con busqueda en vivo, filtros y paginas del servidor.
// `recargar` cambia cuando la pantalla guarda, desactiva o reactiva a alguien.
const CarteraClientesSection = ({ formatMoney, recargar, startNewCliente, startEditingCliente, handleDeleteCliente, handleReactivarCliente, handleVerDetalle }) => {
  const { filtros, setEstado, setPagina, texto, setTexto, lista, resumen, loading, error, setError } = useClientesCartera(recargar);
  const hayFiltro = Boolean(texto || filtros.estado !== 'activos');
  const vacio = hayFiltro ? 'No se encontraron clientes con ese criterio.' : 'Todavía no hay clientes registrados.';

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Registro de clientes</h2>
          <p className="text-sm text-gray-600">Alta y mantenimiento de clientes de cartera.</p>
        </div>
        <button
          type="button"
          onClick={startNewCliente}
          className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Registrar cliente
        </button>
      </div>

      <ResumenDeudaClientes resumen={resumen} loading={loading} formatMoney={formatMoney} />
      <ErrorMessage message={error} onDismiss={() => setError('')} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <label htmlFor="buscar-cliente-cartera" className="sr-only">Buscar cliente</label>
          <input
            id="buscar-cliente-cartera"
            type="search"
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            placeholder="Buscar por nombre, cédula o WhatsApp"
            className="w-full rounded-xl border-2 border-gray-200 py-2.5 pl-9 pr-3 text-sm transition focus:border-rosewood focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro de clientes">
          {FILTROS.map(({ id, etiqueta }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filtros.estado === id}
              onClick={() => setEstado(id)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filtros.estado === id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 p-2 sm:p-3">
        <ClientesCarteraLista
          clientes={lista.data}
          loading={loading}
          vacio={vacio}
          formatMoney={formatMoney}
          onDetalle={handleVerDetalle}
          onEditar={startEditingCliente}
          onDesactivar={handleDeleteCliente}
          onReactivar={handleReactivarCliente}
        />
      </div>
      {lista.totalPages > 1 && <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />}
    </section>
  );
};

export default CarteraClientesSection;
