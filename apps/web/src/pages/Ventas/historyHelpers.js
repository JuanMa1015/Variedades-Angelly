import { parseApiDate } from '../../utils/format';

// Convierte una venta del servidor en los datos que imprime el comprobante (misma forma que el recibo del POS).
export const receiptFromVenta = (venta) => {
  const total = Number(venta.total || 0);
  const esFiado = Boolean(venta.es_fiado);
  // Si la venta guardo el monto recibido se reimprime con su cambio real.
  const pago = Number(venta.monto_recibido) > 0 ? Number(venta.monto_recibido) : total;
  const abono = esFiado ? Math.max(0, total - Number(venta.saldo_pendiente || 0)) : 0;
  return {
    items: (venta.detalles ?? []).map((detalle) => ({
      nombre: detalle.nombre_producto,
      cantidad: detalle.cantidad,
      precio: Number(detalle.precio_unitario || 0),
      subtotal: Number(detalle.subtotal || 0),
    })),
    total,
    metodoPago: venta.metodo_pago,
    pago,
    cambio: esFiado ? 0 : Math.max(0, pago - total),
    descuento: Number(venta.descuento_puntos || 0),
    puntosCanjeados: Number(venta.puntos_canjeados || 0),
    esFiado,
    abono,
    puntos: Number(venta.puntos_otorgados || 0),
    cliente: venta.cliente_nombre || null,
    timestamp: parseApiDate(venta.fecha).toLocaleString('es-CO'),
  };
};

// Una venta de cartera se gestiona desde el modulo de cartera, no desde el punto de venta.
export const sePuedeAnular = (venta) => !venta.anulada && !venta.cliente_id;
