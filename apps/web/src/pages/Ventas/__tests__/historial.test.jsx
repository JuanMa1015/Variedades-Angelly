import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const anularMock = vi.hoisted(() => vi.fn());
const devolverMock = vi.hoisted(() => vi.fn());

vi.mock('../../../api/ventasApi', () => ({ fetchVentasRecientes: fetchMock, anularVenta: anularMock, devolverProductos: devolverMock }));

import AnularVentaForm from '../AnularVentaForm';
import DevolverVentaForm from '../DevolverVentaForm';
import HistorialVentasModal from '../HistorialVentasModal';
import { productosPorDevolver, receiptFromVenta, sePuedeAnular, sePuedeDevolver, valorDeDevolucion } from '../historyHelpers';

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
  detalles: [{ producto_id: 1, nombre_producto: 'Arroz', cantidad: 2, precio_unitario: 2500, subtotal: 5000, cantidad_devuelta: 0 }],
  total_devuelto: 0,
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

describe('devoluciones: ayudas', () => {
  const tres = venta({
    total: 9000,
    detalles: [
      { producto_id: 1, nombre_producto: 'Arroz', cantidad: 4, precio_unitario: 2000, subtotal: 8000, cantidad_devuelta: 1 },
      { producto_id: 2, nombre_producto: 'Sal', cantidad: 1, precio_unitario: 2000, subtotal: 2000, cantidad_devuelta: 0 },
    ],
    total_devuelto: 1800, // la venta tuvo $1.000 de descuento: 9.000 sobre 10.000
  });

  it('muestra solo lo que todavía se puede devolver', () => {
    expect(productosPorDevolver(tres).map((p) => [p.nombre, p.restante])).toEqual([['Arroz', 3], ['Sal', 1]]);
    expect(sePuedeDevolver(tres)).toBe(true);
    expect(sePuedeDevolver(venta({ anulada: true }))).toBe(false);
    expect(sePuedeDevolver(venta({ cliente_id: 3 }))).toBe(false);
    expect(sePuedeDevolver(venta({ detalles: [{ producto_id: 1, nombre_producto: 'Arroz', cantidad: 2, precio_unitario: 2500, subtotal: 5000, cantidad_devuelta: 2 }] }))).toBe(false);
  });

  it('el valor reparte el descuento de la venta y al devolver todo es exactamente lo que falta', () => {
    expect(valorDeDevolucion(tres, {})).toBe(0);
    expect(valorDeDevolucion(tres, { 1: 1 })).toBe(1800); // 2.000 x 0,9
    expect(valorDeDevolucion(tres, { 1: 3, 2: 1 })).toBe(7200); // 9.000 - 1.800 ya devueltos
  });

  it('una venta con devoluciones ya no se anula', () => {
    expect(sePuedeAnular(tres)).toBe(false);
    expect(sePuedeAnular(venta())).toBe(true);
  });
});

