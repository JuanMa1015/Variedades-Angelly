import { describe, it, expect } from 'vitest';
import { formatMoney, formatDateTime, formatDate } from '../format';

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
