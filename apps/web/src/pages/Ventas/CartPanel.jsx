import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';

const CartPanel = ({
  cart,
  productosById,
  totalEstimado,
  onChangeQty,
  onRemoveItem,
  formatMoney,
  esFiado,
  onSetEsFiado,
  montoPago,
  onSetMontoPago,
  metodoPago,
  onSetMetodoPago,
  cambioContado,
  clientesTiendaFiado,
  clienteTiendaId,
  onSetClienteTiendaId,
  onCrearCliente,
  onConfirmar,
  submittingVenta,
}) => {
  const selectedCliente = esFiado && clienteTiendaId
    ? clientesTiendaFiado.find((c) => String(c.id) === String(clienteTiendaId))
    : null;
  const deudaActual = Number(selectedCliente?.deuda_total || 0);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <ShoppingCart className="h-5 w-5 text-rosewood" />
        <h2 className="text-lg font-bold text-gray-900">Ticket</h2>
        <span className="ml-auto rounded-full bg-rosewood px-2.5 py-0.5 text-xs font-semibold text-white">
          {cart.reduce((a, i) => a + Number(i.cantidad || 0), 0)} items
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-gray-400">
            <ShoppingCart className="mb-2 h-10 w-10" />
            <p>Selecciona productos</p>
          </div>
        )}

        {cart.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {cart.map((item, idx) => {
              const producto = productosById.get(Number(item.producto_id));
              const cantidad = Number(item.cantidad || 0);
              const precio = Number(producto?.precio_venta || 0);
              return (
                <li key={item.producto_id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{producto?.nombre || `#${item.producto_id}`}</p>
                    <p className="text-xs text-gray-500">{formatMoney(precio)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onChangeQty(idx, -1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100" aria-label="Disminuir">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-rosewood px-2 text-xs font-bold text-white">{cantidad}</span>
                    <button type="button" onClick={() => onChangeQty(idx, 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100" aria-label="Aumentar">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="min-w-[80px] text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatMoney(cantidad * precio)}</p>
                  </div>
                  <button type="button" onClick={() => onRemoveItem(item.producto_id)} className="flex h-7 w-7 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600" aria-label="Eliminar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Total</span>
          <span className="text-xl font-black text-rosewood">{formatMoney(totalEstimado)}</span>
        </div>
      </div>

      <div className="border-t border-gray-200">
        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <button type="button" onClick={() => onSetEsFiado(false)} className={`rounded-xl border p-3 text-left transition ${!esFiado ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}>
            <p className="text-xs font-bold uppercase tracking-wide">Contado</p>
            <p className={`mt-0.5 text-[10px] ${!esFiado ? 'text-white/80' : 'text-gray-500'}`}>Pago inmediato</p>
          </button>
          <button type="button" onClick={() => onSetEsFiado(true)} className={`rounded-xl border p-3 text-left transition ${esFiado ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}>
            <p className="text-xs font-bold uppercase tracking-wide">Fiado</p>
            <p className={`mt-0.5 text-[10px] ${esFiado ? 'text-white/80' : 'text-gray-500'}`}>Paga después</p>
          </button>
        </div>

        <form className="space-y-3 px-4 pb-4" onSubmit={onConfirmar}>
          {!esFiado && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <input type="text" inputMode="numeric" value={Number(montoPago) === 0 ? '' : String(montoPago)} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0; onSetMontoPago(v); }} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="¿Con cuánto paga?" />
              <div className="grid grid-cols-3 gap-1.5">
                {['efectivo', 'nequi', 'tarjeta'].map((opt) => (
                  <button key={opt} type="button" onClick={() => onSetMetodoPago(opt)} className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${metodoPago === opt ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                    {opt === 'efectivo' ? '💵 Efectivo' : opt === 'nequi' ? '📱 Nequi' : '💳 Tarjeta'}
                  </button>
                ))}
              </div>
              <p className="text-xs font-semibold text-emerald-900">Cambio: {formatMoney(cambioContado)}</p>
            </div>
          )}

          {esFiado && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <select value={clienteTiendaId} onChange={(e) => onSetClienteTiendaId(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-rosewood focus:outline-none">
                <option value="">Selecciona cliente</option>
                {clientesTiendaFiado.map((cl) => <option key={cl.id} value={cl.id}>{cl.nombre}</option>)}
              </select>
              <button type="button" onClick={onCrearCliente} className="w-full rounded-lg border border-rosewood px-3 py-2 text-xs font-semibold text-rosewood transition hover:bg-blush-100">+ Crear cliente</button>
              {selectedCliente && (
                <div className="rounded-lg border border-amber-300 bg-white p-2 text-xs">
                  <p className="text-gray-600">Deuda actual: <span className="font-bold text-amber-700">{formatMoney(deudaActual)}</span></p>
                  <p className="mt-0.5 text-gray-500">Se acumularán {formatMoney(totalEstimado)} a su deuda.</p>
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={submittingVenta || cart.length === 0} className="w-full rounded-xl bg-rosewood px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
            {submittingVenta ? 'Confirmando...' : `Cobrar ${formatMoney(totalEstimado)}`}
          </button>
        </form>
      </div>
    </section>
  );
};

export default CartPanel;
