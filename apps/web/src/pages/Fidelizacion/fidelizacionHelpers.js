export const ETIQUETA_MOVIMIENTO = {
  inicial: 'Puntos iniciales',
  saldo_inicial: 'Saldo anterior',
  venta: 'Compra',
  canje: 'Canje',
  anulacion_venta: 'Venta anulada',
  eliminacion_venta: 'Venta eliminada',
  ajuste: 'Ajuste',
};

export const MODOS_AJUSTE = [
  { id: 'sumar', etiqueta: 'Sumar' },
  { id: 'restar', etiqueta: 'Restar' },
  { id: 'fijar', etiqueta: 'Dejar en' },
];

export const FILTROS = [
  { id: 'activos', etiqueta: 'Activos' },
  { id: 'canjeables', etiqueta: 'Pueden canjear' },
  { id: 'desactivados', etiqueta: 'Desactivados', soloAdmin: true },
];

// Cuantos puntos quedarian tras el ajuste (null si lo escrito no sirve): se ve antes de aplicarlo.
export const resultadoDelAjuste = (saldo, modo, puntos) => {
  const cantidad = Number(puntos);
  if (puntos === '' || !Number.isInteger(cantidad) || cantidad < 0) return null;
  const nuevo = { sumar: saldo + cantidad, restar: saldo - cantidad, fijar: cantidad }[modo];
  return { nuevo, delta: nuevo - saldo };
};

// "Venta #14" cuando el movimiento viene de una venta; vacio si fue un ajuste.
export const describirReferencia = (mov) => (mov.referencia_id ? `${mov.referencia_tipo === 'venta' ? 'Venta' : 'Documento'} #${mov.referencia_id}` : '');

// Estado de canje de un cliente segun el minimo del programa.
export const estadoDeCanje = (cliente, umbral) => {
  if (!cliente.activo) return { id: 'desactivado', texto: 'Desactivado', clases: 'bg-gray-200 text-gray-700' };
  if (cliente.puntos_acumulados >= umbral) return { id: 'canjea', texto: 'Puede canjear', clases: 'bg-emerald-100 text-emerald-800' };
  return { id: 'faltan', texto: `Faltan ${umbral - cliente.puntos_acumulados} para canjear`, clases: 'bg-amber-100 text-amber-800' };
};
