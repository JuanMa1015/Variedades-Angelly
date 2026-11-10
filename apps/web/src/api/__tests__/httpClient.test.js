import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost, setAuthToken } from '../httpClient';

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

describe('httpClient token de acceso', () => {
  afterEach(() => {
    setAuthToken(null);
    vi.restoreAllMocks();
  });

  it('envia el token como Bearer ademas de la cookie (por si el navegador bloquea cookies de terceros)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken('token-abc');

    await apiGet('/api/auth-header-test');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-abc');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('sin token no envia Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken(null);

    await apiGet('/api/sin-token-test');

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('respeta un Authorization explicito', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken('token-abc');

    await apiGet('/api/explicito-test', { headers: { Authorization: 'Bearer otro' } });

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer otro');
  });
});
