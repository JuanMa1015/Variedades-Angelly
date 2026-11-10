import { paymentLabel } from '../utils/paymentMethods';

const TONES = {
  efectivo: 'bg-rosewood/10 text-rosewood',
  transferencia: 'bg-blue-50 text-blue-700',
  tarjeta: 'bg-sky-50 text-sky-700',
};

// Etiqueta de color con el medio de pago de una venta o abono.
const PaymentBadge = ({ method, compact = false }) => (
  <span
    className={`rounded-full font-semibold ${compact ? 'px-2 py-0.5' : 'px-2.5 py-0.5 text-xs'} ${TONES[method] ?? 'bg-gray-100 text-gray-600'}`}
  >
    {paymentLabel(method)}
  </span>
);

export default PaymentBadge;
