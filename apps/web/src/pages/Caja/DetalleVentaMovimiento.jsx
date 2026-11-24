import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { fetchVenta } from '../../api/ventasApi';
import PaymentBadge from '../../components/PaymentBadge';
import Skeleton from '../../components/Skeleton';
import { CONTACTO, SITE } from '../../config/site';
import { formatDateTime, formatMoney } from '../../utils/format';
import { printHtml } from '../Ventas/printReceipt';
import { buildReceiptHtml } from '../Ventas/receiptHtml';
import { receiptFromVenta } from '../Ventas/historyHelpers';

const Dato = ({ titulo, children }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
    <div className="text-sm font-semibold text-gray-900">{children}</div>
  </div>
);

const Productos = ({ detalles }) => (
  <table className="w-full text-left text-sm">
    <thead>
      <tr className="text-xs uppercase tracking-wide text-gray-500">
        <th className="py-1.5 pr-3 font-semibold">Producto</th>
        <th className="px-3 py-1.5 text-right font-semibold">Cant.</th>
        <th className="px-3 py-1.5 text-right font-semibold">Precio</th>
        <th className="py-1.5 pl-3 text-right font-semibold">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      {detalles.map((detalle) => (
        <tr key={`${detalle.producto_id}-${detalle.nombre_producto}`} className="border-t border-gray-200">
          <td className="py-1.5 pr-3 text-gray-800">{detalle.nombre_producto}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">
            {detalle.cantidad}
            {detalle.cantidad_devuelta > 0 && <span className="block text-[11px] font-semibold text-amber-700">{detalle.cantidad_devuelta} devuelto{detalle.cantidad_devuelta === 1 ? '' : 's'}</span>}
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(detalle.precio_unitario)}</td>
          <td className="py-1.5 pl-3 text-right font-semibold tabular-nums">{formatMoney(detalle.subtotal)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const Resumen = ({ venta }) => {
  const descuento = Number(venta.descuento_puntos || 0);
  const recibido = Number(venta.monto_recibido || 0);
  const cambio = !venta.es_fiado && recibido > Number(venta.total) ? recibido - Number(venta.total) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Dato titulo="Total">{formatMoney(venta.total)}</Dato>
      <Dato titulo="Cobro">
        {venta.metodo_pago ? <PaymentBadge method={venta.metodo_pago} compact /> : <span className="text-gray-400">Sin cobro</span>}
        {recibido > 0 && <span className="block text-xs font-normal text-gray-500">Recibido {formatMoney(recibido)}{cambio > 0 ? ` · cambio ${formatMoney(cambio)}` : ''}</span>}
      </Dato>
      <Dato titulo="Atendió">{venta.vendedor || '—'}</Dato>
      {venta.cliente_nombre && <Dato titulo="Cliente">{venta.cliente_nombre}</Dato>}
      {venta.es_fiado && <Dato titulo="Fiado: saldo de esta venta">{formatMoney(venta.saldo_pendiente)}</Dato>}
      {descuento > 0 && <Dato titulo="Descuento por puntos">−{formatMoney(descuento)} ({venta.puntos_canjeados} pts)</Dato>}
      {Number(venta.puntos_otorgados) > 0 && <Dato titulo="Puntos ganados">{venta.puntos_otorgados}</Dato>}
    </div>
  );
};

// Los productos de una venta del turno y lo que explica su cobro; se pide al abrir la fila.
const DetalleVentaMovimiento = ({ ventaId }) => {
  const [venta, setVenta] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchVenta(ventaId, { signal: controller.signal })
      .then((datos) => { setVenta(datos); setError(''); })
      .catch((err) => { if (err?.name !== 'AbortError') setError(err.message || 'No se pudo cargar el detalle de la venta'); });
    return () => controller.abort();
  }, [ventaId]);

  if (error) return <p role="alert" className="py-2 text-sm text-red-600">{error}</p>;
  if (!venta) return <Skeleton lines={2} />;

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
      <Productos detalles={venta.detalles ?? []} />
      <Resumen venta={venta} />
      {(venta.devoluciones ?? []).length > 0 && (
        <div className="space-y-1.5 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold uppercase tracking-wide">Devoluciones</p>
          {venta.devoluciones.map((devolucion) => (
            <p key={devolucion.id}>
              {formatDateTime(devolucion.fecha)} · {devolucion.lineas.map((linea) => `${linea.cantidad}× ${linea.nombre_producto}`).join(', ')} ·{' '}
              <strong>{formatMoney(devolucion.total_devuelto)}</strong>
              {devolucion.monto_reembolsado > 0 && ` (${formatMoney(devolucion.monto_reembolsado)} en dinero${devolucion.metodo_pago ? `, ${devolucion.metodo_pago}` : ''})`}
              {devolucion.deuda_reducida > 0 && ` (${formatMoney(devolucion.deuda_reducida)} menos de deuda)`}
              {' '}· «{devolucion.motivo}» · lo hizo {devolucion.registrado_por}, autorizó {devolucion.autorizado_por}
            </p>
          ))}
        </div>
      )}
      {venta.anulada && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Venta anulada. Motivo: {venta.motivo_anulacion} · Anuló {venta.anulada_por}, autorizó {venta.autorizada_por}
        </p>
      )}
      {!venta.anulada && (
        <button
          type="button"
          onClick={() => printHtml(buildReceiptHtml(receiptFromVenta(venta), { formatMoney, site: SITE, contacto: CONTACTO }))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Reimprimir comprobante
        </button>
      )}
    </div>
  );
};

export default DetalleVentaMovimiento;
