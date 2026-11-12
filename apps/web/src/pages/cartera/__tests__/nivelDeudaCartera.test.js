import { describe, expect, it } from 'vitest';
import { nivelDeudaCartera, textoAntiguedad } from '../nivelDeudaCartera';

describe('nivelDeudaCartera', () => {
  it('usa el semaforo del servidor aunque el monto diga otra cosa', () => {
    expect(nivelDeudaCartera({ estado_deuda: 'al_dia', deuda_total: 900000 }).label).toBe('Al día');
    expect(nivelDeudaCartera({ estado_deuda: 'moroso', deuda_total: 5000 }).label).toBe('Moroso');
    expect(nivelDeudaCartera({ estado_deuda: 'alerta', deuda_total: 5000 }).label).toBe('Alerta');
    expect(nivelDeudaCartera({ estado_deuda: 'sin_deuda', deuda_total: 0 }).label).toBe('Sin deuda');
  });

  it('si el servidor no lo envia, vuelve al monto de siempre', () => {
    expect(nivelDeudaCartera({ deuda_total: 0 }).label).toBe('Sin deuda');
    expect(nivelDeudaCartera({ deuda_total: 200000 }).label).toBe('Al día');
    expect(nivelDeudaCartera({ deuda_total: 300000 }).label).toBe('Alerta');
    expect(nivelDeudaCartera({ deuda_total: 522800 }).label).toBe('Moroso');
  });
});

describe('textoAntiguedad', () => {
  it('dice desde cuando se debe', () => {
    expect(textoAntiguedad({ deuda_total: 100, dias_deuda: 0 })).toBe('Debe desde hoy');
    expect(textoAntiguedad({ deuda_total: 100, dias_deuda: 1 })).toBe('Debe hace 1 día');
    expect(textoAntiguedad({ deuda_total: 100, dias_deuda: 75 })).toBe('Debe hace 75 días');
  });

  it('no dice nada sin deuda o sin fecha que juzgar', () => {
    expect(textoAntiguedad({ deuda_total: 0, dias_deuda: 5 })).toBe('');
    expect(textoAntiguedad({ deuda_total: 100, dias_deuda: null })).toBe('');
  });
});
