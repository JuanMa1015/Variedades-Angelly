import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const anularMock = vi.hoisted(() => vi.fn());

vi.mock('../../../api/ventasApi', () => ({ fetchVentasRecientes: fetchMock, anularVenta: anularMock }));

import AnularVentaForm from '../AnularVentaForm';
import HistorialVentasModal from '../HistorialVentasModal';
import { receiptFromVenta, sePuedeAnular } from '../historyHelpers';

const venta = (extra = {}) => ({
  venta_id: 7,
  cliente_id: null,
  cliente_nombre: null,
  es_fiado: false,
  metodo_pago: 'efectivo',
  total: 5000,
  saldo_pendiente: 0,
  fecha: '2026-11-10T15:30:00',
  puntos_otorgados: 5,
  anulada: false,
  detalles: [{ nombre_producto: 'Arroz', cantidad: 2, precio_unitario: 2500, subtotal: 5000 }],
  ...extra,
});

describe('historyHelpers', () => {
  it('arma el comprobante a partir de la venta guardada', () => {
    const receipt = receiptFromVenta(venta());

    expect(receipt).toMatchObject({ total: 5000, metodoPago: 'efectivo', pago: 5000, cambio: 0, esFiado: false, puntos: 5 });
    expect(receipt.items).toEqual([{ nombre: 'Arroz', cantidad: 2, precio: 2500, subtotal: 5000 }]);
  });

  it('en un fiado el abono es lo que ya se pago', () => {
    const receipt = receiptFromVenta(venta({ es_fiado: true, saldo_pendiente: 3000, cliente_nombre: 'Marta' }));

    expect(receipt).toMatchObject({ esFiado: true, abono: 2000, cliente: 'Marta' });
  });

  it('no se anula lo ya anulado ni las ventas de cartera', () => {
    expect(sePuedeAnular(venta())).toBe(true);
    expect(sePuedeAnular(venta({ anulada: true }))).toBe(false);
    expect(sePuedeAnular(venta({ cliente_id: 3 }))).toBe(false);
  });
});

describe('AnularVentaForm', () => {
  const renderForm = (props = {}) => {
    const onSubmit = vi.fn();
    render(<AnularVentaForm pideAutorizacion={false} saving={false} error="" onSubmit={onSubmit} onCancel={vi.fn()} {...props} />);
    return onSubmit;
  };

  it('exige un motivo antes de confirmar', () => {
    const onSubmit = renderForm();
    const confirmar = screen.getByRole('button', { name: 'Confirmar anulación' });
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'Error al digitar' } });
    fireEvent.click(confirmar);

    expect(onSubmit).toHaveBeenCalledWith({ motivo: 'Error al digitar', autorizadorUsuario: '', autorizadorPassword: '' });
  });

  it('quien no es administrador debe dar usuario y clave de uno', () => {
    const onSubmit = renderForm({ pideAutorizacion: true });
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'Producto dañado' } });
    expect(screen.getByRole('button', { name: 'Confirmar anulación' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Usuario del administrador'), { target: { value: 'angelly_admin' } });
    fireEvent.change(screen.getByLabelText('Clave del administrador'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    expect(onSubmit).toHaveBeenCalledWith({
      motivo: 'Producto dañado',
      autorizadorUsuario: 'angelly_admin',
      autorizadorPassword: 'secreta',
    });
  });

  it('muestra el error del servidor', () => {
    renderForm({ error: 'Autorizacion invalida' });
    expect(screen.getByRole('alert')).toHaveTextContent('Autorizacion invalida');
  });
});

describe('HistorialVentasModal', () => {
  beforeEach(() => vi.clearAllMocks());

  const abrir = (props = {}) => render(
    <HistorialVentasModal isOpen onClose={vi.fn()} role="vendedor" onPrint={vi.fn()} onChanged={vi.fn()} {...props} />,
  );

  it('lista las ventas y reimprime el comprobante', async () => {
    fetchMock.mockResolvedValue([venta()]);
    const onPrint = vi.fn();
    abrir({ onPrint });

    expect(await screen.findByText('#7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reimprimir/ }));

    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ total: 5000, puntos: 5 }));
  });

  it('una venta anulada muestra el motivo y no se puede reimprimir ni anular otra vez', async () => {
    fetchMock.mockResolvedValue([venta({ anulada: true, motivo_anulacion: 'Error al digitar', anulada_por: 'vendedor1', autorizada_por: 'angelly_admin' })]);
    abrir();

    expect(await screen.findByText(/Motivo: Error al digitar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reimprimir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anular/ })).not.toBeInTheDocument();
  });

  it('el vendedor anula con la clave de un administrador y se recarga el historial', async () => {
    fetchMock.mockResolvedValue([venta()]);
    anularMock.mockResolvedValue({});
    const onChanged = vi.fn();
    abrir({ onChanged });
    await screen.findByText('#7');

    fireEvent.click(screen.getByRole('button', { name: /^Anular/ }));
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'Error al digitar' } });
    fireEvent.change(screen.getByLabelText('Usuario del administrador'), { target: { value: 'angelly_admin' } });
    fireEvent.change(screen.getByLabelText('Clave del administrador'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() => expect(anularMock).toHaveBeenCalledWith(7, {
      motivo: 'Error al digitar',
      autorizadorUsuario: 'angelly_admin',
      autorizadorPassword: 'secreta',
    }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('el administrador anula sin pedir clave', async () => {
    fetchMock.mockResolvedValue([venta()]);
    abrir({ role: 'superadmin' });
    await screen.findByText('#7');

    fireEvent.click(screen.getByRole('button', { name: /^Anular/ }));

    expect(screen.queryByLabelText('Clave del administrador')).not.toBeInTheDocument();
  });

  it('si el servidor rechaza la anulación muestra el motivo', async () => {
    fetchMock.mockResolvedValue([venta()]);
    anularMock.mockRejectedValue(new Error('Autorizacion invalida'));
    abrir();
    await screen.findByText('#7');

    fireEvent.click(screen.getByRole('button', { name: /^Anular/ }));
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'Error al digitar' } });
    fireEvent.change(screen.getByLabelText('Usuario del administrador'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Clave del administrador'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    expect(await screen.findByText('Autorizacion invalida')).toBeInTheDocument();
  });

  it('al reabrir el historial no queda el formulario de anulación anterior', async () => {
    fetchMock.mockResolvedValue([venta()]);
    const props = { onClose: vi.fn(), role: 'vendedor', onPrint: vi.fn(), onChanged: vi.fn() };
    const { rerender } = render(<HistorialVentasModal isOpen {...props} />);
    await screen.findByText('#7');
    fireEvent.click(screen.getByRole('button', { name: /^Anular/ }));
    fireEvent.change(screen.getByLabelText('Clave del administrador'), { target: { value: 'secreta' } });

    rerender(<HistorialVentasModal isOpen={false} {...props} />);
    rerender(<HistorialVentasModal isOpen {...props} />);
    await screen.findByText('#7');

    expect(screen.queryByLabelText('Clave del administrador')).not.toBeInTheDocument();
  });

  it('avisa si no se pudo cargar', async () => {
    fetchMock.mockRejectedValue(new Error('Sin conexión'));
    abrir();

    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
  });
});
