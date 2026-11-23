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
    descuentoManual: Number(venta.descuento_manual || 0),
    puntosCanjeados: Number(venta.puntos_canjeados || 0),
    esFiado,
    abono,
    puntos: Number(venta.puntos_otorgados || 0),
    cliente: venta.cliente_nombre || null,
    timestamp: parseApiDate(venta.fecha).toLocaleString('es-CO'),
  };
};

const redondear = (valor) => Math.round(valor * 100) / 100;

// Productos de la venta con lo que todavia se puede devolver (las lineas repetidas de un producto se suman).
export const productosPorDevolver = (venta) => {
  const porProducto = new Map();
  (venta.detalles ?? []).forEach((detalle) => {
    const restante = Number(detalle.cantidad || 0) - Number(detalle.cantidad_devuelta || 0);
    const actual = porProducto.get(detalle.producto_id) ?? { producto_id: detalle.producto_id, nombre: detalle.nombre_producto, precio: Number(detalle.precio_unitario || 0), restante: 0 };
    actual.restante += restante;
    porProducto.set(detalle.producto_id, actual);
  });
  return [...porProducto.values()].filter((producto) => producto.restante > 0);
};

export const unidadesPorDevolver = (venta) => productosPorDevolver(venta).reduce((acc, producto) => acc + producto.restante, 0);

// Una venta de cartera se gestiona desde el modulo de cartera; una anulada ya no tiene nada que devolver.
export const sePuedeDevolver = (venta) => !venta.anulada && !venta.cliente_id && unidadesPorDevolver(venta) > 0;

// Cuanto se devolveria: el precio de cada producto con los descuentos de la venta repartidos (igual que el servidor).
export const valorDeDevolucion = (venta, cantidades) => {
  const detalles = venta.detalles ?? [];
  const sumaLineas = detalles.reduce((acc, detalle) => acc + Number(detalle.subtotal || 0), 0);
  const factor = sumaLineas > 0 ? Math.min(1, Number(venta.total || 0) / sumaLineas) : 1;
  const productos = productosPorDevolver(venta);
  const seleccion = productos.filter((producto) => (cantidades[producto.producto_id] ?? 0) > 0);
  if (seleccion.length === 0) return 0;
  const todo = productos.every((producto) => (cantidades[producto.producto_id] ?? 0) >= producto.restante);
  // Al devolver todo lo que queda, se devuelve exactamente lo que falta de la venta (sin centavos de redondeo).
  if (todo) return redondear(Number(venta.total || 0) - Number(venta.total_devuelto || 0));
  return redondear(seleccion.reduce((acc, producto) => acc + (cantidades[producto.producto_id] * producto.precio * factor), 0));
};

// Anular o corregir una venta con devoluciones descuadraria la caja: se bloquea.
export const sePuedeAnular = (venta) => !venta.anulada && !venta.cliente_id && !(Number(venta.total_devuelto) > 0);
