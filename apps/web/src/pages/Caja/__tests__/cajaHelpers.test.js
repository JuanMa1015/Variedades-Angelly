import { describe, expect, it } from 'vitest';
import { buildCierreHtml, describirCierre, duracionAbierta, estaCuadrada, etiquetaDescuadre, lineasDelResumen, montoInicialListo, totalPorDenominaciones } from '../cajaHelpers';

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


describe('contador de billetes y monedas', () => {
  it('suma cada denominacion por su cantidad e ignora lo invalido', () => {
    expect(totalPorDenominaciones({})).toBe(0);
    expect(totalPorDenominaciones({ 50000: 2, 1000: '3', 500: 1 })).toBe(103500);
    expect(totalPorDenominaciones({ 50000: -4, 20000: 'abc', 100: 2.9 })).toBe(200);
    expect(totalPorDenominaciones(null)).toBe(0);
  });
});

describe('lineasDelResumen', () => {
  const base = { ventas: 0, vendido: 0, ventas_a_credito: 0, ventas_anuladas: 0, descuentos: 0, devoluciones: 0, devuelto_en_dinero: 0, abonos: 0, abonos_total: 0, gastos: 0, gastos_total: 0, compras: 0, compras_total: 0 };

  it('sin nada que contar solo dice las ventas y omite el resto', () => {
    expect(lineasDelResumen(base).map((l) => l.clave)).toEqual(['ventas']);
    expect(lineasDelResumen(null)).toEqual([]);
  });

  it('usa singular y plural y solo muestra lo que paso', () => {
    const textos = lineasDelResumen({ ...base, ventas: 1, vendido: 3000, ventas_anuladas: 1, devoluciones: 1, devuelto_en_dinero: 1000, gastos: 2, gastos_total: 500 }).map((l) => l.texto);

    expect(textos[0]).toMatch(/^1 venta por/);
    expect(textos).toContain('1 venta anulada');
    expect(textos.some((t) => /^1 devolución:/.test(t))).toBe(true);
    expect(textos.some((t) => /^2 gastos:/.test(t))).toBe(true);
    expect(textos.some((t) => /abono|compra|Descuentos|crédito/.test(t))).toBe(false);
  });
});

describe('montoInicialListo', () => {
  it('pide un monto o marcar que se empieza sin efectivo', () => {
    expect(montoInicialListo(0, false)).toBe(false);
    expect(montoInicialListo(20000, false)).toBe(true);
    expect(montoInicialListo(0, true)).toBe(true);
  });
});
