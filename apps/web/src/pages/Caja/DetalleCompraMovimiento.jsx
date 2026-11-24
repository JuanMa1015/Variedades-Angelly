import { useEffect, useState } from 'react';
import { fetchFactura } from '../../api/facturasApi';
import PaymentBadge from '../../components/PaymentBadge';
import Skeleton from '../../components/Skeleton';
import { formatMoney } from '../../utils/format';

const Dato = ({ titulo, children }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
    <div className="text-sm font-semibold text-gray-900">{children}</div>
  </div>
);

// Los productos de una factura de compra pagada desde este turno; se pide al abrir la fila.
const DetalleCompraMovimiento = ({ facturaId }) => {
  const [factura, setFactura] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchFactura(facturaId, { signal: controller.signal })
      .then((datos) => { setFactura(datos); setError(''); })
      .catch((err) => { if (err?.name !== 'AbortError') setError(err.message || 'No se pudo cargar el detalle de la factura'); });
    return () => controller.abort();
  }, [facturaId]);

  if (error) return <p role="alert" className="py-2 text-sm text-red-600">{error}</p>;
  if (!factura) return <Skeleton lines={2} />;

  const encomienda = Number(factura.encomienda || 0);
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500">
            <th className="py-1.5 pr-3 font-semibold">Producto</th>
            <th className="px-3 py-1.5 text-right font-semibold">Cant.</th>
            <th className="px-3 py-1.5 text-right font-semibold">Precio</th>
            <th className="py-1.5 pl-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {(factura.items ?? []).map((item) => (
            <tr key={`${item.producto_id}-${item.nombre_producto}`} className="border-t border-gray-200">
              <td className="py-1.5 pr-3 text-gray-800">{item.nombre_producto}{item.aplica_iva ? <span className="ml-1 text-[11px] text-gray-500">(con IVA)</span> : null}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{item.cantidad}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(item.precio_unitario)}</td>
              <td className="py-1.5 pl-3 text-right font-semibold tabular-nums">{formatMoney(item.precio_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato titulo="Proveedor">{factura.proveedor_nombre}</Dato>
        <Dato titulo="Pago">{factura.medio_pago ? <PaymentBadge method={factura.medio_pago} compact /> : '—'}</Dato>
        <Dato titulo="Subtotal e IVA">{formatMoney(Number(factura.subtotal) + Number(factura.total_iva || 0))}</Dato>
        {encomienda > 0 && <Dato titulo={`Encomienda (${factura.encomienda_suma ? 'se suma' : 'se restó'})`}>{factura.encomienda_suma ? '+' : '−'}{formatMoney(encomienda)}</Dato>}
        <Dato titulo="Total">{formatMoney(factura.total_factura)}</Dato>
        {factura.numero_factura && <Dato titulo="No. de factura">{factura.numero_factura}</Dato>}
        <Dato titulo="Registró">{factura.creado_por}</Dato>
      </div>
      {factura.anulada && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Factura anulada. Motivo: {factura.motivo_anulacion} · Anuló {factura.anulada_por}, autorizó {factura.autorizada_por}
        </p>
      )}
    </div>
  );
};

export default DetalleCompraMovimiento;
