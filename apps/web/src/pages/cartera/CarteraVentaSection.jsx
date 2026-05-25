import { useState, useMemo, useRef } from 'react';
import { BookOpen, CircleDollarSign, Package, Plus, Search, Minus, Trash2, ShoppingCart, UserPlus } from 'lucide-react';

const getProductIcon = (nombre = '') => {
  const rules = [
    { match: /arroz|grano|lenteja/i, icon: '🍚' },
    { match: /pan|galleta|torta|ponque/i, icon: '🥖' },
    { match: /leche|queso|yogurt|mantequilla/i, icon: '🥛' },
    { match: /coca|gaseosa|jugo|agua|bebida/i, icon: '🥤' },
    { match: /huevo/i, icon: '🥚' },
    { match: /aseo|jabon|detergente|cloro/i, icon: '🧼' },
    { match: /shampoo|crema|higiene/i, icon: '🧴' },
  ];
  const rule = rules.find((entry) => entry.match.test(nombre));
  return rule?.icon || '🛒';
};

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
  productosById,
  todosLosProductos,
  totalVentaEstimado,
  totalAPagar,
  cambioContado,
  savingVenta,
  handleOpenVentasHistorial,
  startNewCliente,
  startNewProducto,
  handleAddProductoVenta,
  handleChangeVentaItem,
  handleRemoveVentaItem,
  handleSubmitVentaCartera,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef(null);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return todosLosProductos;
    const term = searchTerm.toLowerCase();
    return todosLosProductos.filter(
      (p) => p.nombre.toLowerCase().includes(term) || (p.codigo_barras && p.codigo_barras.toLowerCase().includes(term)),
    );
  }, [todosLosProductos, searchTerm]);

  const totalItems = useMemo(
    () => ventaItems.reduce((acc, item) => acc + (Number(item.producto_id) > 0 ? Number(item.cantidad || 0) : 0), 0),
    [ventaItems],
  );

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Registro de venta de cartera</h2>
            <p className="text-sm text-gray-600">Agrega productos y completa los datos para registrar la venta.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenVentasHistorial}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              <BookOpen className="h-4 w-4" />
              Historial
            </button>
            <button
              type="button"
              onClick={startNewCliente}
              className="inline-flex items-center gap-2 rounded-lg border border-rosewood px-3 py-2 text-xs font-semibold text-rosewood transition hover:bg-blush-100"
            >
              <UserPlus className="h-4 w-4" />
              Cliente
            </button>
            <button
              type="button"
              onClick={startNewProducto}
              className="inline-flex items-center gap-2 rounded-lg border border-rosewood px-3 py-2 text-xs font-semibold text-rosewood transition hover:bg-blush-100"
            >
              <Package className="h-4 w-4" />
              Producto
            </button>
            <CircleDollarSign className="h-6 w-6 text-rosewood" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[200px]">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Cliente</label>
                <select
                  value={ventaClienteId}
                  onChange={(event) => setVentaClienteId(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-rosewood focus:outline-none"
                >
                  <option value="">Selecciona cliente</option>
                  {clientesCatalogo.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombre} - {formatMoney(cliente.deuda_total || 0)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[160px]">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Fecha</label>
                <input
                  type="datetime-local"
                  value={ventaFecha}
                  onChange={(event) => setVentaFecha(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rosewood focus:outline-none"
                />
              </div>
              <div className="min-w-[120px]">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Modalidad</label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setVentaModo('fiado')}
                    className={`flex-1 px-3 py-2 text-xs font-semibold transition ${ventaModo === 'fiado' ? 'bg-rosewood text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    Fiado
                  </button>
                  <button
                    type="button"
                    onClick={() => setVentaModo('contado')}
                    className={`flex-1 px-3 py-2 text-xs font-semibold transition ${ventaModo === 'contado' ? 'bg-rosewood text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    Contado
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <label className="relative mb-3 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Buscar producto por nombre o código..."
              />
            </label>

            {filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
                No hay productos que coincidan.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {filteredProducts.map((producto) => {
                  const existingItem = ventaItems.find(
                    (item) => Number(item.producto_id) === Number(producto.id) && Number(item.cantidad) > 0,
                  );
                  const qtyInCart = existingItem ? Number(existingItem.cantidad) : 0;

                  return (
                    <div
                      key={producto.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleAddProductoVenta(producto)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleAddProductoVenta(producto);
                        }
                      }}
                      className={`relative rounded-xl border p-3 text-left shadow-sm transition active:scale-[0.98] ${
                        qtyInCart > 0
                          ? 'border-rosewood bg-blush-50'
                          : 'cursor-pointer border-gray-200 bg-white hover:border-rosewood hover:bg-blush-100'
                      }`}
                    >
                      {qtyInCart > 0 && (
                        <div className="absolute right-1 top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rosewood px-1.5 text-[10px] font-bold text-white shadow">
                          x{qtyInCart}
                        </div>
                      )}
                      <div className="text-xl mb-1">{getProductIcon(producto.nombre)}</div>
                      <p className="truncate text-xs font-bold text-gray-900">{producto.nombre}</p>
                      <p className="mt-0.5 text-xs font-semibold text-gray-600">{formatMoney(producto.precio_venta)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-rosewood" />
              <span className="text-sm font-bold text-gray-900">Venta</span>
              <span className="rounded-full bg-rosewood px-2 py-0.5 text-[11px] font-semibold text-white">{totalItems}</span>
            </div>
          </div>

          <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto">
            {ventaItems.filter((item) => Number(item.producto_id) > 0).length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                Toca un producto para agregarlo
              </p>
            ) : (
              ventaItems.map((item, index) => {
                if (Number(item.producto_id) <= 0) return null;
                const producto = productosById.get(Number(item.producto_id));
                if (!producto) return null;
                const subtotal = Number(producto.precio_venta || 0) * Number(item.cantidad || 0);

                return (
                  <div
                    key={`ticket-${index}`}
                    className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-semibold text-gray-900">{producto.nombre}</p>
                      <p className="text-[11px] text-gray-500">{formatMoney(producto.precio_venta)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (Number(item.cantidad) <= 1) {
                            handleRemoveVentaItem(index);
                          } else {
                            handleChangeVentaItem(index, 'cantidad', String(Number(item.cantidad) - 1));
                          }
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-rosewood px-1.5 text-xs font-bold text-white">
                        {item.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleChangeVentaItem(index, 'cantidad', String(Number(item.cantidad) + 1))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-right min-w-[72px]">
                      <p className="text-xs font-bold text-gray-900">{formatMoney(subtotal)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveVentaItem(index)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Método de pago</span>
              <select
                value={metodoPago}
                onChange={(event) => setMetodoPago(event.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-rosewood focus:outline-none"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Referencia</span>
              <input
                type="text"
                value={referenciaVenta}
                onChange={(event) => setReferenciaVenta(event.target.value)}
                className="w-40 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-rosewood focus:outline-none text-right"
                placeholder="Opcional"
              />
            </div>

            {ventaModo === 'fiado' ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Abono inicial</span>
                <input
                  type="number"
                  min="0"
                  value={abonoInicial}
                  onChange={(event) => setAbonoInicial(event.target.value)}
                  className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-rosewood focus:outline-none text-right"
                  placeholder="$0"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Recibido</span>
                <input
                  type="number"
                  min="0"
                  value={pagoRecibido}
                  onChange={(event) => setPagoRecibido(event.target.value)}
                  className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-rosewood focus:outline-none text-right"
                  placeholder="$0"
                />
              </div>
            )}
          </div>

          <div className="mt-4 space-y-1.5 rounded-xl bg-rosewood p-4 text-white">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-lg font-bold">{formatMoney(totalVentaEstimado)}</span>
            </div>
            {ventaModo === 'fiado' && (
              <div className="flex items-center justify-between text-sm text-gray-300">
                <span>Saldo fiado</span>
                <span className="font-semibold">{formatMoney(totalAPagar)}</span>
              </div>
            )}
            {ventaModo === 'contado' && (
              <div className="flex items-center justify-between text-sm text-gray-300">
                <span>Cambio</span>
                <span className="font-semibold">{formatMoney(cambioContado)}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmitVentaCartera}
            disabled={savingVenta || totalItems === 0}
            className="mt-4 w-full rounded-xl bg-rosewood px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {savingVenta ? 'Registrando...' : 'Registrar venta en cartera'}
          </button>
        </div>
      </div>
    </section>
  );
};

export default CarteraVentaSection;
