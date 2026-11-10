const METHOD_LABELS = { efectivo: 'Efectivo', nequi: 'Nequi', tarjeta: 'Tarjeta' };

// Los nombres de producto o cliente vienen de la base de datos: se escapan antes de armar el HTML.
export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const row = (label, value, bold = false) => (
  `<div class="row${bold ? ' bold' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
);

const itemRows = (items, formatMoney) => items.map((item) => (
  `<tr><td class="name">${escapeHtml(item.nombre)}</td><td class="num">${escapeHtml(item.cantidad)}</td>`
  + `<td class="num">${escapeHtml(formatMoney(item.precio))}</td><td class="num">${escapeHtml(formatMoney(item.subtotal))}</td></tr>`
)).join('');

const totalsBlock = (receipt, formatMoney) => {
  const lines = [];
  if (receipt.descuento > 0) {
    lines.push(row('Subtotal:', formatMoney(receipt.total + receipt.descuento)));
    lines.push(row(`Descuento (${receipt.puntosCanjeados} pts):`, `-${formatMoney(receipt.descuento)}`));
  }
  lines.push(row('TOTAL:', formatMoney(receipt.total), true));
  if (receipt.esFiado) {
    if (receipt.cliente) lines.push(row('Cliente:', receipt.cliente));
    lines.push(row('Abono:', formatMoney(receipt.abono || 0)));
    lines.push(row('Queda fiado:', formatMoney(Math.max(0, receipt.total - (receipt.abono || 0))), true));
  } else {
    // El cambio se muestra siempre en contado (en $0 si pagaron exacto) para que el comprobante sea uniforme.
    lines.push(row('Pago:', formatMoney(receipt.pago)));
    lines.push(row('Cambio:', formatMoney(receipt.cambio || 0)));
  }
  if (receipt.puntos > 0) lines.push(row('Puntos ganados:', `+${receipt.puntos}`));
  return lines.join('');
};

// Estilos de impresion de 80 mm: tambien los usan otros comprobantes (abonos).
export const RECEIPT_STYLES = `
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 80mm; padding: 4mm; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
  .center { text-align: center; }
  .title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
  .muted { color: #555; font-size: 10px; }
  .line { border-top: 1px dashed #777; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { text-align: left; border-bottom: 1px dashed #777; padding: 2px 0; }
  th.num, td.num { text-align: right; white-space: nowrap; padding-left: 4px; }
  td { padding: 2px 0; vertical-align: top; }
  td.name { word-break: break-word; }
  .row { display: flex; justify-content: space-between; margin: 1px 0; }
  .bold { font-weight: 700; }
`;

// Comprobante de venta para impresora termica de 80 mm (tambien sale bien en una hoja normal).
// Se imprime en un documento aparte para que no dependa del diseno de la aplicacion.
export const buildReceiptHtml = (receipt, { formatMoney, site, contacto }) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Comprobante de venta</title><style>${RECEIPT_STYLES}</style></head>
<body>
  <div class="center">
    <div class="title">${escapeHtml(site.name)}</div>
    ${contacto.nit ? `<div class="muted">NIT: ${escapeHtml(contacto.nit)}</div>` : ''}
    ${contacto.direccion ? `<div class="muted">${escapeHtml(contacto.direccion)}</div>` : ''}
    ${contacto.telefono ? `<div class="muted">Tel: ${escapeHtml(contacto.telefono)}</div>` : ''}
  </div>
  <div class="line"></div>
  <div class="center">
    <div class="bold">COMPROBANTE DE VENTA</div>
    <div class="muted">Documento no válido como factura</div>
    <div class="muted">${escapeHtml(receipt.timestamp)}</div>
  </div>
  <div class="line"></div>
  <div class="muted">Método de pago: ${escapeHtml(METHOD_LABELS[receipt.metodoPago] ?? 'Transferencia')}</div>
  <table>
    <thead><tr><th>Producto</th><th class="num">Cant</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${itemRows(receipt.items, formatMoney)}</tbody>
  </table>
  <div class="line"></div>
  ${totalsBlock(receipt, formatMoney)}
  <div class="line"></div>
  <div class="center muted">¡Gracias por su preferencia!</div>
</body></html>`;
