// Medios de pago que reconoce el servidor. Nequi y otras billeteras se registran como transferencia.
export const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { id: 'transferencia', label: 'Transferencia', emoji: '📱' },
  { id: 'tarjeta', label: 'Tarjeta', emoji: '💳' },
];

export const paymentLabel = (method) => PAYMENT_METHODS.find((item) => item.id === method)?.label ?? (method || '-');
