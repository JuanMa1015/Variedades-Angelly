// Armado de pedidos a proveedor, compartido por «Reponer stock» (Inventario) y «Nuevo pedido» (Proveedores).

// El servidor guarda la descripcion en 1000 caracteres.
export const MAX_DESCRIPCION = 1000;

// Cantidad que se sugiere pedir: dejar el stock en el doble del minimo (como minimo 1 unidad).
export const cantidadSugerida = (stockActual, stockMinimo) => Math.max(1, Number(stockMinimo) * 2 - Number(stockActual));

// Descripcion corta del pedido: si no cabe todo, avisa cuantos productos faltan.
export const descripcionPedido = (items) => {
  const lineas = items.map((item) => `${item.cantidad}× ${item.nombre}`);
  let texto = lineas.join('; ');
  if (texto.length <= MAX_DESCRIPCION) return texto;
  let incluidas = lineas.length;
  while (incluidas > 1 && `${lineas.slice(0, incluidas).join('; ')}… y ${lineas.length - incluidas} más`.length > MAX_DESCRIPCION) incluidas -= 1;
  texto = `${lineas.slice(0, incluidas).join('; ')}… y ${lineas.length - incluidas} más`;
  return texto.slice(0, MAX_DESCRIPCION);
};

export const montoDeItems = (items) => items.reduce((total, item) => total + item.cantidad * item.costo, 0);

// Mensaje completo para el proveedor al crear el pedido (el detalle entero, sin el limite de la descripcion guardada).
export const mensajePedido = ({ proveedor, items, pedidoId, monto, formatMoney }) => [
  `Hola ${proveedor}, un saludo de Tienda Angelly.`,
  '',
  `Quisiera hacer el pedido #${pedidoId}:`,
  ...items.map((item) => `- ${item.cantidad}× ${item.nombre}`),
  '',
  `Valor estimado: ${formatMoney(monto)}`,
  'Quedo atento a la confirmación y al tiempo de entrega. ¡Gracias!',
];

// Lineas de un pedido ya guardado, sea con el formato actual ("3× Pan; 2× Leche") o el anterior (una linea "- ..." por producto).
export const lineasDeDescripcion = (descripcion) => String(descripcion ?? '')
  .split(/;\s*|\n/)
  .map((linea) => linea.replace(/^-\s*/, '').trim())
  .filter(Boolean);

// Mensaje para volver a enviar un pedido registrado.
export const mensajeReenvio = ({ pedido, proveedor, formatMoney }) => mensajePedido({
  proveedor: proveedor?.contacto || proveedor?.nombre || pedido.proveedor_nombre,
  items: [],
  pedidoId: pedido.id,
  monto: pedido.monto_estimado,
  formatMoney,
}).flatMap((linea) => (linea.startsWith('Valor estimado')
  ? [...lineasDeDescripcion(pedido.descripcion).map((texto) => `- ${texto}`), '', linea]
  : [linea]));

export const ESTADOS_PEDIDO = {
  enviado: { etiqueta: 'Pendiente', clases: 'bg-amber-100 text-amber-800' },
  recibido: { etiqueta: 'Recibido', clases: 'bg-emerald-100 text-emerald-800' },
  cancelado: { etiqueta: 'Cancelado', clases: 'bg-gray-200 text-gray-700' },
};
