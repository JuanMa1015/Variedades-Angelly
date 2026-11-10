import MethodSelector from './MethodSelector';
import { suggestedPayments } from './posHelpers';

const ChangeSummary = ({ pago, total, cambio, formatMoney }) => {
  if (!(pago > 0)) return null;
  if (pago < total) {
    return <p className="text-sm font-bold text-red-700">Faltan {formatMoney(total - pago)}</p>;
  }
  return <p className="text-sm font-bold text-emerald-700">Cambio: {formatMoney(cambio)}</p>;
};

const CashInput = ({ montoPago, total, onSetMontoPago, formatMoney, cambio }) => {
  const pago = Number(montoPago || 0);
  return (
    <div className="space-y-2">
      <div className="relative">
        <label htmlFor="pos-recibido" className="sr-only">Monto recibido</label>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
        <input
          id="pos-recibido"
          type="text"
          inputMode="numeric"
          value={pago === 0 ? '' : String(pago)}
          onChange={(event) => onSetMontoPago(parseInt(event.target.value.replace(/\D/g, ''), 10) || 0)}
          placeholder="Recibido (vacío = pago exacto)"
          className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 text-base font-semibold tabular-nums focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20"
        />
      </div>
      {total > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Montos rápidos de pago">
          <button
            type="button"
            onClick={() => onSetMontoPago(total)}
            className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
          >
            Exacto
          </button>
          {suggestedPayments(total).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onSetMontoPago(value)}
              className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:border-rosewood/50"
            >
              {formatMoney(value)}
            </button>
          ))}
        </div>
      )}
      <ChangeSummary pago={pago} total={total} cambio={cambio} formatMoney={formatMoney} />
    </div>
  );
};

const PaymentSection = ({ metodoPago, onSetMetodoPago, montoPago, onSetMontoPago, totalEstimado, cambioContado, formatMoney }) => (
  <div className="space-y-2.5">
    <MethodSelector value={metodoPago} onChange={onSetMetodoPago} />
    {metodoPago === 'efectivo' ? (
      <CashInput
        montoPago={montoPago}
        total={totalEstimado}
        onSetMontoPago={onSetMontoPago}
        formatMoney={formatMoney}
        cambio={cambioContado}
      />
    ) : (
      <p className="rounded-lg bg-white px-3 py-2 text-xs text-gray-600">
        Se cobra el total exacto por {metodoPago === 'nequi' ? 'Nequi' : 'tarjeta'}. Confirma que el pago llegó antes de cobrar.
      </p>
    )}
  </div>
);

export default PaymentSection;
