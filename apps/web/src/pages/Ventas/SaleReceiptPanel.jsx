import { useEffect, useRef } from 'react';
import { CheckCircle, Printer, ShoppingBag } from 'lucide-react';

const METHOD_LABELS = { efectivo: 'Efectivo', nequi: 'Nequi', tarjeta: 'Tarjeta' };

const SummaryRow = ({ label, value, valueClass = 'text-gray-900' }) => (
  <div className="flex justify-between text-sm text-gray-600">
    <span>{label}</span>
    <span className={`font-semibold ${valueClass}`}>{value}</span>
  </div>
);

const SaleReceiptPanel = ({ receipt, formatMoney, onPrint, onNewSale }) => {
  const newSaleRef = useRef(null);

  // El cajero termina de cobrar y puede abrir la siguiente venta con solo pulsar Enter.
  useEffect(() => {
    newSaleRef.current?.focus();
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm" aria-label="Venta completada">
      <div className="flex flex-col items-center gap-1 border-b border-emerald-200 bg-emerald-50 px-4 py-5">
        <CheckCircle className="h-10 w-10 text-emerald-600" aria-hidden="true" />
        <h2 className="text-lg font-bold text-emerald-800">Venta completada</h2>
        <p className="text-xs text-emerald-700">{receipt.timestamp}</p>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
        {receipt.items.map((item, index) => (
          <li key={`${item.nombre}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{item.nombre}</p>
              <p className="text-xs text-gray-500">{item.cantidad} x {formatMoney(item.precio)}</p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-gray-900">{formatMoney(item.subtotal)}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t border-gray-200 bg-gray-50/70 px-4 py-3">
        <SummaryRow label="Método de pago" value={METHOD_LABELS[receipt.metodoPago] ?? 'Transferencia'} />
        {!receipt.esFiado && <SummaryRow label="Recibido" value={formatMoney(receipt.pago)} />}
        {!receipt.esFiado && receipt.cambio > 0 && (
          <SummaryRow label="Cambio" value={formatMoney(receipt.cambio)} valueClass="text-emerald-700" />
        )}
        {receipt.esFiado && receipt.cliente && (
          <SummaryRow label="Cliente" value={receipt.cliente} valueClass="text-amber-700" />
        )}
        {receipt.esFiado && (
          <SummaryRow
            label="Queda fiado"
            value={formatMoney(Math.max(0, receipt.total - (receipt.abono || 0)))}
            valueClass="text-amber-700"
          />
        )}
        {receipt.puntos > 0 && <SummaryRow label="Puntos ganados" value={`+${receipt.puntos}`} valueClass="text-violet-700" />}
        <div className="flex items-center justify-between border-t border-gray-200 pt-2">
          <span className="text-base font-bold text-gray-900">Total</span>
          <span className="text-2xl font-black tabular-nums text-rosewood">{formatMoney(receipt.total)}</span>
        </div>
      </div>

      <div className="grid gap-2 border-t border-gray-200 p-4">
        <button
          ref={newSaleRef}
          type="button"
          onClick={onNewSale}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-rosewood px-4 text-sm font-bold text-white shadow-soft transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rosewood focus-visible:ring-offset-2"
        >
          <ShoppingBag className="h-4 w-4" /> Nueva venta
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" /> Imprimir comprobante
        </button>
      </div>
    </section>
  );
};

export default SaleReceiptPanel;
