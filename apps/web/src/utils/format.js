const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

// El servidor guarda y envia las fechas en UTC pero sin la "Z" final. Sin ella el navegador las
// tomaria como hora local y todas las horas saldrian corridas 5 horas en Colombia.
export const parseApiDate = (value) => {
  if (value instanceof Date) return value;
  const text = String(value ?? '');
  return new Date(ISO_DATETIME.test(text) && !HAS_ZONE.test(text) ? `${text}Z` : text);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = parseApiDate(dateStr);
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateTime = (value) => {
  if (value == null) return '-';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
};
