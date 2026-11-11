// Solo el efectivo sale del cajon y resta del efectivo de la caja; "credito" queda anotado (aun sin cuentas por pagar).
export const MEDIOS_PAGO = [
  { id: 'efectivo', etiqueta: 'Efectivo (sale del cajón)' },
  { id: 'transferencia', etiqueta: 'Transferencia' },
  { id: 'tarjeta', etiqueta: 'Tarjeta' },
  { id: 'credito', etiqueta: 'A crédito (queda debiendo)' },
];

// "Efectivo", "Transferencia"... sin la aclaracion entre parentesis; "Sin dato" para las facturas viejas.
export const etiquetaMedio = (id) => MEDIOS_PAGO.find((m) => m.id === id)?.etiqueta.replace(/ \(.*\)$/, '') ?? 'Sin dato';

// Como se lee el medio dentro de una frase: "pagada en efectivo".
export const TEXTO_PAGO = { efectivo: 'en efectivo', transferencia: 'por transferencia', tarjeta: 'con tarjeta', credito: 'a crédito' };
