// El valor es lo que guarda el servidor (minusculas, sin tilde); la etiqueta es lo que se lee.
export const CATEGORIAS = [
  { id: 'arriendo', etiqueta: 'Arriendo' },
  { id: 'servicios', etiqueta: 'Servicios' },
  { id: 'nomina', etiqueta: 'Nómina' },
  { id: 'pagos vendedores', etiqueta: 'Pagos a vendedores' },
  { id: 'transporte', etiqueta: 'Transporte' },
  { id: 'otros', etiqueta: 'Otros' },
];

export const etiquetaCategoria = (id) => CATEGORIAS.find((c) => c.id === id)?.etiqueta ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Sin categoría');

export const MEDIOS_GASTO = [
  { id: 'efectivo', etiqueta: 'Efectivo (sale del cajón)' },
  { id: 'transferencia', etiqueta: 'Transferencia' },
  { id: 'tarjeta', etiqueta: 'Tarjeta' },
];

export const ESTADOS_GASTO = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'vigentes', etiqueta: 'Vigentes' },
  { id: 'anulados', etiqueta: 'Anulados' },
];

// Mes actual como AAAA-MM con la hora de Bogota (la misma con que el servidor cuenta el mes).
export const mesActual = (ahora = new Date()) => ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7);

// "2026-11" -> "noviembre de 2026"
export const nombreMes = (mes) => {
  if (!/^\d{4}-\d{2}$/.test(String(mes))) return '';
  const [anio, numero] = mes.split('-').map(Number);
  return new Date(Date.UTC(anio, numero - 1, 15)).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

// Frase y tono de la comparacion con el mes anterior: en gastos, subir es lo que conviene vigilar.
export const describirVariacion = (resumen) => {
  const anterior = nombreMes(resumen.mes_anterior.mes).split(' ')[0];
  if (resumen.variacion_pct === null || resumen.variacion_pct === undefined) {
    return { texto: `Sin gastos en ${anterior}`, tono: 'text-gray-500' };
  }
  const pct = resumen.variacion_pct;
  if (pct === 0) return { texto: `Igual que en ${anterior}`, tono: 'text-gray-500' };
  const absoluto = Math.abs(pct).toLocaleString('es-CO', { maximumFractionDigits: 1 });
  return pct > 0
    ? { texto: `▲ ${absoluto} % más que en ${anterior}`, tono: 'text-amber-700' }
    : { texto: `▼ ${absoluto} % menos que en ${anterior}`, tono: 'text-emerald-700' };
};
