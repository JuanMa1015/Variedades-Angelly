const dosDigitos = (n) => String(n).padStart(2, '0');

// YYYY-MM-DD con la fecha local del navegador (no UTC: a las 8 p. m. en Colombia ya seria "manana" en UTC).
export const aTexto = (fecha) => `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;

export const PERIODOS = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'semana', texto: 'Esta semana' },
  { id: 'mes', texto: 'Este mes' },
  { id: 'mes_pasado', texto: 'Mes pasado' },
  { id: 'personalizado', texto: 'Otro periodo' },
];

// Rango [desde, hasta] (ambos inclusive) de un periodo predefinido; la semana empieza el lunes.
export const rangoDe = (id, hoy = new Date()) => {
  const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (id === 'hoy') return { desde: aTexto(dia), hasta: aTexto(dia) };
  if (id === 'semana') {
    const lunes = new Date(dia);
    lunes.setDate(dia.getDate() - ((dia.getDay() + 6) % 7));
    return { desde: aTexto(lunes), hasta: aTexto(dia) };
  }
  if (id === 'mes_pasado') {
    return {
      desde: aTexto(new Date(dia.getFullYear(), dia.getMonth() - 1, 1)),
      hasta: aTexto(new Date(dia.getFullYear(), dia.getMonth(), 0)),
    };
  }
  return { desde: aTexto(new Date(dia.getFullYear(), dia.getMonth(), 1)), hasta: aTexto(dia) };
};
