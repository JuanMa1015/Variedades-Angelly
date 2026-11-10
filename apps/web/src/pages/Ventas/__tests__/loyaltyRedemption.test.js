import { describe, expect, it } from 'vitest';
import { loyaltyRedemption } from '../posHelpers';
import { receiptFromVenta } from '../historyHelpers';

const config = { valor_punto: 20, umbral_bono: 100 };

describe('loyaltyRedemption', () => {
  it('usa todos los puntos que caben cuando el cliente decide canjear', () => {
    const r = loyaltyRedemption({ cliente: { puntos_acumulados: 300 }, config, subtotal: 19600, usar: true });
    expect(r).toEqual({ maxPuntos: 300, puntos: 300, descuento: 6000 });
  });

  it('nunca descuenta mas que el subtotal', () => {
    const r = loyaltyRedemption({ cliente: { puntos_acumulados: 900 }, config, subtotal: 9800, usar: true });
    expect(r).toMatchObject({ maxPuntos: 490, descuento: 9800 });
  });

  it('sin marcar usar no hay descuento, pero informa el maximo', () => {
    const r = loyaltyRedemption({ cliente: { puntos_acumulados: 300 }, config, subtotal: 19600, usar: false });
    expect(r).toEqual({ maxPuntos: 300, puntos: 0, descuento: 0 });
  });

  it('por debajo del minimo, sin cliente o sin valor de punto no hay canje', () => {
    expect(loyaltyRedemption({ cliente: { puntos_acumulados: 99 }, config, subtotal: 5000, usar: true }).maxPuntos).toBe(0);
    expect(loyaltyRedemption({ cliente: undefined, config, subtotal: 5000, usar: true }).maxPuntos).toBe(0);
    expect(loyaltyRedemption({ cliente: { puntos_acumulados: 500 }, config: {}, subtotal: 5000, usar: true }).maxPuntos).toBe(0);
  });
});

describe('reimpresion con descuento y monto recibido', () => {
  it('conserva el pago, el cambio real y el descuento', () => {
    const receipt = receiptFromVenta({
      total: 8000,
      monto_recibido: 10000,
      descuento_puntos: 2000,
      puntos_canjeados: 100,
      es_fiado: false,
      saldo_pendiente: 0,
      fecha: '2026-11-10T15:00:00',
      detalles: [],
    });
    expect(receipt).toMatchObject({ pago: 10000, cambio: 2000, descuento: 2000, puntosCanjeados: 100 });
  });
});
