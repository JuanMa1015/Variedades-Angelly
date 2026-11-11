// Motivos de un ajuste de stock segun lo que se hace; el servidor valida la misma combinacion.
export const MODOS = [
  { id: 'sumar', etiqueta: 'Sumar', ayuda: 'Entraron unidades' },
  { id: 'restar', etiqueta: 'Restar', ayuda: 'Salieron unidades' },
  { id: 'contar', etiqueta: 'Contar', ayuda: 'Escribe lo que hay en el estante' },
];

export const MOTIVOS = {
  ingreso_sin_factura: 'Ingreso sin factura',
  conteo: 'Conteo físico',
  merma: 'Merma',
  dano: 'Producto dañado',
  devolucion_proveedor: 'Devolución al proveedor',
  correccion: 'Corrección',
  otro: 'Otro (explicar)',
};

export const MOTIVOS_POR_MODO = {
  sumar: ['ingreso_sin_factura', 'correccion', 'otro'],
  restar: ['merma', 'dano', 'devolucion_proveedor', 'correccion', 'otro'],
  contar: ['conteo'],
};

// Cuanto cambia el stock con este ajuste y cuanto quedaria (null si no se puede calcular o no cambia nada).
export const resultadoDelAjuste = (stockActual, modo, cantidad) => {
  const stock = Number(stockActual);
  const n = Number(cantidad);
  if (!Number.isInteger(n) || n < 0 || !Number.isFinite(stock)) return null;
  const nuevo = { sumar: stock + n, restar: stock - n, contar: n }[modo];
  return { delta: nuevo - stock, nuevo };
};

// Etiqueta corta del tipo de movimiento que ve quien revisa el historial.
export const ETIQUETA_MOVIMIENTO = {
  stock_inicial: 'Stock inicial',
  venta: 'Venta',
  venta_cartera: 'Venta de cartera',
  anulacion_venta: 'Venta anulada',
  eliminacion_venta: 'Venta eliminada',
  factura_compra: 'Compra a proveedor',
  eliminacion_factura: 'Compra eliminada',
  ajuste: 'Ajuste',
};

// Estado del stock de un producto: agotado, bajo (queda poco) o ok.
export const estadoStock = (producto) => {
  const stock = Number(producto.stock_actual || 0);
  if (stock === 0) return 'agotado';
  return stock <= Number(producto.stock_minimo || 0) ? 'bajo' : 'ok';
};

export const ESTADOS_STOCK = {
  agotado: { etiqueta: 'Agotado', clase: 'bg-red-50 text-red-700' },
  bajo: { etiqueta: 'Bajo', clase: 'bg-amber-50 text-amber-700' },
  ok: { etiqueta: '', clase: 'text-gray-700' },
};

export const FILTROS_STOCK = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'agotado', etiqueta: 'Agotados' },
  { id: 'bajo', etiqueta: 'Bajo stock' },
  { id: 'ok', etiqueta: 'Con stock' },
];
