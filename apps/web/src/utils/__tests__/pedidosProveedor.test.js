import { describe, expect, it } from 'vitest';
import {
  MAX_DESCRIPCION,
  cantidadSugerida,
  descripcionPedido,
  lineasDeDescripcion,
  mensajePedido,
  mensajeReenvio,
  montoDeItems,
} from '../pedidosProveedor';

const formatMoney = (valor) => `$ ${valor}`;

describe('cantidadSugerida', () => {
  it.each([
    [0, 10, 20],
    [4, 6, 8],
    [10, 5, 1], // ya pasa el doble del minimo: al menos 1
    [0, 0, 1],
  ])('stock %i, minimo %i -> pedir %i', (stock, minimo, esperado) => {
    expect(cantidadSugerida(stock, minimo)).toBe(esperado);
  });
});

describe('descripcionPedido y montoDeItems', () => {
  const items = [{ cantidad: 3, nombre: 'Pan', costo: 3500 }, { cantidad: 2, nombre: 'Ponqué', costo: 1200 }];

  it('une las lineas y calcula el monto', () => {
    expect(descripcionPedido(items)).toBe('3× Pan; 2× Ponqué');
    expect(montoDeItems(items)).toBe(12900);
  });

  it('si no cabe todo, corta y avisa cuantos productos faltan sin pasar del limite', () => {
    const muchos = Array.from({ length: 80 }, (_, i) => ({ cantidad: 1, nombre: `Producto con nombre largo numero ${i}`, costo: 1 }));

    const texto = descripcionPedido(muchos);

    expect(texto.length).toBeLessThanOrEqual(MAX_DESCRIPCION);
    expect(texto).toMatch(/… y \d+ más$/);
  });
});

describe('lineasDeDescripcion', () => {
  it('lee el formato actual y el anterior', () => {
    expect(lineasDeDescripcion('3× Pan; 2× Ponqué')).toEqual(['3× Pan', '2× Ponqué']);
    expect(lineasDeDescripcion('- 3× Pan ($ 3.500)\n- 2× Ponqué ($ 1.200)')).toEqual(['3× Pan ($ 3.500)', '2× Ponqué ($ 1.200)']);
    expect(lineasDeDescripcion(null)).toEqual([]);
  });
});

describe('mensajes', () => {
  it('el mensaje de un pedido nuevo lista cada producto y el valor estimado', () => {
    const lineas = mensajePedido({ proveedor: 'Robocop', items: [{ cantidad: 3, nombre: 'Pan' }], pedidoId: 9, monto: 10500, formatMoney });

    expect(lineas).toContain('Hola Robocop, un saludo de Tienda Angelly.');
    expect(lineas).toContain('Quisiera hacer el pedido #9:');
    expect(lineas).toContain('- 3× Pan');
    expect(lineas).toContain('Valor estimado: $ 10500');
  });

  it('reenviar arma el mismo mensaje desde la descripcion guardada, saludando al contacto', () => {
    const pedido = { id: 5, proveedor_nombre: 'Bimbo', descripcion: '3× Pan; 2× Ponqué', monto_estimado: 12900 };

    const lineas = mensajeReenvio({ pedido, proveedor: { nombre: 'Bimbo', contacto: 'Robocop' }, formatMoney });

    expect(lineas[0]).toBe('Hola Robocop, un saludo de Tienda Angelly.');
    expect(lineas).toContain('Quisiera hacer el pedido #5:');
    expect(lineas).toContain('- 3× Pan');
    expect(lineas).toContain('- 2× Ponqué');
    expect(lineas.indexOf('- 2× Ponqué')).toBeLessThan(lineas.indexOf('Valor estimado: $ 12900'));
  });

  it('sin contacto saluda al nombre del proveedor', () => {
    const pedido = { id: 5, proveedor_nombre: 'Bimbo', descripcion: '1× Pan', monto_estimado: 1 };

    expect(mensajeReenvio({ pedido, proveedor: null, formatMoney })[0]).toBe('Hola Bimbo, un saludo de Tienda Angelly.');
  });
});
