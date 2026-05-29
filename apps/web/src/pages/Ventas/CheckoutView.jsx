import { Receipt } from 'lucide-react';

const CheckoutView = ({
  totalEstimado,
  cambioContado,
  esFiado,
  onSetEsFiado,
  montoPago,
  onSetMontoPago,
  metodoPago,
  onSetMetodoPago,
  clientesTiendaFiado,
  clienteTiendaId,
  onSetClienteTiendaId,
  onCrearCliente,
  onConfirmar,
  onGoToTicket,
  formatMoney,
  submittingVenta,
  cartCount,
}) => {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900">Cobro</h2>
          <p className="text-sm text-gray-500">Define el tipo de venta y confirma.</p>
        </div>
        <button
          type="button"
          onClick={onGoToTicket}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          ← Volver al ticket
        </button>
      </div>

      <div className="mb-5 rounded-2xl border border-rosewood/20 bg-blush-100 p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rosewood">Total a cobrar</p>
        <p className="mt-1 text-4xl font-black text-rosewood">{formatMoney(totalEstimado)}</p>
        <p className="mt-1 text-xs text-gray-600">{cartCount} items en el ticket</p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSetEsFiado(false)}
          className={`rounded-2xl border p-4 text-left transition ${
            !esFiado
              ? 'border-rosewood bg-rosewood text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
          }`}
        >
          <p className="text-sm font-bold uppercase tracking-wide">Contado</p>
          <p className={`mt-1 text-xs ${!esFiado ? 'text-white/90' : 'text-gray-500'}`}>
            Pago inmediato en caja.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSetEsFiado(true)}
          className={`rounded-2xl border p-4 text-left transition ${
            esFiado
              ? 'border-amber-500 bg-amber-500 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
          }`}
        >
          <p className="text-sm font-bold uppercase tracking-wide">Fiado</p>
          <p className={`mt-1 text-xs ${esFiado ? 'text-white/90' : 'text-gray-500'}`}>
            Cliente paga después.
          </p>
        </button>
      </div>



      <button
        type="button"
        onClick={() => window.print()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        <Receipt className="h-4 w-4" />
        Imprimir factura
      </button>

      <form className="space-y-4" onSubmit={onConfirmar}>
        {!esFiado && (
          <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-gray-700">¿Con cuánto paga?</span>
              <input
                type="text"
                inputMode="numeric"
                value={Number(montoPago) === 0 ? '' : String(montoPago)}
                onChange={(event) => {
                  const nextValue = parseInt(event.target.value.replace(/\D/g, ''), 10) || 0;
                  onSetMontoPago(nextValue);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-rosewood focus:outline-none"
                placeholder="0"
              />
            </label>

            <div className="space-y-1 text-sm">
              <span className="font-medium text-gray-700">Método</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'efectivo', label: '💵 Efectivo' },
                  { value: 'nequi', label: '📱 Nequi' },
                  { value: 'tarjeta', label: '💳 Tarjeta' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSetMetodoPago(option.value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                      metodoPago === option.value
                        ? 'border-rosewood bg-rosewood text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-sm font-semibold text-emerald-900">
              Cambio: {formatMoney(cambioContado)}
            </p>
          </div>
        )}

        {esFiado && (
          <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-gray-700">Cliente del módulo de ventas</span>
              <select
                value={clienteTiendaId}
                onChange={(event) => onSetClienteTiendaId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-rosewood focus:outline-none"
              >
                <option value="">Selecciona cliente</option>
                {clientesTiendaFiado.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={onCrearCliente}
              className="rounded-xl border border-rosewood px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-100"
            >
              + Crear cliente de ventas
            </button>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-gray-700">Nota / observación (opcional)</span>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Ej: cliente recoge el viernes"
                disabled
              />
            </label>

          </div>
        )}

        <button
          type="submit"
          disabled={submittingVenta}
          className="w-full rounded-xl bg-rosewood px-4 py-3 text-base font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submittingVenta ? 'Confirmando venta...' : 'Confirmar venta'}
        </button>
      </form>
    </section>
  );
};

export default CheckoutView;
