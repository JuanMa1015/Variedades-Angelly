import { CheckCircle, Printer, ShoppingBag } from 'lucide-react';

const SaleReceiptPanel = ({ receipt, formatMoney, onPrint, onNewSale }) => {
  const metodoLabel = receipt.metodoPago === 'efectivo' ? 'Efectivo' : receipt.metodoPago === 'nequi' ? 'Nequi' : 'Tarjeta';

  return (
    <section className="flex h-full flex-col rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="flex flex-col items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-6">
        <CheckCircle className="h-10 w-10 text-emerald-600" />
        <h2 className="text-lg font-bold text-emerald-800">Venta completada</h2>
        <p className="text-xs text-emerald-600">{receipt.timestamp}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ul className="divide-y divide-gray-100">
          {receipt.items.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.nombre}</p>
                <p className="text-xs text-gray-500">{item.cantidad} x {formatMoney(item.precio)}</p>
              </div>
              <span className="ml-3 text-sm font-semibold text-gray-900">{formatMoney(item.subtotal)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-gray-200 px-4 py-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Método de pago</span>
            <span className="font-medium text-gray-900">{metodoLabel}</span>
          </div>
          {!receipt.esFiado && (
            <>
              <div className="flex justify-between text-gray-600">
                <span>Pago</span>
                <span className="font-medium text-gray-900">{formatMoney(receipt.pago)}</span>
              </div>
              {receipt.cambio > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Cambio</span>
                  <span className="font-medium text-emerald-700">{formatMoney(receipt.cambio)}</span>
                </div>
              )}
            </>
          )}
          {receipt.esFiado && receipt.cliente && (
            <div className="flex justify-between text-gray-600">
              <span>Cliente</span>
              <span className="font-medium text-amber-700">{receipt.cliente}</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
          <span className="text-base font-bold text-gray-900">Total</span>
          <span className="text-2xl font-black text-rosewood">{formatMoney(receipt.total)}</span>
        </div>
      </div>

      <div className="border-t border-gray-200 p-4">
        <button onClick={onPrint} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rosewood px-4 py-3 text-sm font-bold text-white transition hover:opacity-90">
          <Printer className="h-4 w-4" /> Imprimir recibo
        </button>
        <button onClick={onNewSale} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
          <ShoppingBag className="h-4 w-4" /> Nueva venta
        </button>
      </div>
    </section>
  );
};

export default SaleReceiptPanel;
