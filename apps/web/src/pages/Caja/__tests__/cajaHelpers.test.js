import { describe, expect, it } from 'vitest';
import { buildCierreHtml, describirCierre, duracionAbierta, estaCuadrada, etiquetaDescuadre } from '../cajaHelpers';

describe('descuadre', () => {
  it('una diferencia menor a un centavo cuenta como cuadrada', () => {
    expect(estaCuadrada(0)).toBe(true);
    expect(estaCuadrada(0.004)).toBe(true);
    expect(estaCuadrada(-500)).toBe(false);
  });

  it('describe si sobra o falta dinero', () => {
    expect(describirCierre({ descuadre: 0 })).toContain('cuadrada');
    expect(describirCierre({ descuadre: 1500 })).toContain('sobran');
    expect(describirCierre({ descuadre: -500 })).toContain('faltan');
  });

  it('etiqueta con tono para tablas y tarjetas', () => {
    expect(etiquetaDescuadre(null)).toBeNull();
    expect(etiquetaDescuadre(0)).toEqual({ texto: 'Cuadrada', tono: 'ok' });
    expect(etiquetaDescuadre(500)).toMatchObject({ tono: 'sobra' });
    expect(etiquetaDescuadre(-500)).toMatchObject({ tono: 'falta' });
  });
});

describe('duracionAbierta', () => {
  const abierta = '2026-11-09T10:00:00Z';

  it('muestra horas y minutos, o solo minutos', () => {
    expect(duracionAbierta(abierta, new Date('2026-11-09T13:12:00Z'))).toBe('3 h 12 min');
    expect(duracionAbierta(abierta, new Date('2026-11-09T10:45:00Z'))).toBe('45 min');
  });

  it('no inventa una duracion negativa ni con fecha invalida', () => {
    expect(duracionAbierta(abierta, new Date('2026-11-09T09:00:00Z'))).toBe('0 min');
    expect(duracionAbierta('basura')).toBe('');
  });
});

describe('buildCierreHtml', () => {
  const caja = {
    id: 7, abierto_por: 'vendedor1', cerrado_por: 'vendedor1', fecha_apertura: '2026-11-09T10:00:00', fecha_cierre: '2026-11-09T20:00:00',
    monto_inicial: 5000, monto_ventas_efectivo: 2000, monto_ventas_transferencia: 1000, monto_ventas_tarjeta: 4000, monto_gastos: 700,
    saldo_esperado: 6300, monto_cierre: 6300, descuadre: 0, observaciones: null,
  };

  it('arma el reporte con las cifras, el resultado y el espacio para firmar', () => {
    const html = buildCierreHtml(caja, { site: { name: 'Variedades Angelly' } });

    expect(html).toContain('CIERRE DE CAJA #7');
    expect(html).toContain('Efectivo esperado:');
    expect(html).toContain('Cuadrada');
    expect(html).toContain('Firma de quien cierra');
  });

  it('escapa la nota porque la escribe una persona', () => {
    const html = buildCierreHtml({ ...caja, observaciones: '<script>alert(1)</script>' }, { site: { name: 'X' } });

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sin esperado (cierre ciego) no inventa la linea', () => {
    expect(buildCierreHtml({ ...caja, saldo_esperado: null }, { site: { name: 'X' } })).not.toContain('Efectivo esperado:');
  });
});
