import { Minus, Plus, Trash2 } from 'lucide-react';

const TicketReviewView = ({
  cart,
  productosById,
  totalEstimado,
  onChangeQty,
  onGoToProducts,
  onGoToCheckout,
  formatMoney,
}) => {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900">Revisión del ticket</h2>
          <p className="text-sm text-gray-500">Ajusta cantidades antes de cobrar.</p>
        </div>
        <button
          type="button"
          onClick={onGoToProducts}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          + Productos
        </button>
      </div>

      {cart.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          El ticket está vacío. Agrega productos para continuar.
        </div>
      )}

      {cart.length > 0 && (
        <div className="space-y-3">
          {cart.map((item, index) => {
            const producto = productosById.get(Number(item.producto_id));
            const precio = Number(producto?.precio_venta || 0);
            const cantidad = Number(item.cantidad || 0);
            const subtotal = precio * cantidad;

            return (
              <article key={`${item.producto_id}-${index}`} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{producto?.nombre || 'Producto'}</p>
                    <p className="text-xs text-gray-500">Unitario: {formatMoney(precio)}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">Subtotal: {formatMoney(subtotal)}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onChangeQty(index, -cantidad)}
                    className="rounded-lg border border-gray-300 p-2 text-gray-600 transition hover:bg-gray-50"
                    aria-label="Eliminar item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeQty(index, -1)}
                    className="rounded-lg border border-gray-300 p-2 text-gray-700 transition hover:bg-gray-50"
                    aria-label="Disminuir cantidad"
                  >
                    <Minus className="h-4 w-4" />
                  </button>

                  <div className="min-w-[54px] rounded-lg border border-gray-300 px-3 py-1.5 text-center text-sm font-semibold text-gray-900">
                    {cantidad}
                  </div>

                  <button
                    type="button"
                    onClick={() => onChangeQty(index, 1)}
                    className="rounded-lg border border-gray-300 p-2 text-gray-700 transition hover:bg-gray-50"
                    aria-label="Aumentar cantidad"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Subtotal</span>
          <span className="text-sm font-semibold text-gray-900">{formatMoney(totalEstimado)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">Total</span>
          <span className="text-2xl font-black text-rosewood">{formatMoney(totalEstimado)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onGoToCheckout}
        disabled={cart.length === 0}
        className="mt-5 w-full rounded-xl bg-rosewood px-4 py-3 text-base font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        Cobrar →
      </button>
    </section>
  );
};

export default TicketReviewView;
