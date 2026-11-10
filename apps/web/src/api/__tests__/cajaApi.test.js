import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVentasPorRango } from '../cajaApi';

afterEach(() => vi.restoreAllMocks());

describe('fetchVentasPorRango', () => {
  it('no incluye las ventas anuladas en las ventas del turno', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ venta_id: 1, anulada: false }, { venta_id: 2, anulada: true }],
    }));

    const ventas = await fetchVentasPorRango({ fecha_desde: '2026-11-10T00:00:00Z' });

    expect(ventas).toEqual([{ venta_id: 1, anulada: false }]);
  });
});
