import { parseApiDate } from '../../utils/format';

const dinero = (valor) => `$${Math.round(Number(valor || 0)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
const fechaCorta = (valor) => {
  const fecha = parseApiDate(valor);
  return `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`;
};

const cuantoTiempo = (dias) => {
  if (dias === null || dias === undefined) return '';
  if (dias === 0) return ' desde hoy';
  return ` hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
};

// Mensaje de cobro por WhatsApp con las cifras reales del estado de cuenta (el servidor las calcula):
// deuda actual, desde cuando, las ultimas compras a credito y el ultimo abono. No suma ni resta nada por su cuenta.
export const construirMensajeCobro = (estado, formasDePago = []) => {
  const lineas = [`Hola ${String(estado.nombre || '').trim()}, un saludo de Tienda Angelly.`, ''];
  lineas.push(`Tu saldo pendiente es de ${dinero(estado.deuda_total)}${Number(estado.deuda_total) > 0 ? cuantoTiempo(estado.dias_deuda) : ''}.`);

  const compras = estado.ultimas_compras ?? [];
  if (compras.length > 0) {
    lineas.push('', 'Tus últimas compras a crédito:');
    compras.forEach((compra) => lineas.push(`- ${fechaCorta(compra.fecha)}: ${compra.articulos} (${dinero(compra.total)})`));
  }
  if (estado.ultimo_abono) {
    lineas.push('', `Tu último abono fue de ${dinero(estado.ultimo_abono.monto)} el ${fechaCorta(estado.ultimo_abono.fecha)}.`);
  }

  if (formasDePago.length > 0) {
    lineas.push('', 'Formas de pago:', ...formasDePago.map((forma) => `- ${forma}`));
  }
  lineas.push('', 'Comparte el comprobante para aplicar el abono. Gracias!');
  return lineas.join('\n');
};
