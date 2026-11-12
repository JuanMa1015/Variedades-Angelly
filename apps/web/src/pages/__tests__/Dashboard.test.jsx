import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ token: 't', user: { username: 'vendedor1', role: 'vendedor' } }) }));
vi.mock('../../api/httpClient', () => http);
vi.mock('../../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));

import Dashboard from '../Dashboard';

const periodoVentas = (total, transacciones, credito) => ({ total, transacciones, de_contado: total - credito, a_credito: credito });
const periodoCobrado = (total, efectivo = total) => ({ total, efectivo, transferencia: total - efectivo, tarjeta: 0 });

const DATOS = {
  ventas: { hoy: periodoVentas(50000, 3, 20000), semana: periodoVentas(120000, 8, 50000), mes: periodoVentas(400000, 25, 150000) },
  cobrado: { hoy: periodoCobrado(35000, 25000), semana: periodoCobrado(90000, 60000), mes: periodoCobrado(300000, 200000) },
  gastos: { hoy: 12000, mes: 80000 },
  fiado_tienda: { deuda_total: 90000, clientes_con_deuda: 3, en_alerta: 1, morosos: 1 },
  caja: { abierta: true, abierta_por: 'vendedor1', desde: '2026-11-12T13:00:00', monto_inicial: 50000, efectivo: 25000, transferencia: 10000, tarjeta: 0, gastos: 12000, efectivo_esperado: 63000 },
  productos_mas_vendidos: [
    { nombre: 'Arroz Diana', unidades: 40, total: 120000 },
    { nombre: 'Aceite', unidades: 10, total: 90000 },
  ],
  stock: { agotados: 2, bajo_stock: 3, urgentes: [{ id: 1, nombre: 'Agua Pool', stock_actual: 0, stock_minimo: 3 }, { id: 2, nombre: 'Sal', stock_actual: 2, stock_minimo: 5 }] },
};
const VENTAS = {
  data: [
    { venta_id: 11, fecha: '2026-11-12T15:00:00', cliente_nombre: null, es_fiado: false, metodo_pago: 'efectivo', total: 8000, saldo_pendiente: 0, anulada: false },
    { venta_id: 10, fecha: '2026-11-12T14:00:00', cliente_nombre: 'Don Pedro', es_fiado: true, fiado_origen: 'tienda', metodo_pago: 'efectivo', total: 15000, saldo_pendiente: 12000, anulada: false },
    { venta_id: 9, fecha: '2026-11-12T13:30:00', cliente_nombre: null, es_fiado: false, metodo_pago: 'efectivo', total: 4000, saldo_pendiente: 0, anulada: true },
  ],
  page: { total: 3 },
};

const abrir = async ({ datos = DATOS, ventas = VENTAS } = {}) => {
  http.apiGet.mockImplementation((endpoint) => {
    if (endpoint.includes('/api/dashboard/vendedor')) return Promise.resolve(datos);
    if (endpoint.includes('/api/ventas/paginadas')) return Promise.resolve(ventas);
    return Promise.resolve([]);
  });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await screen.findByText('Vendido hoy');
};
const dinero = (n) => new RegExp(`\\$\\s?${Number(n).toLocaleString('es-CO')}`);

describe('Dashboard del vendedor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('pide solo el dashboard del vendedor y las ventas recientes; nada de clientes ni de cartera', async () => {
    await abrir();

    const pedidos = http.apiGet.mock.calls.map(([endpoint]) => endpoint);
    expect(pedidos).toHaveLength(2);
    expect(pedidos.some((e) => e.includes('/api/dashboard/vendedor'))).toBe(true);
    expect(pedidos.some((e) => e.includes('/api/clientes') || e.includes('cartera') || e.includes('dashboard/resumen'))).toBe(false);
  });

  it('las tarjetas muestran lo vendido, lo cobrado por metodo, la caja y los gastos de hoy', async () => {
    await abrir();

    expect(screen.getByText('Vendido hoy').nextElementSibling.textContent).toMatch(dinero(50000));
    expect(screen.getByText(/3 ventas · .*20\.000 a crédito/)).toBeTruthy();
    expect(screen.getByText('Cobrado hoy').nextElementSibling.textContent).toMatch(dinero(35000));
    expect(screen.getByText(/Efectivo .*25\.000 · Transf\. .*10\.000/)).toBeTruthy();
    expect(screen.getByText('Efectivo en caja').nextElementSibling.textContent).toMatch(dinero(63000));
    expect(screen.getByText(/Turno de vendedor1/)).toBeTruthy();
    expect(screen.getByText('Gastos hoy').nextElementSibling.textContent).toMatch(dinero(12000));
    expect(screen.getByText(/Este mes .*80\.000/)).toBeTruthy();
  });

  it('con la caja cerrada lo dice y lleva a abrirla', async () => {
    await abrir({ datos: { ...DATOS, caja: { abierta: false, efectivo_esperado: 0 } } });

    expect(screen.getByText('Cerrada')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir la caja' })).toHaveAttribute('href', '/caja');
  });

  it('la tabla separa lo vendido (contado y credito) de lo cobrado en hoy, semana y mes', async () => {
    await abrir();

    const semana = screen.getByText('Esta semana').closest('tr');

    expect(within(semana).getByText(dinero(120000))).toBeTruthy();
    expect(within(semana).getByText(dinero(70000))).toBeTruthy(); // contado
    expect(within(semana).getByText(dinero(50000))).toBeTruthy(); // credito
    expect(within(semana).getByText(dinero(90000))).toBeTruthy(); // cobrado
    expect(within(semana).getByText('8 ventas')).toBeTruthy();
  });

  it('los mas vendidos, el fiado y el stock salen con sus enlaces', async () => {
    await abrir();

    expect(screen.getByText(/1\. Arroz Diana/)).toBeTruthy();
    expect(screen.getByText(/40 unidades/)).toBeTruthy();
    expect(screen.getByText('3 clientes con deuda')).toBeTruthy();
    expect(screen.getByText('Morosos').nextElementSibling.textContent).toBe('1');
    expect(screen.getByText('Agotado')).toBeTruthy();
    expect(screen.getByText('2 u')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver clientes' })).toHaveAttribute('href', '/clientes');
    expect(screen.getByRole('link', { name: 'Ver inventario' })).toHaveAttribute('href', '/inventario');
  });

  it('sin fiado, sin ventas ni faltantes lo dice en vez de mostrar bloques vacios', async () => {
    await abrir({
      datos: {
        ...DATOS,
        productos_mas_vendidos: [],
        fiado_tienda: { deuda_total: 0, clientes_con_deuda: 0, en_alerta: 0, morosos: 0 },
        stock: { agotados: 0, bajo_stock: 0, urgentes: [] },
      },
    });

    expect(screen.getByText('Aún no hay ventas este mes.')).toBeTruthy();
    expect(screen.getByText('Ningún cliente le debe a la tienda.')).toBeTruthy();
    expect(screen.getByText('Todo el inventario está por encima de su mínimo.')).toBeTruthy();
  });

  it('las ventas anuladas se ven como anuladas y no muestran saldo', async () => {
    await abrir();

    const anulada = screen.getByText('Anulada').closest('tr');
    const normal = screen.getByText('Don Pedro').closest('tr');

    expect(within(anulada).getByText(dinero(4000)).className).toContain('line-through');
    expect(within(normal).getByText('Fiado')).toBeTruthy();
    expect(within(normal).getByText(dinero(12000))).toBeTruthy();
    expect(screen.getAllByText('Mostrador').length).toBe(2);
  });

  it('sin ventas recientes lo explica', async () => {
    await abrir({ ventas: { data: [], page: {} } });

    expect(screen.getByText('No hay ventas recientes para mostrar.')).toBeTruthy();
  });

  it('si falla muestra el error con reintentar y NO muestra ceros', async () => {
    http.apiGet.mockRejectedValueOnce(new Error('No hay conexión con el servidor')).mockRejectedValueOnce(new Error('No hay conexión con el servidor'));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText('No hay conexión con el servidor')).toBeTruthy();
    expect(screen.queryByText('Vendido hoy')).toBeNull();
    expect(screen.queryByText(/\$\s?0\b/)).toBeNull();

    http.apiGet.mockImplementation((endpoint) => Promise.resolve(endpoint.includes('/api/dashboard/vendedor') ? DATOS : VENTAS));
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));

    expect(await screen.findByText('Vendido hoy')).toBeTruthy();
  });

  it('ya no tiene el bloque de administracion de cartera ni los totales historicos sin periodo', async () => {
    await abrir();

    expect(screen.queryByText(/Inicio Admin/)).toBeNull();
    expect(screen.queryByText(/Módulo Cartera/)).toBeNull();
    expect(screen.queryByText(/Participación/)).toBeNull();
    await waitFor(() => expect(screen.queryByText('Dinero en efectivo')).toBeNull());
  });
});
