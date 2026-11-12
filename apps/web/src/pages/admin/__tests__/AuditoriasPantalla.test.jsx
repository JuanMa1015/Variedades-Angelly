import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuditoriasPantalla from '../auditorias/AuditoriasPantalla';

const http = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('../../../api/httpClient', () => ({ apiGet: http.apiGet }));
vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));

const FILA = (n, extra = {}) => ({
  id: n, modulo: 'gastos', entidad: 'gasto', entidad_id: n, accion: 'crear', detalle: `pago ${n}`, usuario: 'vendedor1', fecha: '2026-01-05T15:00:00', ...extra,
});
const pagina = (data, total = data.length, totalPages = 1) => ({ data, page: { total, total_pages: totalPages, current_page: 1, limit: 20 } });
const ultima = () => http.apiGet.mock.calls.at(-1)[0];

describe('AuditoriasPantalla', () => {
  beforeEach(() => {
    http.apiGet.mockReset();
    http.apiGet.mockResolvedValue(pagina([FILA(1), FILA(2, { modulo: 'cartera', accion: 'anular', detalle: 'Maria Perez: error' })]));
  });

  it('lista el historial en tabla y tarjetas, sin botones para editar ni borrar', async () => {
    render(<AuditoriasPantalla />);

    expect((await screen.findAllByText('pago 1')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maria Perez: error').length).toBeGreaterThan(0);
    expect(screen.getByText('2 registros')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar|borrar|eliminar|crear/i })).not.toBeInTheDocument();
    expect(ultima()).toContain('/api/auditorias/paginadas?');
  });

  it('el modulo, la accion y las fechas viajan al servidor y vuelven a la pagina 1', async () => {
    render(<AuditoriasPantalla />);
    await screen.findAllByText('pago 1');

    fireEvent.change(screen.getByLabelText('Módulo'), { target: { value: 'cartera' } });
    await waitFor(() => expect(ultima()).toContain('modulo=cartera'));
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'anular' } });
    await waitFor(() => expect(ultima()).toContain('accion=anular'));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-01-31' } });

    await waitFor(() => expect(ultima()).toMatch(/desde=2026-01-01.*hasta=2026-01-31|hasta=2026-01-31.*desde=2026-01-01/));
    expect(ultima()).toContain('page=1');
  });

  it('la busqueda espera a que termines de escribir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<AuditoriasPantalla />);
      await screen.findAllByText('pago 1');
      const antes = http.apiGet.mock.calls.length;

      fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'maria' } });
      expect(http.apiGet.mock.calls.length).toBe(antes);
      await act(async () => { await vi.advanceTimersByTimeAsync(350); });

      await waitFor(() => expect(ultima()).toContain('q=maria'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('pagina con el total que dice el servidor y limpia los filtros', async () => {
    http.apiGet.mockResolvedValue(pagina([FILA(1)], 45, 3));
    render(<AuditoriasPantalla />);
    await screen.findAllByText('pago 1');

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(ultima()).toContain('page=2'));

    fireEvent.change(screen.getByLabelText('Módulo'), { target: { value: 'ventas' } });
    await waitFor(() => expect(ultima()).toContain('modulo=ventas'));
    fireEvent.click(screen.getByRole('button', { name: /Limpiar filtros/ }));
    await waitFor(() => expect(ultima()).not.toContain('modulo='));
    expect(ultima()).toContain('page=1');
  });

  it('si no hay resultados lo dice, y si el servidor falla muestra el error con Reintentar', async () => {
    http.apiGet.mockResolvedValueOnce(pagina([]));
    const { unmount } = render(<AuditoriasPantalla />);
    expect(await screen.findByText('Todavía no hay registros.')).toBeInTheDocument();
    unmount();

    http.apiGet.mockRejectedValueOnce(new Error('Servidor caido'));
    render(<AuditoriasPantalla />);
    expect(await screen.findByText('Servidor caido')).toBeInTheDocument();
    http.apiGet.mockResolvedValueOnce(pagina([FILA(9)]));
    fireEvent.click(within(document.body).getByRole('button', { name: 'Reintentar' }));
    expect((await screen.findAllByText('pago 9')).length).toBeGreaterThan(0);
  });
});
