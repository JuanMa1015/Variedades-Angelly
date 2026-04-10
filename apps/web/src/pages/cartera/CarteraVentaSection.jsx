import { BookOpen, CircleDollarSign, Package, Plus } from 'lucide-react';

const CarteraVentaSection = ({
  clientesCatalogo,
  formatMoney,
  ventaModo,
  setVentaModo,
  ventaClienteId,
  setVentaClienteId,
  ventaFecha,
  setVentaFecha,
  abonoInicial,
  setAbonoInicial,
  pagoRecibido,
  setPagoRecibido,
  metodoPago,
  setMetodoPago,
  referenciaVenta,
  setReferenciaVenta,
  ventaItems,
  setVentaItems,
  productosById,
  todosLosProductos,
  totalVentaEstimado,
  totalAPagar,
  cambioContado,
  savingVenta,
  handleOpenVentasHistorial,
  startNewCliente,
  startNewProducto,
  handleChangeVentaItem,
  handleRemoveVentaItem,
  handleSubmitVentaCartera,
}) => {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Registro de venta de cartera</h2>
            <p className="text-sm text-gray-600">Selecciona cliente, fecha, método de pago y los artículos de la venta.</p>
            <button
              type="button"
              onClick={handleOpenVentasHistorial}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              <BookOpen className="h-4 w-4" />
              Ver historial de ventas
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startNewCliente}
              className="inline-flex items-center gap-2 rounded-lg border border-rosewood px-3 py-2 text-xs font-semibold text-rosewood transition hover:bg-blush-100"
            >
              <Plus className="h-4 w-4" />
              Registrar cliente
            </button>
            <button
              type="button"
              onClick={startNewProducto}
              className="inline-flex items-center gap-2 rounded-lg border border-rosewood px-3 py-2 text-xs font-semibold text-rosewood transition hover:bg-blush-100"
            >
              <Package className="h-4 w-4" />
              Registrar producto
            </button>
            <CircleDollarSign className="h-6 w-6 text-rosewood" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setVentaModo('fiado')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${ventaModo === 'fiado' ? 'bg-rosewood text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-100'}`}
          >
            Fiado
          </button>
          <button
            type="button"
            onClick={() => setVentaModo('contado')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${ventaModo === 'contado' ? 'bg-rosewood text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-100'}`}
          >
            Contado
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Cliente existente</label>
            <select
              value={ventaClienteId}
              onChange={(event) => setVentaClienteId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
            >
              <option value="">Selecciona cliente existente</option>
              {clientesCatalogo.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre} - {formatMoney(cliente.deuda_total || 0)} de deuda
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Fecha automática</label>
              <input
                type="datetime-local"
                value={ventaFecha}
                onChange={(event) => setVentaFecha(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
              />
            </div>
            <div>
              {ventaModo === 'fiado' ? (
                <>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">Abono inicial opcional</label>
                  <input
                    type="number"
                    min="0"
                    value={abonoInicial}
                    onChange={(event) => setAbonoInicial(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                    placeholder="Monto abonado, si aplica"
                  />
                  <p className="mt-1 text-xs text-gray-500">Si no pagó nada hoy, deja este campo en blanco.</p>
                </>
              ) : (
                <>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">Valor recibido</label>
                  <input
                    type="number"
                    min="0"
                    value={pagoRecibido}
                    onChange={(event) => setPagoRecibido(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                    placeholder="Efectivo entregado por el cliente"
                  />
                  <p className="mt-1 text-xs text-gray-500">En contado se toma como pagado el total completo de la venta.</p>
                </>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Método de pago</label>
              <select
                value={metodoPago}
                onChange={(event) => setMetodoPago(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Referencia opcional</label>
            <input
              type="text"
              value={referenciaVenta}
              onChange={(event) => setReferenciaVenta(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Referencia, nota o pedido interno"
            />
          </div>
        </div>

        <p className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
          La venta se registra desde este formulario. Agrega artículos y ajusta la cantidad antes de guardar.
        </p>
      </div>

      <div className="space-y-3 border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Artículos</p>
            <h3 className="mt-1 text-lg font-bold text-gray-900">Líneas de la venta</h3>
          </div>
          <button
            type="button"
            onClick={() => setVentaItems((current) => [...current, { producto_id: '', cantidad: 1 }])}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
          >
            + Agregar línea
          </button>
        </div>

        <div className="space-y-3">
          {ventaItems.map((item, index) => {
            const producto = productosById.get(Number(item.producto_id));
            const subtotal = producto ? Number(producto.precio_venta || 0) * Number(item.cantidad || 0) : 0;

            return (
              <div key={`item-${index}`} className="rounded-2xl border border-gray-200 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_44px]">
                  <select
                    value={item.producto_id}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setVentaItems((current) => current.map((currentItem, currentIndex) => (
                        currentIndex === index ? { ...currentItem, producto_id: nextValue } : currentItem
                      )));
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  >
                    <option value="">Selecciona artículo</option>
                    {todosLosProductos.map((productoOption) => (
                      <option key={productoOption.id} value={productoOption.id}>
                        {productoOption.nombre} ({productoOption.catalogo})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={(event) => handleChangeVentaItem(index, 'cantidad', event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                    placeholder="Cant."
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveVentaItem(index)}
                    className="rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-100"
                    title="Eliminar línea"
                  >
                    -
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {producto ? `${producto.nombre} · ${producto.catalogo}` : 'Selecciona un artículo para ver el subtotal'}
                  </span>
                  <span className="font-semibold text-gray-900">{formatMoney(subtotal)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-700">Total de la venta</p>
            <p className="text-2xl font-bold text-gray-900">{formatMoney(totalVentaEstimado)}</p>
          </div>

          {ventaModo === 'fiado' ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">Saldo que queda fiado: {formatMoney(totalAPagar)}</p>
              <p className="mt-1 text-xs text-gray-500">Se descuenta cualquier abono inicial que hayas registrado.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">Pago recibido: {formatMoney(pagoRecibido || 0)}</p>
              <p className="font-semibold text-gray-900">Cambio a devolver: {formatMoney(cambioContado)}</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmitVentaCartera}
          disabled={savingVenta}
          className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {savingVenta ? 'Registrando...' : 'Registrar venta en cartera'}
        </button>
      </div>
    </section>
  );
};

export default CarteraVentaSection;
