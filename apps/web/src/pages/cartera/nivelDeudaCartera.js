// Semaforo de la deuda de un cliente de cartera. Lo calcula el servidor por antiguedad de la deuda
// (igual que clientes de tienda): sin_deuda | al_dia | alerta | moroso. Si la respuesta no lo trae
// (servidor viejo) se usa el monto como antes.
const NIVELES = {
  sin_deuda: { id: 'sin_deuda', label: 'Sin deuda', dot: 'bg-gray-300', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-l-gray-300', bar: 'bg-gray-300' },
  al_dia: { id: 'al_dia', label: 'Al día', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-l-emerald-500', bar: 'bg-emerald-500' },
  alerta: { id: 'alerta', label: 'Alerta', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-l-amber-500', bar: 'bg-amber-500' },
  moroso: { id: 'moroso', label: 'Moroso', dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', border: 'border-l-red-500', bar: 'bg-red-500' },
};

const porMonto = (deuda) => {
  const monto = Number(deuda || 0);
  if (monto <= 0) return NIVELES.sin_deuda;
  if (monto <= 200000) return NIVELES.al_dia;
  if (monto <= 400000) return NIVELES.alerta;
  return NIVELES.moroso;
};

export const nivelDeudaCartera = (cliente) => NIVELES[cliente?.estado_deuda] ?? porMonto(cliente?.deuda_total);

export const textoAntiguedad = (cliente) => {
  const dias = cliente?.dias_deuda;
  if (dias === null || dias === undefined || Number(cliente?.deuda_total || 0) <= 0) return '';
  if (dias === 0) return 'Debe desde hoy';
  return `Debe hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
};
