import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost } from '../httpClient';

const jsonResponse = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('httpClient reintentos', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('no reintenta un POST cuando el servidor responde 503 (evita ventas duplicadas)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { detail: 'caido' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiPost('/api/ventas', { items: [] })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no reintenta un POST ante un error de red', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiPost('/api/gastos', {})).rejects.toThrow('network');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un POST descarta el cache de lecturas para no mostrar stock viejo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1, stock_actual: 5 }]))
      .mockResolvedValueOnce(jsonResponse(201, {}))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1, stock_actual: 4 }]));
    vi.stubGlobal('fetch', fetchMock);

    const antes = await apiGet('/api/productos/cache-test');
    await apiPost('/api/ventas', {});
    const despues = await apiGet('/api/productos/cache-test');

    expect(antes[0].stock_actual).toBe(5);
    expect(despues[0].stock_actual).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
