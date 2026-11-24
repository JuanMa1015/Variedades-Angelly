import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock('../httpClient', () => ({ apiDelete: vi.fn(), apiGet: vi.fn(), apiPatch: vi.fn(), apiPost: http.apiPost }));

import { saveCarteraAbono, saveCarteraVenta } from '../carteraApi';

const cuerpoEnviado = (n) => http.apiPost.mock.calls[n][1];

describe('cobros de cartera con clave de idempotencia', () => {
  beforeEach(() => {
    window.localStorage.clear();
    http.apiPost.mockReset().mockResolvedValue({ id: 1 });
  });

  it('el abono lleva una clave valida y la conserva el contenido', async () => {
    await saveCarteraAbono({ clienteId: 4, payload: { monto: 3000, metodo_pago: 'efectivo' } });

    expect(http.apiPost).toHaveBeenCalledWith('/api/cartera/clientes/4/abonos', expect.objectContaining({ monto: 3000, metodo_pago: 'efectivo' }));
    expect(cuerpoEnviado(0).clave_idempotencia).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('si el abono falla por la conexion, reintentarlo reutiliza la clave; cambiar el monto la renueva', async () => {
    http.apiPost.mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(saveCarteraAbono({ clienteId: 4, payload: { monto: 3000 } })).rejects.toThrow('Failed to fetch');
    await saveCarteraAbono({ clienteId: 4, payload: { monto: 3000 } });
    http.apiPost.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(saveCarteraAbono({ clienteId: 4, payload: { monto: 5000 } })).rejects.toThrow();

    expect(cuerpoEnviado(1).clave_idempotencia).toBe(cuerpoEnviado(0).clave_idempotencia);
    expect(cuerpoEnviado(2).clave_idempotencia).not.toBe(cuerpoEnviado(0).clave_idempotencia);
  });

  it('un abono logrado olvida su clave: el siguiente igual es otro cobro', async () => {
    await saveCarteraAbono({ clienteId: 4, payload: { monto: 3000 } });
    await saveCarteraAbono({ clienteId: 4, payload: { monto: 3000 } });

    expect(cuerpoEnviado(1).clave_idempotencia).not.toBe(cuerpoEnviado(0).clave_idempotencia);
  });

  it('el abono a un cliente y a otro, con el mismo monto, son cobros distintos', async () => {
    http.apiPost.mockRejectedValue(new Error('Failed to fetch'));

    await expect(saveCarteraAbono({ clienteId: 4, payload: { monto: 3000 } })).rejects.toThrow();
    await expect(saveCarteraAbono({ clienteId: 5, payload: { monto: 3000 } })).rejects.toThrow();

    expect(cuerpoEnviado(1).clave_idempotencia).not.toBe(cuerpoEnviado(0).clave_idempotencia);
  });

  it('la venta de cartera tiene su propia clave, separada de la de los abonos', async () => {
    http.apiPost.mockRejectedValue(new Error('Failed to fetch'));
    const venta = { cliente_id: 4, items: [{ producto_id: 1, cantidad: 2 }] };

    await expect(saveCarteraVenta(venta)).rejects.toThrow();
    await expect(saveCarteraAbono({ clienteId: 4, payload: { monto: 1000 } })).rejects.toThrow();
    await expect(saveCarteraVenta(venta)).rejects.toThrow();

    expect(http.apiPost.mock.calls[0][0]).toBe('/api/cartera/ventas');
    expect(cuerpoEnviado(2).clave_idempotencia).toBe(cuerpoEnviado(0).clave_idempotencia); // la venta reintentada conserva su clave
    expect(cuerpoEnviado(1).clave_idempotencia).not.toBe(cuerpoEnviado(0).clave_idempotencia);
  });
});
