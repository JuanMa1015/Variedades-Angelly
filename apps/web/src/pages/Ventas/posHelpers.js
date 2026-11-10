export const CATALOGO_ENDPOINT = '/api/productos/paginados?catalogo=tienda';

// Une productos traidos por busqueda al catalogo cargado, sin duplicar ids.
export const mergeProductos = (current, incoming) => {
  const known = new Set(current.map((producto) => Number(producto.id)));
  const nuevos = incoming.filter((producto) => !known.has(Number(producto.id)));
  return nuevos.length > 0 ? [...current, ...nuevos] : current;
};

export const extractProductos = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data;
  return Array.isArray(payload) ? payload : [];
};

// Un codigo de barras es numerico y largo; lo demas se trata como busqueda por nombre.
export const looksLikeBarcode = (value) => /^\d{4,}$/.test(String(value).trim());

export const emptyTicket = () => ({
  items: [],
  esFiado: false,
  clienteTiendaId: '',
  clienteFidelizacionId: '',
  montoPago: '0',
  abonoInicialFiado: '0',
  metodoPago: 'efectivo',
});

// Agrupa lineas repetidas del carrito y descarta las invalidas.
export const groupCartItems = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const productoId = Number(item.producto_id);
    const cantidad = Number(item.cantidad);
    if (!Number.isInteger(productoId) || productoId <= 0) return;
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    grouped.set(productoId, (grouped.get(productoId) || 0) + cantidad);
  });
  return grouped;
};

const findStockError = (grouped, productos) => {
  for (const [productoId, cantidad] of grouped) {
    const producto = productos.find((p) => Number(p.id) === productoId);
    const stock = Number(producto?.stock_actual || 0);
    if (producto && cantidad > stock) {
      return `Stock insuficiente para "${producto.nombre}": solicitaste ${cantidad}, hay ${stock} disponibles.`;
    }
  }
  return null;
};

// Dinero recibido: vacio o cobro por Nequi/tarjeta significa pago exacto.
export const resolvePayment = ({ metodoPago, montoPago, total }) => {
  const recibido = Number(montoPago || 0);
  if (metodoPago !== 'efectivo' || !(recibido > 0)) return total;
  return recibido;
};

export const validateSale = ({ grouped, productos, ticket, total }) => {
  if (grouped.size === 0) return 'Debes agregar al menos un producto válido a la venta';

  const stockError = findStockError(grouped, productos);
  if (stockError) return stockError;

  if (ticket.esFiado) {
    const abono = Number(ticket.abonoInicialFiado || 0);
    if (!ticket.clienteTiendaId) return 'Selecciona el cliente al que se le fía';
    if (!Number.isFinite(abono) || abono < 0) return 'El abono inicial debe ser un valor válido';
    if (abono > total) return 'El abono inicial no puede superar el total de la venta';
    return null;
  }

  const pago = resolvePayment({ metodoPago: ticket.metodoPago, montoPago: ticket.montoPago, total });
  return pago < total ? 'El dinero recibido es menor al total de la venta' : null;
};

export const buildSalePayload = ({ grouped, ticket }) => {
  const payload = {
    items: Array.from(grouped.entries()).map(([producto_id, cantidad]) => ({ producto_id, cantidad })),
    es_fiado: ticket.esFiado,
    // Nequi es una transferencia; la tarjeta se registra aparte para que la caja las distinga.
    metodo_pago: ticket.metodoPago === 'nequi' ? 'transferencia' : ticket.metodoPago,
  };
  if (ticket.clienteFidelizacionId) payload.cliente_fidelizacion_id = Number(ticket.clienteFidelizacionId);
  if (ticket.esFiado) {
    payload.fiado_origen = 'tienda';
    payload.cliente_tienda_id = Number(ticket.clienteTiendaId);
    payload.abono_inicial = Number(ticket.abonoInicialFiado || 0);
  }
  return payload;
};

const BILL_STEPS = [5000, 10000, 20000, 50000, 100000];

// Billetes sugeridos: el siguiente multiplo de cada denominacion que cubre el total.
export const suggestedPayments = (total) => BILL_STEPS
  .map((step) => Math.ceil(total / step) * step)
  .filter((value, index, all) => value > total && all.indexOf(value) === index)
  .slice(0, 3);

// 5000 -> "5.000": separador de miles con punto, como se muestran todos los montos de la app.
export const formatThousands = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const parseMoney = (text) => Number.parseInt(String(text).replace(/\D/g, ''), 10) || 0;
