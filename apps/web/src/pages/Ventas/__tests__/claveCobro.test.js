import { beforeEach, describe, expect, it } from 'vitest';
import { claveParaCobro, olvidarClaveCobro } from '../claveCobro';

describe('claveParaCobro', () => {
  beforeEach(() => window.localStorage.clear());

  it('el mismo cobro reutiliza la clave y uno distinto genera otra', () => {
    const a = { items: [{ producto_id: 1, cantidad: 2 }], metodo_pago: 'efectivo' };
    const b = { items: [{ producto_id: 1, cantidad: 3 }], metodo_pago: 'efectivo' };

    const primera = claveParaCobro(a);

    expect(claveParaCobro(a)).toBe(primera);
    expect(claveParaCobro(b)).not.toBe(primera);
  });

  it('cumple el formato que acepta el servidor', () => {
    expect(claveParaCobro({ x: 1 })).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('olvidarla obliga a una clave nueva y sobrevive a recargar la pagina', () => {
    const cobro = { items: [{ producto_id: 7, cantidad: 1 }] };
    const clave = claveParaCobro(cobro);
    expect(JSON.parse(window.localStorage.getItem('angelly.pos.cobro.v1')).clave).toBe(clave); // guardada: sobrevive a recargar

    olvidarClaveCobro();

    expect(claveParaCobro(cobro)).not.toBe(clave);
  });
});
