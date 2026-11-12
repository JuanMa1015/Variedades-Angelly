import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../httpClient', () => http);

import { buscarPorCodigo, fetchProductos, fetchReposicion, fetchResumenInventario } from '../inventarioApi';

const url = () => http.apiGet.mock.calls.at(-1)[0];

describe('inventarioApi: catalogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.apiGet.mockResolvedValue({ data: [], page: {} });
  });

  it('sin indicarlo, todo es del catalogo de tienda', async () => {
    await fetchProductos();
    expect(url()).toContain('catalogo=tienda');
    await fetchResumenInventario();
    expect(url()).toContain('resumen?catalogo=tienda');
    await fetchReposicion();
    expect(url()).toContain('reposicion?catalogo=tienda');
  });

  it('cartera pide su propio catalogo en la lista, el resumen, la reposicion y la busqueda por codigo', async () => {
    await fetchProductos({ catalogo: 'cartera', q: 'bolso' });
    expect(url()).toContain('catalogo=cartera');
    expect(url()).toContain('q=bolso');
    await fetchResumenInventario({ catalogo: 'cartera' });
    expect(url()).toContain('resumen?catalogo=cartera');
    await fetchReposicion({ catalogo: 'cartera' });
    expect(url()).toContain('reposicion?catalogo=cartera');
    await buscarPorCodigo('7701', 'cartera');
    expect(url()).toContain('catalogo=cartera');
  });
});
