import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  abrirCaja: vi.fn(),
  cerrarCaja: vi.fn(),
  deleteCaja: vi.fn(),
  fetchCajaEstado: vi.fn(),
  fetchCajaHistorial: vi.fn(),
  fetchCajaMovimientos: vi.fn(),
  updateCaja: vi.fn(),
}));
const useAuthMock = vi.hoisted(() => vi.fn());
const printMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/cajaApi', () => apiMocks);
vi.mock('../../auth/AuthContext', () => ({ useAuth: useAuthMock }));
vi.mock('../Ventas/printReceipt', () => ({ printHtml: printMock }));

import Caja from '../Caja';

const cajaAbierta = (saldoEsperado) => ({
  id: 1,
  monto_inicial: 5000,
  monto_ventas_efectivo: 2000,
  monto_ventas_transferencia: 1000,
  monto_ventas_tarjeta: 4000,
  monto_gastos: 0,
  fecha_apertura: '2026-11-09T10:00:00',
  fecha_cierre: null,
  abierto_por: 'vendedor1',
  cerrado_por: null,
  saldo_esperado: saldoEsperado,
  esta_abierta: true,
  descuadre: null,
});

const cajaCerrada = (extra = {}) => ({
  ...cajaAbierta(7000),
  id: 2,
  esta_abierta: false,
  fecha_cierre: '2026-11-09T20:00:00',
  cerrado_por: 'vendedor1',
  monto_cierre: 6500,
  descuadre: -500,
  observaciones: null,
  ...extra,
});

const renderCaja = () => render(<MemoryRouter><Caja /></MemoryRouter>);

