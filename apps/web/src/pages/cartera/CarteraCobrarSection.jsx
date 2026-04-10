import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import PaginationControls from '../../components/PaginationControls';

const CarteraCobrarSection = ({
  clientes,
  loading,
  error,
  searchTerm,
  setSearchTerm,
  expandedCobroClientes,
  toggleCobroCliente,
  handleAbrirWhatsapp,
  handleRegistrarAbono,
  handleVerDetalle,
  startEditingCliente,
  handleDeleteCliente,
  formatMoney,
  totalPages,
  currentPage,
  setCurrentPage,
}) => {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Cobrar cartera</h2>
            <p className="text-sm text-gray-600">Primero ves la tarjeta, luego despliegas detalles para hacer CRUD y cobrar.</p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{clientes.length} clientes visibles</span>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre, cédula o WhatsApp"
            className="w-full rounded-xl border-2 border-gray-200 py-3 pl-10 pr-4 text-base transition focus:border-rosewood focus:outline-none"
          />
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600 shadow-sm">
          Cargando clientes...
        </div>
      )}

      {!loading && !error && clientes.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600 shadow-sm">
          {searchTerm ? 'No se encontraron clientes' : 'No hay clientes para cobrar'}
        </div>
      )}

      {!loading && !error && clientes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {clientes.map((cliente) => {
            const deuda = Number(cliente.deuda_total || 0);
            const expanded = expandedCobroClientes.includes(cliente.id);

            return (
              <article key={cliente.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{cliente.nombre}</p>
                    <p className="mt-1 text-sm text-gray-600">Deuda actual: {formatMoney(deuda)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAbrirWhatsapp(cliente)}
                    disabled={!cliente.telefono_whatsapp}
                    className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    WhatsApp
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCobroCliente(cliente.id)}
                    className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                  >
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {expanded ? 'Ocultar detalles' : 'Ver detalles'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegistrarAbono(cliente)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                  >
                    Registrar abono
                  </button>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-3 rounded-2xl bg-gray-50 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Saldo pendiente</p>
                        <p className="mt-1 text-lg font-bold text-red-700">{formatMoney(deuda)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">WhatsApp</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{cliente.telefono_whatsapp || 'Sin número'}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleVerDetalle(cliente)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white">Ver detalles</button>
                      <button type="button" onClick={() => startEditingCliente(cliente)} className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50">Editar</button>
                      <button type="button" onClick={() => handleDeleteCliente(cliente)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50">Eliminar</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
    </section>
  );
};

export default CarteraCobrarSection;
