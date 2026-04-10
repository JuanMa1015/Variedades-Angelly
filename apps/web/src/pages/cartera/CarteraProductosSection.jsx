const CarteraProductosSection = ({
  productosCartera,
  formatMoney,
  startNewProducto,
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Producto</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Código</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Costo</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Venta</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Stock</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {productosCartera.map((producto) => (
                <tr key={producto.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{producto.nombre}</td>
                  <td className="px-4 py-3 text-gray-700">{producto.codigo_barras || '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatMoney(producto.precio_costo)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatMoney(producto.precio_venta)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{producto.stock_actual}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{producto.stock_minimo}</td>
                </tr>
              ))}

              {productosCartera.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No hay productos de cartera registrados.
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

export default CarteraProductosSection;
