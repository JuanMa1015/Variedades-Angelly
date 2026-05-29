const CarteraProductosSection = ({
  productosCartera,
  formatMoney,
  startNewProducto,
  startEditingProducto,
  handleDeleteProducto,
}) => {
  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Productos de cartera</h2>
          <p className="text-sm text-gray-600">Administra el catálogo de productos que aparecen en venta de cartera.</p>
        </div>
        <button
          type="button"
          onClick={startNewProducto}
          className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Registrar producto
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Producto</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Código</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Costo</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Venta</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosCartera.map((producto) => (
                <tr key={producto.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{producto.nombre}</td>
                  <td className="px-4 py-3 text-gray-700">{producto.codigo_barras || '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatMoney(producto.precio_costo)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatMoney(producto.precio_venta)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEditingProducto(producto)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-amber-600 transition hover:bg-amber-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProducto(producto)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {productosCartera.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    No hay productos de cartera registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {productosCartera.map((producto) => (
            <div key={`producto-${producto.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-base font-semibold text-gray-900">{producto.nombre}</p>
              <p className="mt-1 text-xs text-gray-500">Código: {producto.codigo_barras || '-'}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-gray-600">
                  <p className="uppercase tracking-[0.08em]">Costo</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{formatMoney(producto.precio_costo)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-gray-600">
                  <p className="uppercase tracking-[0.08em]">Venta</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{formatMoney(producto.precio_venta)}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => startEditingProducto(producto)}
                  className="flex-1 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-600 transition hover:bg-amber-100"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteProducto(producto)}
                  className="flex-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}

          {productosCartera.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-500">
              No hay productos de cartera registrados.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CarteraProductosSection;