describe('DevolverVentaForm', () => {
  const dos = venta({
    total: 9000,
    detalles: [
      { producto_id: 1, nombre_producto: 'Arroz', cantidad: 3, precio_unitario: 2000, subtotal: 6000, cantidad_devuelta: 0 },
      { producto_id: 2, nombre_producto: 'Sal', cantidad: 2, precio_unitario: 1500, subtotal: 3000, cantidad_devuelta: 0 },
    ],
  });
  const renderForm = (props = {}) => {
    const onSubmit = vi.fn();
    render(<DevolverVentaForm venta={dos} pideAutorizacion={false} saving={false} error="" onSubmit={onSubmit} onCancel={vi.fn()} {...props} />);
    return onSubmit;
  };

  it('pide elegir productos y un motivo antes de confirmar', () => {
    const onSubmit = renderForm();
    const confirmar = screen.getByRole('button', { name: 'Confirmar devolución' });
    expect(confirmar).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Devolver una unidad más de Arroz'));
    expect(confirmar).toBeDisabled(); // falta el motivo
    fireEvent.change(screen.getByLabelText('Motivo de la devolución'), { target: { value: 'En mal estado' } });
    fireEvent.click(confirmar);

    expect(onSubmit).toHaveBeenCalledWith({ items: [{ producto_id: 1, cantidad: 1 }], motivo: 'En mal estado', autorizadorUsuario: '', autorizadorPassword: '' });
  });

  it('no deja devolver más de lo que quedó y muestra cuánto se devuelve', () => {
    renderForm();
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByLabelText('Devolver una unidad más de Sal'));

    expect(screen.getByLabelText('A devolver de Sal: 2')).toBeInTheDocument();
    expect(screen.getByText(/Se devolverán/)).toHaveTextContent('3.000'); // 2 x 1.500
    expect(screen.getByLabelText('Devolver una unidad más de Sal')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Devolver una unidad menos de Sal'));
    expect(screen.getByLabelText('A devolver de Sal: 1')).toBeInTheDocument();
  });

  it('quien no es administrador debe dar usuario y clave de uno', () => {
    const onSubmit = renderForm({ pideAutorizacion: true });
    fireEvent.click(screen.getByLabelText('Devolver una unidad más de Arroz'));
    fireEvent.change(screen.getByLabelText('Motivo de la devolución'), { target: { value: 'No le gusto' } });
    expect(screen.getByRole('button', { name: 'Confirmar devolución' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Usuario del administrador'), { target: { value: 'angelly_admin' } });
    fireEvent.change(screen.getByLabelText('Clave del administrador'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolución' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ autorizadorUsuario: 'angelly_admin', autorizadorPassword: 'secreta' }));
  });

  it('en un fiado avisa que primero baja la deuda', () => {
    renderForm({ venta: venta({ es_fiado: true }) });
    expect(screen.getByText(/primero baja lo que el cliente debe/)).toBeInTheDocument();
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

  it('el vendedor devuelve productos con la clave de un administrador y se recarga el historial', async () => {
    fetchMock.mockResolvedValue([venta()]);
    devolverMock.mockResolvedValue({});
    const onChanged = vi.fn();
    abrir({ onChanged });
    await screen.findByText('#7');

    fireEvent.click(screen.getByRole('button', { name: /Devolver productos/ }));
    fireEvent.click(screen.getByLabelText('Devolver una unidad más de Arroz'));
    fireEvent.change(screen.getByLabelText('Motivo de la devolución'), { target: { value: 'En mal estado' } });
    fireEvent.change(screen.getByLabelText('Usuario del administrador'), { target: { value: 'angelly_admin' } });
    fireEvent.change(screen.getByLabelText('Clave del administrador'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolución' }));

    await waitFor(() => expect(devolverMock).toHaveBeenCalledWith(7, {
      items: [{ producto_id: 1, cantidad: 1 }],
      motivo: 'En mal estado',
      autorizadorUsuario: 'angelly_admin',
      autorizadorPassword: 'secreta',
    }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si el servidor rechaza la devolución muestra el motivo y deja el formulario abierto', async () => {
    fetchMock.mockResolvedValue([venta()]);
    devolverMock.mockRejectedValue(new Error('Abre la caja para registrar la devolucion'));
    abrir({ role: 'superadmin' });
    await screen.findByText('#7');

    fireEvent.click(screen.getByRole('button', { name: /Devolver productos/ }));
    fireEvent.click(screen.getByLabelText('Devolver una unidad más de Arroz'));
    fireEvent.change(screen.getByLabelText('Motivo de la devolución'), { target: { value: 'No le gusto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolución' }));

    expect(await screen.findByText('Abre la caja para registrar la devolucion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar devolución' })).toBeInTheDocument();
  });

  it('una venta con devoluciones muestra cuánto se devolvió y ya no ofrece anular', async () => {
    fetchMock.mockResolvedValue([venta({ total_devuelto: 2500, detalles: [{ producto_id: 1, nombre_producto: 'Arroz', cantidad: 2, precio_unitario: 2500, subtotal: 5000, cantidad_devuelta: 1 }] })]);
    abrir();

    expect(await screen.findByText(/Devuelto .*2\.500/)).toBeInTheDocument();
    expect(screen.getByText(/2× Arroz \(1 devuelto\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Anular/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Devolver productos/ })).toBeInTheDocument();
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
