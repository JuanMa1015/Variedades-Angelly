import { describe, expect, it } from 'vitest';
import { buildWhatsappUrl, telefonoLegible, whatsappNumber } from '../whatsapp';

describe('telefonoLegible', () => {
  it.each([
    ['573001112233', '300 111 2233'],
    ['3001112233', '300 111 2233'],
    ['+57 300-111-2233', '300 111 2233'],
    ['1234567', '123 4567'],
    ['573109998877', '310 999 8877'],
  ])('%s se muestra como %s', (entrada, esperado) => {
    expect(telefonoLegible(entrada)).toBe(esperado);
  });

  it('vacio o nulo da texto vacio y un formato raro se deja igual', () => {
    expect(telefonoLegible(null)).toBe('');
    expect(telefonoLegible('')).toBe('');
    expect(telefonoLegible('12345')).toBe('12345');
  });
});

describe('whatsappNumber y buildWhatsappUrl', () => {
  it('arma el numero con 57 y descarta los que no sirven', () => {
    expect(whatsappNumber('300 111 2233')).toBe('573001112233');
    expect(whatsappNumber('573001112233')).toBe('573001112233');
    expect(whatsappNumber('1234567')).toBe('576011234567');
    expect(whatsappNumber('123')).toBe('');
  });

  it('el enlace lleva el mensaje codificado y es vacio si no hay telefono valido', () => {
    expect(buildWhatsappUrl('3001112233', ['Hola', 'Pedido #1'])).toBe('https://wa.me/573001112233?text=Hola%0APedido%20%231');
    expect(buildWhatsappUrl('', ['Hola'])).toBe('');
  });
});
