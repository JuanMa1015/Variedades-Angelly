import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchVentasCartera: vi.fn(), anularVentaCartera: vi.fn() }));
vi.mock('../../../../api/carteraVentasApi', () => api);
vi.mock('../../../../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));
vi.mock('../../../../components/Modal', () => ({
  default: ({ isOpen, title, children }) => (isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null),
}));

import HistorialVentasCartera from '../HistorialVentasCartera';

const formatMoney = (v) => `$ ${Number(v).toLocaleString('es-CO')}`;
const venta = (extra = {}) => ({
  venta_id: 7, cliente_id: 1, cliente_nombre: 'Maria Perez', fecha: '2026-11-10T15:00:00', total: 6000, es_fiado: true, metodo_pago: 'efectivo',
  abono_inicial: 1000, saldo_cliente: 5000, anulada: false, motivo_anulacion: null, anulada_por: null, creado_por: 'angelly_admin', anulable: true,
  lineas: [{ nombre_producto: 'Arroz', cantidad: 3, precio_unitario: 2000, subtotal: 6000 }], ...extra,
});
const pagina = (data, totalPages = 1) => ({ data, page: { total: data.length, total_pages: totalPages, current_page: 1, limit: 10 } });
const ultima = () => api.fetchVentasCartera.mock.calls.at(-1)[0];

const abrir = async ({ ventas = [venta()], totalPages = 1, onCambio = vi.fn() } = {}) => {
  api.fetchVentasCartera.mockResolvedValue(pagina(ventas, totalPages));
  render(<HistorialVentasCartera abierto onClose={vi.fn()} formatMoney={formatMoney} onCambio={onCambio} />);
  await waitFor(() => expect(api.fetchVentasCartera).toHaveBeenCalled());
  if (ventas.length) await screen.findByText(/#7 · Maria Perez/);
  return { onCambio };
};

describe('HistorialVentasCartera', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('pide la primera pagina de todas las ventas y muestra cliente, etiqueta y total', async () => {
    await abrir();

    expect(ultima()).toMatchObject({ page: 1, limit: 10, estado: 'todas', q: '', desde: '', hasta: '' });
    const fila = screen.getByRole('button', { name: 'Ver detalle de la venta 7' });
    expect(within(fila).getByText('Fiado')).toBeTruthy();
    expect(screen.getByText('$ 6.000')).toBeTruthy();
  });

  it('buscar escribiendo, filtrar y poner fechas se piden al servidor', async () => {
    await abrir();

    fireEvent.change(screen.getByLabelText('Buscar venta'), { target: { value: '#7' } });
    await waitFor(() => expect(ultima()).toMatchObject({ q: '#7', page: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Anuladas' }));
    await waitFor(() => expect(ultima().estado).toBe('anuladas'));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(ultima().desde).toBe('2026-11-01'));
    expect(screen.getByRole('button', { name: 'Anuladas' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('la paginacion pide la pagina siguiente', async () => {
    await abrir({ totalPages: 3 });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(ultima().page).toBe(2));
  });

  it('sin ventas y sin resultados se explican distinto', async () => {
    await abrir({ ventas: [] });
    expect(await screen.findByText('No hay ventas de cartera registradas.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Contado' }));

    expect(await screen.findByText('No se encontraron ventas con ese criterio.')).toBeTruthy();
  });

  it('al abrir una venta se ven sus lineas, el abono inicial y lo que debia el cliente', async () => {
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la venta 7' }));

    expect(screen.getByText(/3 × Arroz/)).toBeTruthy();
    expect(screen.getByText('Abono inicial: $ 1.000')).toBeTruthy();
    expect(screen.getByText('Debía en total después de esta venta: $ 5.000')).toBeTruthy();
    expect(screen.getByText('Registró: angelly_admin')).toBeTruthy();
  });

  it('una venta vieja sin abono enlazado no inventa el abono inicial', async () => {
    await abrir({ ventas: [venta({ abono_inicial: null })] });

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la venta 7' }));

    expect(screen.queryByText(/Abono inicial/)).toBeNull();
  });

  it('anular exige un motivo, llama al servidor y recarga', async () => {
    api.anularVentaCartera.mockResolvedValue({});
    const { onCambio } = await abrir();
    const antes = api.fetchVentasCartera.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la venta 7' }));

    fireEvent.click(screen.getByRole('button', { name: 'Anular venta 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(screen.getByText('Explica el motivo (mínimo 3 letras)')).toBeTruthy();
    expect(api.anularVentaCartera).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: '  Se digitó mal ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() => expect(api.anularVentaCartera).toHaveBeenCalledWith(7, 'Se digitó mal'));
    expect(await screen.findByText(/Venta #7 anulada/)).toBeTruthy();
    await waitFor(() => expect(api.fetchVentasCartera.mock.calls.length).toBeGreaterThan(antes));
    expect(onCambio).toHaveBeenCalled();
  });

  it('si el servidor rechaza la anulacion muestra el motivo y deja reintentar', async () => {
    api.anularVentaCartera.mockRejectedValue(new Error('El cliente ya abono: debe 0 y esta venta dejo 5000.'));
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la venta 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta 7' }));
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'Error' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    expect(await screen.findByText(/El cliente ya abono/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar anulación' })).toBeEnabled();
  });

  it('una venta anulada muestra por quien y por que, y no ofrece anular de nuevo', async () => {
    await abrir({ ventas: [venta({ anulada: true, anulable: false, anulada_por: 'angelly_admin', motivo_anulacion: 'Se digitó mal' })] });

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la venta 7' }));

    expect(screen.getAllByText('Anulada').length).toBeGreaterThan(0);
    expect(screen.getByText(/Anulada por angelly_admin: Se digitó mal/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anular venta 7' })).toBeNull();
  });

  it('una venta del punto de venta no ofrece anular', async () => {
    await abrir({ ventas: [venta({ anulable: false })] });

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la venta 7' }));

    expect(screen.queryByRole('button', { name: 'Anular venta 7' })).toBeNull();
  });

  it('si falla la carga muestra el error', async () => {
    api.fetchVentasCartera.mockRejectedValue(new Error('No fue posible cargar el historial'));
    render(<HistorialVentasCartera abierto onClose={vi.fn()} formatMoney={formatMoney} />);

    expect(await within(await screen.findByTestId('modal')).findByText('No fue posible cargar el historial')).toBeTruthy();
  });
});
