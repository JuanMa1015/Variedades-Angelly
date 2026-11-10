import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  abrirCaja: vi.fn(),
  cerrarCaja: vi.fn(),
  deleteCaja: vi.fn(),
  fetchCajaEstado: vi.fn(),
  fetchCajaHistorial: vi.fn(),
  fetchVentasPorRango: vi.fn(),
  updateCaja: vi.fn(),
}));
const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/cajaApi', () => apiMocks);
vi.mock('../../auth/AuthContext', () => ({ useAuth: useAuthMock }));

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

describe('Caja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'vendedor1', role: 'vendedor' } });
    apiMocks.fetchCajaHistorial.mockResolvedValue([]);
    apiMocks.fetchVentasPorRango.mockResolvedValue([]);
  });

  it('cierre ciego: sin saldo esperado el cajero solo ve la instruccion de contar', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });

    render(<Caja />);

    await waitFor(() => expect(screen.getByText(/Cuenta el efectivo del cajón/)).toBeInTheDocument());
    expect(screen.queryByText(/Saldo esperado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Descuadre:/)).not.toBeInTheDocument();
  });

  it('el superadmin sigue viendo el saldo esperado', async () => {
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'root', role: 'superadmin' } });
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(7000), ultimo_cierre: null });

    render(<Caja />);

    await waitFor(() => expect(screen.getAllByText(/Saldo esperado/).length).toBeGreaterThan(0));
  });

  it('al cerrar informa el descuadre calculado por el servidor', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });
    apiMocks.cerrarCaja.mockResolvedValue({ descuadre: -500 });

    render(<Caja />);

    const input = await screen.findByPlaceholderText('Monto final en caja');
    fireEvent.change(input, { target: { value: '6500' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => expect(screen.getByText(/faltan/)).toBeInTheDocument());
    expect(apiMocks.cerrarCaja).toHaveBeenCalledWith({ monto_cierre: 6500 });
  });

  it('permite abrir la caja con base cero', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: false, caja_actual: null, ultimo_cierre: null });
    apiMocks.abrirCaja.mockResolvedValue({});

    render(<Caja />);

    const input = await screen.findByPlaceholderText(/monto/i);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => expect(apiMocks.abrirCaja).toHaveBeenCalledWith({ monto_inicial: 0 }));
  });

  it('muestra las ventas por tarjeta separadas de las de transferencia', async () => {
    apiMocks.fetchCajaEstado.mockResolvedValue({ abierta: true, caja_actual: cajaAbierta(null), ultimo_cierre: null });

    render(<Caja />);

    expect(await screen.findByText('Ventas tarjeta:')).toBeInTheDocument();
    expect(screen.getByText('Ventas transferencia:')).toBeInTheDocument();
  });
});
