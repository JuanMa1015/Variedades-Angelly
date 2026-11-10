import { CONTACTO, SITE } from '../../config/site';

const METHOD_LABELS = { efectivo: 'Efectivo', nequi: 'Nequi', tarjeta: 'Tarjeta' };

const PRINT_STYLES = `
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body * { visibility: hidden !important; }
    #print-receipt, #print-receipt * { visibility: visible !important; }
    #print-receipt { position: fixed !important; left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; display: flex !important; align-items: center !important; justify-content: center !important; background: white !important; z-index: 99999 !important; }
    #print-receipt > div { width: 80mm !important; max-width: 80mm !important; border: none !important; box-shadow: none !important; padding: 8px 4px !important; }
    .no-print { display: none !important; }
  }
`;

const Row = ({ label, value, bold = false }) => (
  <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const Totals = ({ receipt, formatMoney }) => (
  <div className="space-y-0.5 text-[10px]">
    <Row label="TOTAL:" value={formatMoney(receipt.total)} bold />
    {receipt.esFiado && (
      <>
        {receipt.cliente && <Row label="Cliente:" value={receipt.cliente} />}
        <Row label="Abono:" value={formatMoney(receipt.abono || 0)} />
        <Row label="Queda fiado:" value={formatMoney(Math.max(0, receipt.total - (receipt.abono || 0)))} bold />
      </>
    )}
    {!receipt.esFiado && (
      <>
        <Row label="Pago:" value={formatMoney(receipt.pago)} />
        {receipt.cambio > 0 && <Row label="Cambio:" value={formatMoney(receipt.cambio)} />}
      </>
    )}
  </div>
);

// Comprobante para impresora termica de 80 mm. Solo se ve al imprimir.
const PrintableReceipt = ({ receipt, formatMoney }) => (
  <>
    <style>{PRINT_STYLES}</style>
    <div id="print-receipt" className="hidden print:block">
      <div className="mx-auto bg-white p-2 text-xs text-gray-800">
        <div className="mb-3 text-center">
          <p className="text-base font-bold uppercase tracking-wide">{SITE.name}</p>
          {CONTACTO.nit && <p className="text-[10px] text-gray-600">NIT: {CONTACTO.nit}</p>}
          {CONTACTO.direccion && <p className="text-[10px] text-gray-600">{CONTACTO.direccion}</p>}
          {CONTACTO.telefono && <p className="text-[10px] text-gray-600">Tel: {CONTACTO.telefono}</p>}
        </div>

        <div className="mb-2 border-t border-dashed border-gray-400" />
        <div className="mb-2 text-center">
          <p className="text-xs font-bold uppercase tracking-wide">Comprobante de venta</p>
          <p className="text-[10px] text-gray-500">Documento no válido como factura</p>
          <p className="text-[10px] text-gray-600">{receipt?.timestamp || ''}</p>
        </div>
        <div className="mb-2 border-t border-dashed border-gray-400" />

        {receipt && (
          <p className="mb-2 text-[10px] text-gray-600">
            Método de pago: {METHOD_LABELS[receipt.metodoPago] ?? 'Transferencia'}
          </p>
        )}

        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-dashed border-gray-400 font-semibold">
              <th className="py-1 text-left">Producto</th>
              <th className="py-1 text-right">Cant</th>
              <th className="py-1 text-right">Precio</th>
              <th className="py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(receipt?.items || []).map((item, index) => (
              <tr key={`${item.nombre}-${index}`}>
                <td className="py-1 pr-1">{item.nombre}</td>
                <td className="py-1 text-right">{item.cantidad}</td>
                <td className="py-1 text-right">{formatMoney(item.precio)}</td>
                <td className="py-1 text-right font-medium">{formatMoney(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-2 border-t border-dashed border-gray-400" />
        {receipt && <Totals receipt={receipt} formatMoney={formatMoney} />}
        <div className="mt-4 border-t border-dashed border-gray-400" />
        <p className="mt-2 text-center text-[10px] text-gray-500">¡Gracias por su preferencia!</p>
      </div>
    </div>
  </>
);

export default PrintableReceipt;