describe('Caja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'vendedor1', role: 'vendedor' } });
    apiMocks.fetchCajaHistorial.mockResolvedValue([]);
    apiMocks.fetchCajaMovimientos.mockResolvedValue([]);
  });

  it('cierre ciego: sin saldo esperado el cajero solo ve la instruccion de contar', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });

    renderCaja();

    await waitFor(() => expect(screen.getByText(/Cuenta el efectivo del cajón/)).toBeInTheDocument());
    expect(screen.queryByText('Efectivo esperado')).not.toBeInTheDocument();
    expect(screen.queryByText(/Descuadre:/)).not.toBeInTheDocument();
  });

  it('quien puede verlo (superadmin) ve el efectivo esperado y el descuadre en vivo', async () => {
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'root', role: 'superadmin' } });
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(7000), ultimo_cierre: null });

    renderCaja();

    expect(await screen.findByText('Efectivo esperado')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Efectivo contado en el cajón'), { target: { value: '6500' } });
    expect(screen.getByText('Faltan $ 500')).toBeInTheDocument();
  });

  it('muestra el efectivo, las transferencias y la tarjeta por separado', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });

    renderCaja();

    expect(await screen.findByText('Transferencias')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir a vender/ })).toHaveAttribute('href', '/ventas');
  });

  it('al cerrar pide confirmar lo escrito y luego informa el descuadre del servidor', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });
    apiMocks.cerrarCaja.mockResolvedValue({ descuadre: -500 });
    renderCaja();

    const input = await screen.findByPlaceholderText('Monto final en caja');
    fireEvent.change(input, { target: { value: '6500' } });
    fireEvent.change(screen.getByLabelText('Nota del cierre'), { target: { value: 'Falto un vuelto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }));

    expect(await screen.findByText(/Vas a cerrar el turno con/)).toBeInTheDocument();
    expect(apiMocks.cerrarCaja).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.getByText(/faltan/)).toBeInTheDocument());
    expect(apiMocks.cerrarCaja).toHaveBeenCalledWith({ monto_cierre: 6500, observaciones: 'Falto un vuelto' });
  });

  it('si no confirma, no se cierra la caja', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });
    renderCaja();

    fireEvent.change(await screen.findByPlaceholderText('Monto final en caja'), { target: { value: '6500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(apiMocks.cerrarCaja).not.toHaveBeenCalled();
  });

  it('no deja cerrar sin haber escrito el efectivo contado', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });
    renderCaja();

    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar caja' }));

    expect(await screen.findByText(/Cuenta el efectivo del cajón y escribe el total \(si/)).toBeInTheDocument();
    expect(apiMocks.cerrarCaja).not.toHaveBeenCalled();
  });

  it('permite abrir la caja con base cero', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: false, caja_actual: null, ultimo_cierre: null });
    apiMocks.abrirCaja.mockResolvedValue({});
    renderCaja();

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir caja' }));

    await waitFor(() => expect(apiMocks.abrirCaja).toHaveBeenCalledWith({ monto_inicial: 0 }));
  });

  it('el monto inicial se escribe con puntos de miles', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: false, caja_actual: null, ultimo_cierre: null });
    apiMocks.abrirCaja.mockResolvedValue({});
    renderCaja();

    const input = await screen.findByLabelText('Efectivo inicial en el cajón');
    fireEvent.change(input, { target: { value: '50000' } });
    expect(input).toHaveValue('50.000');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));

    await waitFor(() => expect(apiMocks.abrirCaja).toHaveBeenCalledWith({ monto_inicial: 50000 }));
  });

  it('con la caja cerrada deja a la vista el ultimo cierre y permite imprimirlo', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: false, caja_actual: null, ultimo_cierre: cajaCerrada({ observaciones: 'Falto un vuelto' }) });
    renderCaja();

    expect(await screen.findByText(/Último cierre · Turno 2/)).toBeInTheDocument();
    expect(screen.getByText('Nota: Falto un vuelto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Imprimir cierre/ }));

    expect(printMock).toHaveBeenCalledTimes(1);
    expect(printMock.mock.calls[0][0]).toContain('CIERRE DE CAJA #2');
  });

  it('el historial muestra una fila por turno y su detalle se abre al tocarla', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: false, caja_actual: null, ultimo_cierre: null });
    apiMocks.fetchCajaHistorial.mockResolvedValue([cajaCerrada()]);
    apiMocks.fetchCajaMovimientos.mockResolvedValue([
      { tipo: 'venta', id: 9, fecha: '2026-11-09T11:00:00', descripcion: 'Venta #9', metodo_pago: 'efectivo', monto: 2000, total: 2000, es_fiado: false, anulada: false },
      { tipo: 'venta', id: 10, fecha: '2026-11-09T12:00:00', descripcion: 'Venta #10', metodo_pago: 'efectivo', monto: 0, total: 900, es_fiado: false, anulada: true },
      { tipo: 'gasto', id: 3, fecha: '2026-11-09T13:00:00', descripcion: 'Aseo · Jabon', metodo_pago: null, monto: 700 },
    ]);
    renderCaja();

    expect(await screen.findByText('Turno 2')).toBeInTheDocument();
    expect(screen.getByText('Faltan $ 500')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver el detalle del turno 2' }));

    expect(await screen.findByText('Venta #9')).toBeInTheDocument();
    expect(screen.getByText('Anulada')).toBeInTheDocument();
    expect(screen.getByText('−$ 700')).toBeInTheDocument();
    expect(apiMocks.fetchCajaMovimientos).toHaveBeenCalledWith(2, expect.anything());
  });

  it('solo el superadmin ve editar y eliminar, y la edicion permite monto cero', async () => {
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'root', role: 'superadmin' } });
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: false, caja_actual: null, ultimo_cierre: null });
    apiMocks.fetchCajaHistorial.mockResolvedValue([cajaCerrada()]);
    apiMocks.updateCaja.mockResolvedValue({});
    renderCaja();

    fireEvent.click(await screen.findByRole('button', { name: 'Ver el detalle del turno 2' }));
    fireEvent.click(await screen.findByRole('button', { name: /Editar/ }));
    const dialogo = screen.getByRole('heading', { name: 'Editar turno 2' }).closest('div').parentElement;
    fireEvent.change(within(dialogo).getByLabelText('Monto inicial'), { target: { value: '0' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(apiMocks.updateCaja).toHaveBeenCalledWith(2, { monto_inicial: 0 }));
  });

  it('el vendedor no ve las acciones de superadmin', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: false, caja_actual: null, ultimo_cierre: null });
    apiMocks.fetchCajaHistorial.mockResolvedValue([cajaCerrada()]);
    renderCaja();

    fireEvent.click(await screen.findByRole('button', { name: 'Ver el detalle del turno 2' }));

    expect(await screen.findByRole('button', { name: /Imprimir cierre/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('actualizar vuelve a pedir el estado de la caja', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });
    renderCaja();
    await screen.findByText('Transferencias');
    const antes = apiMocks.fetchCajaEstado.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }));

    await waitFor(() => expect(apiMocks.fetchCajaEstado.mock.calls.length).toBeGreaterThan(antes));
  });
});
