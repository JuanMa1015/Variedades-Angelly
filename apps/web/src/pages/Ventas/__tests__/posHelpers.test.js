import { describe, expect, it } from 'vitest';
import {
  buildSalePayload,
  emptyTicket,
  extractProductos,
  groupCartItems,
  looksLikeBarcode,
  mergeProductos,
  resolvePayment,
  suggestedPayments,
  validateSale,
} from '../posHelpers';

const productos = [
  { id: 1, nombre: 'Arroz', stock_actual: 5 },
  { id: 2, nombre: 'Aceite', stock_actual: 1 },
];

const ticketCon = (cambios = {}) => ({ ...emptyTicket(), ...cambios });

describe('looksLikeBarcode', () => {
  it.each([['770101', true], ['1234', true], ['123', false], ['arroz 500', false], ['', false]])('%s -> %s', (value, esperado) => {
    expect(looksLikeBarcode(value)).toBe(esperado);
  });
});

describe('mergeProductos / extractProductos', () => {
  it('no duplica ids y conserva la referencia si no hay nuevos', () => {
    const base = [{ id: 1 }];
    expect(mergeProductos(base, [{ id: 1 }])).toBe(base);
    expect(mergeProductos(base, [{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('acepta respuesta paginada, lista simple o basura', () => {
    expect(extractProductos({ data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(extractProductos([{ id: 2 }])).toEqual([{ id: 2 }]);
    expect(extractProductos(null)).toEqual([]);
  });
});

describe('groupCartItems', () => {
  it('agrupa lineas repetidas y descarta las invalidas', () => {
    const grouped = groupCartItems([
      { producto_id: '1', cantidad: 2 },
      { producto_id: 1, cantidad: 3 },
      { producto_id: 'x', cantidad: 1 },
      { producto_id: 2, cantidad: 0 },
      { producto_id: 2, cantidad: 1.5 },
    ]);
    expect(Array.from(grouped.entries())).toEqual([[1, 5]]);
  });
});

describe('resolvePayment', () => {
  it('vacio o 0 en efectivo significa pago exacto', () => {
    expect(resolvePayment({ metodoPago: 'efectivo', montoPago: '0', total: 5000 })).toBe(5000);
    expect(resolvePayment({ metodoPago: 'efectivo', montoPago: 10000, total: 5000 })).toBe(10000);
  });

  it('Nequi y tarjeta cobran siempre el total exacto', () => {
    expect(resolvePayment({ metodoPago: 'nequi', montoPago: 99999, total: 5000 })).toBe(5000);
    expect(resolvePayment({ metodoPago: 'tarjeta', montoPago: 0, total: 5000 })).toBe(5000);
  });
});

describe('validateSale', () => {
  const grouped = (...pares) => new Map(pares);

  it('exige al menos un producto', () => {
    expect(validateSale({ grouped: grouped(), productos, ticket: ticketCon(), total: 0 })).toMatch(/al menos un producto/);
  });

  it('rechaza cantidades mayores al stock', () => {
    expect(validateSale({ grouped: grouped([2, 3]), productos, ticket: ticketCon(), total: 100 })).toMatch(/Stock insuficiente para "Aceite"/);
  });

  it('contado: el efectivo recibido no puede ser menor al total, pero vacio es valido', () => {
    const base = { grouped: grouped([1, 1]), productos, total: 5000 };
    expect(validateSale({ ...base, ticket: ticketCon({ montoPago: 3000 }) })).toMatch(/menor al total/);
    expect(validateSale({ ...base, ticket: ticketCon({ montoPago: '0' }) })).toBeNull();
    expect(validateSale({ ...base, ticket: ticketCon({ montoPago: 5000 }) })).toBeNull();
  });

  it('fiado: pide cliente y valida el abono', () => {
    const base = { grouped: grouped([1, 1]), productos, total: 5000 };
    const fiado = { esFiado: true };
    expect(validateSale({ ...base, ticket: ticketCon(fiado) })).toMatch(/Selecciona el cliente/);
    expect(validateSale({ ...base, ticket: ticketCon({ ...fiado, clienteTiendaId: '3', abonoInicialFiado: 6000 }) })).toMatch(/no puede superar/);
    expect(validateSale({ ...base, ticket: ticketCon({ ...fiado, clienteTiendaId: '3', abonoInicialFiado: 2000 }) })).toBeNull();
  });
});

describe('buildSalePayload', () => {
  const grouped = new Map([[1, 2]]);

  it('contado en efectivo', () => {
    expect(buildSalePayload({ grouped, ticket: ticketCon() })).toEqual({
      items: [{ producto_id: 1, cantidad: 2 }],
      es_fiado: false,
      metodo_pago: 'efectivo',
    });
  });

  it('Nequi viaja como transferencia y la tarjeta como tarjeta', () => {
    expect(buildSalePayload({ grouped, ticket: ticketCon({ metodoPago: 'nequi' }) }).metodo_pago).toBe('transferencia');
    expect(buildSalePayload({ grouped, ticket: ticketCon({ metodoPago: 'tarjeta' }) }).metodo_pago).toBe('tarjeta');
  });

  it('fiado de tienda con abono y cliente de fidelizacion', () => {
    const payload = buildSalePayload({
      grouped,
      ticket: ticketCon({ esFiado: true, clienteTiendaId: '9', abonoInicialFiado: '1500', clienteFidelizacionId: '4' }),
    });
    expect(payload).toMatchObject({
      es_fiado: true,
      fiado_origen: 'tienda',
      cliente_tienda_id: 9,
      abono_inicial: 1500,
      cliente_fidelizacion_id: 4,
    });
  });
});

describe('suggestedPayments', () => {
  it('sugiere billetes que cubren el total, sin repetir y maximo tres', () => {
    expect(suggestedPayments(12300)).toEqual([15000, 20000, 50000]);
    expect(suggestedPayments(4000)).toEqual([5000, 10000, 20000]);
    expect(suggestedPayments(100000)).toEqual([]);
  });
});
