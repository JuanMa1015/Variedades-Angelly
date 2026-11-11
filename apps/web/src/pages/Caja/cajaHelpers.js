import { formatDateTime, formatMoney, parseApiDate } from '../../utils/format';
import { escapeHtml } from '../Ventas/receiptHtml';

const CERO = 0.01;

export const estaCuadrada = (descuadre) => !Number.isFinite(Number(descuadre)) || Math.abs(Number(descuadre)) < CERO;

// Mensaje al cerrar: aqui el cajero conoce por primera vez cuanto esperaba el sistema.
export const describirCierre = (cierre) => {
  const descuadre = Number(cierre?.descuadre);
  if (estaCuadrada(descuadre)) return 'Caja cerrada: cuadrada ✓';
  return `Caja cerrada con descuadre: ${descuadre > 0 ? 'sobran' : 'faltan'} ${formatMoney(Math.abs(descuadre))}`;
};

// Texto corto del descuadre para tablas y tarjetas: "Cuadrada", "Sobran $500" o "Faltan $500".
export const etiquetaDescuadre = (descuadre) => {
  if (descuadre == null) return null;
  const valor = Number(descuadre);
  if (estaCuadrada(valor)) return { texto: 'Cuadrada', tono: 'ok' };
  return valor > 0
    ? { texto: `Sobran ${formatMoney(valor)}`, tono: 'sobra' }
    : { texto: `Faltan ${formatMoney(Math.abs(valor))}`, tono: 'falta' };
};

// Tiempo que lleva abierta la caja ("3 h 12 min"); sin fecha valida no muestra nada.
export const duracionAbierta = (fechaApertura, ahora = new Date()) => {
  const inicio = parseApiDate(fechaApertura);
  if (Number.isNaN(inicio.getTime())) return '';
  const minutos = Math.max(0, Math.floor((ahora - inicio) / 60000));
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas} h ${minutos % 60} min` : `${minutos} min`;
};

export const TIPOS_MOVIMIENTO = {
  venta: { etiqueta: 'Venta', clase: 'bg-emerald-50 text-emerald-700' },
  abono_tienda: { etiqueta: 'Abono', clase: 'bg-sky-50 text-sky-700' },
  abono_cartera: { etiqueta: 'Abono cartera', clase: 'bg-sky-50 text-sky-700' },
  gasto: { etiqueta: 'Gasto', clase: 'bg-red-50 text-red-700' },
  compra: { etiqueta: 'Compra', clase: 'bg-orange-50 text-orange-700' },
};

const fila = (etiqueta, valor, fuerte = false) => (
  `<div class="row${fuerte ? ' bold' : ''}"><span>${escapeHtml(etiqueta)}</span><span>${escapeHtml(valor)}</span></div>`
);

const ESTILOS = `
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 80mm; padding: 4mm; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
  .center { text-align: center; }
  .title { font-size: 15px; font-weight: 700; text-transform: uppercase; }
  .muted { color: #555; font-size: 10px; }
  .line { border-top: 1px dashed #777; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; margin: 2px 0; }
  .bold { font-weight: 700; }
  .firma { margin-top: 22px; border-top: 1px solid #111; text-align: center; font-size: 10px; padding-top: 2px; }
`;

// Resumen imprimible del turno (reporte de cierre) para guardar o firmar.
export const buildCierreHtml = (caja, { site }) => {
  const esperado = caja.saldo_esperado;
  const lineas = [
    fila('Efectivo inicial:', formatMoney(caja.monto_inicial)),
    fila('Ventas en efectivo:', formatMoney(caja.monto_ventas_efectivo)),
    fila('Gastos y compras en efectivo:', `-${formatMoney(caja.monto_gastos)}`),
    esperado != null ? fila('Efectivo esperado:', formatMoney(esperado), true) : '',
    caja.monto_cierre != null ? fila('Efectivo contado:', formatMoney(caja.monto_cierre), true) : '',
  ];
  const etiqueta = etiquetaDescuadre(caja.descuadre);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Cierre de caja</title><style>${ESTILOS}</style></head>
<body>
  <div class="center">
    <div class="title">${escapeHtml(site.name)}</div>
    <div class="bold">CIERRE DE CAJA #${escapeHtml(caja.id)}</div>
  </div>
  <div class="line"></div>
  <div class="muted">Abrió: ${escapeHtml(caja.abierto_por)} · ${escapeHtml(formatDateTime(caja.fecha_apertura))}</div>
  <div class="muted">Cerró: ${escapeHtml(caja.cerrado_por || '-')} · ${escapeHtml(formatDateTime(caja.fecha_cierre))}</div>
  <div class="line"></div>
  ${lineas.join('')}
  <div class="line"></div>
  ${fila('Transferencias:', formatMoney(caja.monto_ventas_transferencia))}
  ${fila('Tarjeta:', formatMoney(caja.monto_ventas_tarjeta))}
  ${etiqueta ? `<div class="line"></div>${fila('Resultado:', etiqueta.texto, true)}` : ''}
  ${caja.observaciones ? `<div class="muted">Nota: ${escapeHtml(caja.observaciones)}</div>` : ''}
  <div class="firma">Firma de quien cierra</div>
</body></html>`;
};
