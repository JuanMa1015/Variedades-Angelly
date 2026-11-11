import { formatDateTime, formatMoney } from '../../utils/format';
import { paymentLabel } from '../../utils/paymentMethods';
import { whatsappNumber, buildWhatsappUrl } from '../../utils/whatsapp';
import { RECEIPT_STYLES, escapeHtml } from '../Ventas/receiptHtml';

// El armado del enlace de WhatsApp es comun a varios modulos: vive en utils/whatsapp.
export { whatsappNumber, buildWhatsappUrl };

// Estado de la deuda segun cuanto lleva sin pagarse (lo calcula el servidor: 30 y 60 dias).
export const ESTADOS = {
  sin_deuda: { etiqueta: 'Sin deuda', borde: 'border-l-gray-200', chip: 'bg-gray-100 text-gray-500', punto: 'bg-gray-300' },
  al_dia: { etiqueta: 'Al día', borde: 'border-l-emerald-400', chip: 'bg-emerald-50 text-emerald-700', punto: 'bg-emerald-500' },
  alerta: { etiqueta: 'Alerta', borde: 'border-l-amber-400', chip: 'bg-amber-50 text-amber-700', punto: 'bg-amber-500' },
  moroso: { etiqueta: 'Moroso', borde: 'border-l-red-500', chip: 'bg-red-50 text-red-700', punto: 'bg-red-500' },
};

export const FILTROS = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'con_deuda', etiqueta: 'Con deuda' },
  { id: 'alerta', etiqueta: 'En alerta' },
  { id: 'moroso', etiqueta: 'Morosos' },
];

export const ORDENES = [
  { id: 'deuda', etiqueta: 'Mayor deuda' },
  { id: 'antiguedad', etiqueta: 'Más antigua' },
  { id: 'nombre', etiqueta: 'Nombre' },
];

export const estadoDe = (cliente) => ESTADOS[cliente?.estado_deuda] ?? ESTADOS.sin_deuda;

// "Debe hace 45 días" (sin dato de fecha, no se inventa).
export const describirAntiguedad = (dias) => {
  if (dias == null) return '';
  if (dias === 0) return 'Debe desde hoy';
  return dias === 1 ? 'Debe hace 1 día' : `Debe hace ${dias} días`;
};

const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

// Mismo criterio que el servidor: 7 (fijo de Bogota), 10 (celular) o 12 digitos (con 57).
export const isValidPhone = (valor) => {
  const digitos = soloDigitos(valor);
  if (!digitos) return true;
  return digitos.length === 7 || digitos.length === 10 || (digitos.length === 12 && digitos.startsWith('57'));
};

// 573001112233 -> "300 111 2233" (lo que se lee en el mostrador; el indicativo solo estorba).
export const formatPhone = (valor) => {
  const digitos = soloDigitos(valor);
  if (!digitos) return '';
  const nacional = digitos.length === 12 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
  return nacional.length === 10 ? `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}` : nacional;
};

// Recordatorio de cobro: saldo y formas de pago (si estan configuradas en el entorno).
export const cobroMessage = (cliente, formasDePago = {}) => {
  const lineas = [`Hola ${cliente.nombre}, un saludo de Tienda Angelly.`, '', `Tu saldo pendiente es de ${formatMoney(cliente.deuda_total)}.`, '', 'Formas de pago:'];
  if (formasDePago.cuenta) lineas.push(`- Transferencia: ${formasDePago.banco ?? ''} ${formasDePago.tipoCuenta ?? ''} ${formasDePago.cuenta}`.replace(/\s+/g, ' '));
  if (formasDePago.nequi) lineas.push(`- Nequi: ${formasDePago.nequi}`);
  lineas.push('', 'Comparte el comprobante para aplicar el abono. ¡Gracias!');
  return lineas;
};

// Confirmacion del abono para el cliente.
export const abonoMessage = (abono) => [
  `Hola ${abono.cliente_nombre}, recibimos tu abono de ${formatMoney(abono.monto)} (${paymentLabel(abono.metodo_pago)}).`,
  abono.saldo_cliente > 0 ? `Tu saldo pendiente es ${formatMoney(abono.saldo_cliente)}.` : '¡Tu deuda quedó saldada!',
  'Gracias por tu pago. Tienda Angelly.',
];

const fila = (etiqueta, valor, fuerte = false) => (
  `<div class="row${fuerte ? ' bold' : ''}"><span>${escapeHtml(etiqueta)}</span><span>${escapeHtml(valor)}</span></div>`
);

// Comprobante de abono (80 mm): lo que el cliente se lleva como prueba de su pago.
export const buildAbonoHtml = (abono, { site, contacto = {} }) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Comprobante de abono</title><style>${RECEIPT_STYLES}</style></head>
<body>
  <div class="center">
    <div class="title">${escapeHtml(site.name)}</div>
    ${contacto.nit ? `<div class="muted">NIT: ${escapeHtml(contacto.nit)}</div>` : ''}
    ${contacto.telefono ? `<div class="muted">Tel: ${escapeHtml(contacto.telefono)}</div>` : ''}
  </div>
  <div class="line"></div>
  <div class="center">
    <div class="bold">COMPROBANTE DE ABONO #${escapeHtml(abono.id)}</div>
    <div class="muted">${escapeHtml(formatDateTime(abono.fecha))}</div>
  </div>
  <div class="line"></div>
  <div class="muted">Cliente: ${escapeHtml(abono.cliente_nombre)}</div>
  ${fila('Deuda anterior:', formatMoney(abono.deuda_anterior))}
  ${fila('Abono:', formatMoney(abono.monto), true)}
  ${fila('Medio de pago:', paymentLabel(abono.metodo_pago))}
  ${fila('Saldo pendiente:', formatMoney(abono.saldo_cliente), true)}
  ${abono.referencia ? `<div class="muted">Ref.: ${escapeHtml(abono.referencia)}</div>` : ''}
  <div class="line"></div>
  <div class="center muted">Documento no válido como factura. ¡Gracias por su pago!</div>
</body></html>`;

// Texto corto de una venta para el historial: "3× Arroz, 2× Aceite".
export const resumirItems = (items = []) => items.map((item) => `${item.cantidad}× ${item.articulo}`).join(', ');
