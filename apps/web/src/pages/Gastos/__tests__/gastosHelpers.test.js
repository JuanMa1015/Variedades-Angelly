import { describe, expect, it } from 'vitest';
import { describirVariacion, etiquetaCategoria, mesActual, nombreMes } from '../gastosHelpers';

describe('etiquetaCategoria', () => {
  it('pone tilde a las conocidas y capitaliza las demas', () => {
    expect(etiquetaCategoria('nomina')).toBe('Nómina');
    expect(etiquetaCategoria('pagos vendedores')).toBe('Pagos a vendedores');
    expect(etiquetaCategoria('papeleria')).toBe('Papeleria');
    expect(etiquetaCategoria('')).toBe('Sin categoría');
  });
});

describe('mesActual y nombreMes', () => {
  it('el mes actual usa la hora de Bogota', () => {
    // 03:00 UTC del 1 de noviembre es todavia el 31 de octubre en Bogota
    expect(mesActual(new Date('2026-11-01T03:00:00Z'))).toBe('2026-10');
    expect(mesActual(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11');
  });

  it('nombra el mes en espanol y tolera valores raros', () => {
    expect(nombreMes('2026-11')).toBe('noviembre de 2026');
    expect(nombreMes('2026-01')).toBe('enero de 2026');
    expect(nombreMes('')).toBe('');
    expect(nombreMes('noviembre')).toBe('');
  });
});

describe('describirVariacion', () => {
  const resumen = (variacion_pct) => ({ mes: '2026-11', mes_anterior: { mes: '2026-10' }, variacion_pct });

  it('si subio avisa con tono de alerta', () => {
    expect(describirVariacion(resumen(32))).toEqual({ texto: '▲ 32 % más que en octubre', tono: 'text-amber-700' });
  });

  it('si bajo lo celebra', () => {
    expect(describirVariacion(resumen(-12.5))).toEqual({ texto: '▼ 12,5 % menos que en octubre', tono: 'text-emerald-700' });
  });

  it('igual y sin base de comparacion', () => {
    expect(describirVariacion(resumen(0)).texto).toBe('Igual que en octubre');
    expect(describirVariacion(resumen(null)).texto).toBe('Sin gastos en octubre');
    expect(describirVariacion(resumen(undefined)).texto).toBe('Sin gastos en octubre');
  });
});
