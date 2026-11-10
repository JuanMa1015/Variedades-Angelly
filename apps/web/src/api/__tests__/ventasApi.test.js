import { afterEach, describe, expect, it, vi } from 'vitest';
import { anularVenta, fetchVentasRecientes } from '../ventasApi';

afterEach(() => vi.restoreAllMocks());

const respuesta = (json) => ({ ok: true, status: 200, json: async () => json });

describe('ventasApi', () => {
  it('pide las ventas mas recientes y devuelve la lista', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta({ data: [{ venta_id: 1 }], page: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const ventas = await fetchVentasRecientes({ limit: 5 });

    expect(ventas).toEqual([{ venta_id: 1 }]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/ventas\/paginadas\?page=1&limit=5$/);
  });

  it('anular envia el motivo y la autorizacion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta({ venta_id: 3, anulada: true }));
    vi.stubGlobal('fetch', fetchMock);

    await anularVenta(3, { motivo: 'Error', autorizadorUsuario: 'admin', autorizadorPassword: 'clave' });

    const [endpoint, opciones] = fetchMock.mock.calls[0];
    expect(endpoint).toMatch(/\/api\/ventas\/3\/anular$/);
    expect(JSON.parse(opciones.body)).toEqual({ motivo: 'Error', autorizador_usuario: 'admin', autorizador_password: 'clave' });
  });

  it('sin autorizacion manda nulos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta({}));
    vi.stubGlobal('fetch', fetchMock);

    await anularVenta(3, { motivo: 'Error' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ motivo: 'Error', autorizador_usuario: null, autorizador_password: null });
  });
});
