import { describe, expect, it } from 'vitest';

// formatMoney separa el simbolo con un espacio duro: para comparar texto se normaliza.
const plano = (texto) => texto.replace(/\u00a0/g, ' ');
import {
  abonoMessage, buildAbonoHtml, buildWhatsappUrl, cobroMessage, describirAntiguedad, estadoDe, formatPhone, isValidPhone, resumirItems, whatsappNumber,
} from '../tiendaHelpers';

describe('telefono', () => {
  it.each([
    ['573001112233', '300 111 2233'],
    ['3001112233', '300 111 2233'],
    ['2345678', '2345678'],
    ['', ''],
    [null, ''],
  ])('formatea %s como %s', (entrada, esperado) => {
    expect(formatPhone(entrada)).toBe(esperado);
  });

  it.each([
    ['', true], ['3001112233', true], ['300 111 2233', true], ['573001112233', true], ['2345678', true],
    ['123', false], ['30011122', false], ['583001112233', false],
  ])('%s es valido: %s', (entrada, esperado) => {
    expect(isValidPhone(entrada)).toBe(esperado);
  });

  it('arma el numero de wa.me igual que el servidor', () => {
    expect(whatsappNumber('3001112233')).toBe('573001112233');
    expect(whatsappNumber('573001112233')).toBe('573001112233');
    expect(whatsappNumber('2345678')).toBe('576012345678');
    expect(whatsappNumber('123')).toBe('');
    expect(buildWhatsappUrl('123', ['x'])).toBe('');
    expect(buildWhatsappUrl('3001112233', ['Hola', 'saldo $ 5.000'])).toBe('https://wa.me/573001112233?text=Hola%0Asaldo%20%24%205.000');
  });
});

describe('estado y antiguedad', () => {
  it('cae en "sin deuda" cuando no hay estado conocido', () => {
    expect(estadoDe({ estado_deuda: 'moroso' }).etiqueta).toBe('Moroso');
    expect(estadoDe({}).etiqueta).toBe('Sin deuda');
    expect(estadoDe(undefined).etiqueta).toBe('Sin deuda');
  });

  it('describe los dias sin inventar fechas', () => {
    expect(describirAntiguedad(null)).toBe('');
    expect(describirAntiguedad(0)).toBe('Debe desde hoy');
    expect(describirAntiguedad(1)).toBe('Debe hace 1 día');
    expect(describirAntiguedad(45)).toBe('Debe hace 45 días');
  });
});

describe('mensajes y comprobante', () => {
  it('el recordatorio incluye el saldo y solo las formas de pago configuradas', () => {
    const sin = plano(cobroMessage({ nombre: 'Ana', deuda_total: 5000 }).join('\n'));
    expect(sin).toContain('Hola Ana');
    expect(sin).toContain('$ 5.000');
    expect(sin).not.toContain('Nequi');

    const con = cobroMessage({ nombre: 'Ana', deuda_total: 5000 }, { banco: 'Bancolombia', tipoCuenta: 'Ahorros', cuenta: '123', nequi: '300' }).join('\n');
    expect(con).toContain('- Transferencia: Bancolombia Ahorros 123');
    expect(con).toContain('- Nequi: 300');
  });

  it('la confirmacion del abono celebra la deuda saldada', () => {
    expect(abonoMessage({ cliente_nombre: 'Ana', monto: 1000, metodo_pago: 'efectivo', saldo_cliente: 0 }).join(' ')).toContain('saldada');
    expect(plano(abonoMessage({ cliente_nombre: 'Ana', monto: 1000, metodo_pago: 'efectivo', saldo_cliente: 500 }).join(' '))).toContain('$ 500');
  });

  it('el comprobante trae las cifras y escapa lo que escribe una persona', () => {
    const html = buildAbonoHtml(
      { id: 3, cliente_nombre: '<b>Ana</b>', monto: 2000, metodo_pago: 'tarjeta', deuda_anterior: 5000, saldo_cliente: 3000, referencia: '<script>x</script>', fecha: '2026-11-10T20:00:00' },
      { site: { name: 'Variedades Angelly' }, contacto: { nit: '123' } },
    );

    expect(html).toContain('COMPROBANTE DE ABONO #3');
    expect(html).toContain('NIT: 123');
    expect(html).toContain('Tarjeta');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });

  it('resume los productos de una venta', () => {
    expect(resumirItems([{ cantidad: 3, articulo: 'Arroz' }, { cantidad: 1, articulo: 'Aceite' }])).toBe('3× Arroz, 1× Aceite');
    expect(resumirItems(undefined)).toBe('');
  });
});
