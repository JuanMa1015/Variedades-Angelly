const CarteraClientesSection = ({
  clientesCarteraFiltrados,
  formatMoney,
  searchTerm,
  setSearchTerm,
  startNewCliente,
  startEditingCliente,
  handleDeleteCliente,
}) => {
  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Registro de clientes</h2>
          <p className="text-sm text-gray-600">Alta y mantenimiento de clientes de cartera desde un modal.</p>
        </div>
        <button
          type="button"
          onClick={startNewCliente}
          className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Registrar cliente
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Buscar por nombre, cédula o WhatsApp"
          className="w-full rounded-xl border-2 border-gray-200 py-3 pl-4 pr-4 text-base transition focus:border-rosewood focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="w-[30%] px-4 py-3 font-semibold text-gray-700">Cliente</th>
                <th className="w-[18%] px-4 py-3 font-semibold text-gray-700">Documento</th>
                <th className="w-[20%] px-4 py-3 font-semibold text-gray-700">WhatsApp</th>
                <th className="w-[16%] px-4 py-3 text-right font-semibold text-gray-700">Deuda</th>
                <th className="w-[16%] px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientesCarteraFiltrados.map((cliente, index) => (
                <tr key={cliente.id} className={`border-b border-gray-100 align-middle transition hover:bg-rose-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{cliente.nombre}</td>
                  <td className="px-4 py-3 text-gray-700">{cliente.documento || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{cliente.telefono_whatsapp || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(cliente.deuda_total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button type="button" onClick={() => startEditingCliente(cliente)} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50">Editar</button>
                      <button type="button" onClick={() => handleDeleteCliente(cliente)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}

              {clientesCarteraFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                    No hay clientes que coincidan con la búsqueda actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default CarteraClientesSection;
