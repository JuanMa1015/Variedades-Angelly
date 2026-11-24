import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchCarteraMovimientos: vi.fn() }));
vi.mock('../../api/carteraApi', () => ({ fetchCarteraMovimientos: api.fetchCarteraMovimientos }));

import VerDetalleModal from '../VerDetalleModal';

const cliente = { id: 4, nombre: 'Maria Perez', deuda_total: 45000 };
const MOVIMIENTOS = [
  { id: 1, tipo: 'Venta', descripcion: 'Venta #12', articulo: 'Bolso de mano', cantidad: 2, referencia: null, monto: 90000, fecha: '2026-03-10T15:00:00', saldo: 90000 },
  { id: 2, tipo: 'Abono', descripcion: null, articulo: null, cantidad: null, referencia: 'Efectivo', monto: 45000, fecha: '2026-03-12T15:00:00', saldo: 45000 },
];

const abrir = (props = {}) => render(<VerDetalleModal cliente={cliente} isOpen onClose={vi.fn()} {...props} />);

describe('VerDetalleModal', () => {
  beforeEach(() => {
    api.fetchCarteraMovimientos.mockReset().mockResolvedValue({ data: MOVIMIENTOS, total_pages: 1 });
  });

  it('muestra el saldo y cada movimiento, en tabla (escritorio) y en tarjetas (celular)', async () => {
    abrir();

    expect(screen.getByText('Detalles del Cliente')).toBeInTheDocument();
    expect(screen.getByText('Maria Perez')).toBeInTheDocument();
    expect(screen.getByText('$45.000', { selector: 'p' })).toBeInTheDocument(); // saldo pendiente
    expect(await screen.findAllByText('Bolso de mano x2')).toHaveLength(2); // una vez en la tabla y otra en la tarjeta
    expect(api.fetchCarteraMovimientos).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 4, page: 1, limit: 5 }));
    const tarjetas = within(screen.getAllByRole('list')[0]);
    expect(tarjetas.getAllByRole('listitem')).toHaveLength(2);
    expect(tarjetas.getByText('Venta')).toBeInTheDocument();
    expect(tarjetas.getByText('Abono')).toBeInTheDocument();
    expect(tarjetas.getByText('Ref: Efectivo')).toBeInTheDocument();
    expect(tarjetas.getAllByText(/Saldo/)).toHaveLength(2);
  });

  it('la tabla se oculta en el celular y las tarjetas en el escritorio', async () => {
    abrir();
    await screen.findAllByText('Bolso de mano x2');

    expect(screen.getByRole('table').parentElement.className).toMatch(/hidden .*md:block/);
    expect(screen.getAllByRole('list')[0].className).toMatch(/md:hidden/);
  });

  it('avisa cuando no hay movimientos y cuando falla la carga', async () => {
    api.fetchCarteraMovimientos.mockResolvedValueOnce({ data: [], total_pages: 1 });
    const { unmount } = abrir();
    expect(await screen.findByText('Este cliente no tiene movimientos registrados.')).toBeInTheDocument();
    unmount();

    api.fetchCarteraMovimientos.mockRejectedValueOnce(new Error('sin red'));
    abrir();
    expect(await screen.findByText('No fue posible cargar los movimientos del cliente')).toBeInTheDocument();
    expect(screen.queryByText('Este cliente no tiene movimientos registrados.')).not.toBeInTheDocument();
  });

  it('pagina los movimientos y se cierra con la X o con Cerrar', async () => {
    api.fetchCarteraMovimientos.mockResolvedValue({ data: MOVIMIENTOS, total_pages: 3 });
    const onClose = vi.fn();
    abrir({ onClose });
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(api.fetchCarteraMovimientos).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    await waitFor(() => expect(screen.getByText('Página 1 de 3')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByRole('button', { name: /cerrar modal/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('cerrado no muestra nada ni pide datos', () => {
    const { container } = render(<VerDetalleModal cliente={cliente} isOpen={false} onClose={vi.fn()} />);

    expect(container.innerHTML).toBe('');
    expect(api.fetchCarteraMovimientos).not.toHaveBeenCalled();
  });
});
