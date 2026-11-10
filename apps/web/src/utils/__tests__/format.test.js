import { describe, it, expect } from 'vitest';
import { formatMoney, formatDateTime, formatDate, parseApiDate } from '../format';
import { PAYMENT_METHODS, paymentLabel } from '../paymentMethods';

describe('formatMoney', () => {
  it('formats a number as COP currency', () => {
    const result = formatMoney(15000);
    expect(result).toContain('15.000');
  });

  it('handles zero', () => {
    expect(formatMoney(0)).toMatch(/0/);
  });

  it('handles null/undefined', () => {
    expect(formatMoney(null)).toMatch(/0/);
    expect(formatMoney(undefined)).toMatch(/0/);
  });

  it('handles string numbers', () => {
    expect(formatMoney('25000')).toMatch(/25\.000/);
  });
});

describe('formatDateTime', () => {
  it('formats a valid date string', () => {
    const result = formatDateTime('2026-05-27T10:30:00');
    expect(result).toContain('2026');
    expect(result).toContain('30');
  });

  it('returns "-" for null input', () => {
    expect(formatDateTime(null)).toBe('-');
  });

  it('returns "-" for undefined input', () => {
    expect(formatDateTime(undefined)).toBe('-');
  });

  it('returns "-" for invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('-');
  });
});

describe('formatDate', () => {
  it('formats a valid date string', () => {
    const result = formatDate('2026-05-27T10:30:00');
    expect(result).toContain('2026');
    expect(result).toContain('30');
  });

  it('returns "" for empty input', () => {
    expect(formatDate('')).toBe('');
  });

  it('returns a string for null input', () => {
    const result = formatDate(null);
    expect(typeof result).toBe('string');
  });
});

describe('parseApiDate', () => {
  it('toma como UTC las fechas del servidor que vienen sin zona', () => {
    expect(parseApiDate('2026-11-09T22:18:45').toISOString()).toBe('2026-11-09T22:18:45.000Z');
  });

  it('respeta las fechas que ya traen zona', () => {
    expect(parseApiDate('2026-11-09T22:18:45Z').toISOString()).toBe('2026-11-09T22:18:45.000Z');
    expect(parseApiDate('2026-11-09T17:18:45-05:00').toISOString()).toBe('2026-11-09T22:18:45.000Z');
  });

  it('deja pasar un Date o un texto sin forma de fecha', () => {
    const fecha = new Date('2026-01-01T00:00:00Z');
    expect(parseApiDate(fecha)).toBe(fecha);
    expect(Number.isNaN(parseApiDate('no es fecha').getTime())).toBe(true);
  });
});

describe('formatDateTime con fechas del servidor', () => {
  it('muestra la hora de Colombia (UTC-5), no la hora UTC', () => {
    // 22:18 UTC = 5:18 p. m. en Colombia
    expect(formatDateTime('2026-11-09T22:18:45')).toMatch(/0?5:18/);
  });
});

describe('medios de pago', () => {
  it('son efectivo, transferencia y tarjeta', () => {
    expect(PAYMENT_METHODS.map((m) => m.id)).toEqual(['efectivo', 'transferencia', 'tarjeta']);
  });

  it('paymentLabel traduce y tolera valores raros', () => {
    expect(paymentLabel('tarjeta')).toBe('Tarjeta');
    expect(paymentLabel('otro')).toBe('otro');
    expect(paymentLabel(null)).toBe('-');
  });
});
