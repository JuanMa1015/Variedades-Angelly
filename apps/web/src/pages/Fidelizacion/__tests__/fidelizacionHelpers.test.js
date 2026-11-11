import { describe, expect, it } from 'vitest';
import { describirReferencia, estadoDeCanje, resultadoDelAjuste } from '../fidelizacionHelpers';

describe('resultadoDelAjuste', () => {
  it.each([
    ['sumar', '30', 150, 30],
    ['restar', '30', 90, -30],
    ['fijar', '30', 30, -90],
    ['fijar', '400', 400, 280],
    ['restar', '200', -80, -200],
  ])('%s %s sobre 120 deja %i (%i)', (modo, puntos, nuevo, delta) => {
    expect(resultadoDelAjuste(120, modo, puntos)).toEqual({ nuevo, delta });
  });

  it('lo escrito que no sirve da null', () => {
    expect(resultadoDelAjuste(120, 'sumar', '')).toBeNull();
    expect(resultadoDelAjuste(120, 'sumar', '-5')).toBeNull();
    expect(resultadoDelAjuste(120, 'sumar', '2.5')).toBeNull();
    expect(resultadoDelAjuste(120, 'sumar', 'abc')).toBeNull();
  });
});

describe('estadoDeCanje', () => {
  const activo = (puntos) => ({ activo: true, puntos_acumulados: puntos });

  it('puede canjear justo en el minimo y por encima', () => {
    expect(estadoDeCanje(activo(100), 100).id).toBe('canjea');
    expect(estadoDeCanje(activo(250), 100).id).toBe('canjea');
  });

  it('por debajo dice cuantos faltan', () => {
    expect(estadoDeCanje(activo(65), 100)).toMatchObject({ id: 'faltan', texto: 'Faltan 35 para canjear' });
  });

  it('un desactivado no canjea aunque tenga puntos', () => {
    expect(estadoDeCanje({ activo: false, puntos_acumulados: 500 }, 100).id).toBe('desactivado');
  });
});

describe('describirReferencia', () => {
  it('nombra la venta y deja vacio el ajuste manual', () => {
    expect(describirReferencia({ referencia_tipo: 'venta', referencia_id: 14 })).toBe('Venta #14');
    expect(describirReferencia({ referencia_tipo: 'otro', referencia_id: 3 })).toBe('Documento #3');
    expect(describirReferencia({ referencia_tipo: null, referencia_id: null })).toBe('');
  });
});
