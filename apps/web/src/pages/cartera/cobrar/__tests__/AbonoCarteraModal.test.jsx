import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ saveCarteraAbono: vi.fn() }));
vi.mock('../../../../api/carteraApi', () => api);
vi.mock('../../../../components/Modal', () => ({
  default: ({ isOpen, title, children }) => (isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null),
}));

import AbonoCarteraModal from '../AbonoCarteraModal';

const CLIENTE = { id: 4, nombre: 'Danilo', deuda_total: 50000 };

const abrir = (extra = {}) => {
  const props = { cliente: CLIENTE, onRegistrado: vi.fn().mockResolvedValue(undefined), onClose: vi.fn(), ...extra };
  render(<AbonoCarteraModal {...props} />);
  return props;
};
const escribir = (valor) => fireEvent.change(screen.getByLabelText('Monto del abono'), { target: { value: valor } });
const enviar = () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));

describe('AbonoCarteraModal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('no se muestra sin cliente', () => {
    abrir({ cliente: null });

    expect(screen.queryByTestId('modal')).toBeNull();
  });

  it('muestra la deuda y, al escribir, cuanto quedara debiendo', () => {
    abrir();

    expect(screen.getByText(/Deuda actual:/).textContent).toMatch(/\$\s50\.000/);
    escribir('20000');
    expect(screen.getByText(/Quedará debiendo/).textContent).toMatch(/\$\s30\.000/);
  });

  it('«Saldar toda la deuda» llena el monto completo', () => {
    abrir();

    fireEvent.click(screen.getByRole('button', { name: /Saldar toda la deuda/ }));

    expect(screen.getByLabelText('Monto del abono').value).toMatch(/50\.000/);
    expect(screen.getByText(/Quedará debiendo/).textContent).toMatch(/\$\s0/);
  });

  it('valida el monto dentro del cuadro, sin alert del navegador ni llamar al servidor', () => {
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {});
    abrir();

    enviar();
    expect(screen.getByRole('alert').textContent).toContain('monto válido mayor a 0');
    escribir('60000');
    enviar();
    expect(screen.getByRole('alert').textContent).toContain('no puede superar la deuda actual');
    expect(api.saveCarteraAbono).not.toHaveBeenCalled();
    expect(alerta).not.toHaveBeenCalled();
    alerta.mockRestore();
  });

  it('registra el abono con el medio de pago elegido, avisa a la pantalla y muestra el resultado', async () => {
    api.saveCarteraAbono.mockResolvedValue({ id: 9, monto: 20000, metodo_pago: 'transferencia', saldo_cliente: 30000 });
    const props = abrir();

    escribir('20000');
    fireEvent.click(screen.getByRole('radio', { name: /Transferencia/ }));
    enviar();

    await waitFor(() => expect(api.saveCarteraAbono).toHaveBeenCalledWith({ clienteId: 4, payload: { monto: 20000, metodo_pago: 'transferencia' } }));
    expect(await screen.findByText('Abono registrado')).toBeTruthy();
    expect(screen.getByText('Deuda anterior').nextElementSibling.textContent).toMatch(/\$\s50\.000/);
    expect(screen.getByText('Saldo pendiente').nextElementSibling.textContent).toMatch(/\$\s30\.000/);
    expect(props.onRegistrado).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('si el servidor lo rechaza muestra el motivo dentro del cuadro y deja reintentar', async () => {
    api.saveCarteraAbono.mockRejectedValue(new Error('El abono supera la deuda actual del cliente'));
    const props = abrir();

    escribir('20000');
    enviar();

    expect(await screen.findByText('El abono supera la deuda actual del cliente')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar abono' })).toBeEnabled();
    expect(props.onRegistrado).not.toHaveBeenCalled();
  });
});
