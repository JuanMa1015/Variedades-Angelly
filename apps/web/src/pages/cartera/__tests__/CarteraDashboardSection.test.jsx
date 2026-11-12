import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchCarteraDashboard: vi.fn() }));
vi.mock('../../../api/carteraApi', () => api);
vi.mock('../../../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));

import CarteraDashboardSection from '../CarteraDashboardSection';

const formatMoney = (v) => `$ ${Number(v).toLocaleString('es-CO')}`;
const periodoVentas = (total, transacciones, credito) => ({ total, transacciones, a_credito: credito, de_contado: total - credito });
const periodoCobrado = (total, abonos) => ({ total, efectivo: total, transferencia: 0, tarjeta: 0, abonos });

const DATOS = {
  clientes_activos: 12,
  ventas: { hoy: periodoVentas(50000, 2, 30000), semana: periodoVentas(120000, 5, 80000), mes: periodoVentas(300000, 11, 200000) },
  cobrado: { hoy: periodoCobrado(15000, 1), semana: periodoCobrado(40000, 3), mes: periodoCobrado(90000, 8) },
  por_cobrar: {
    deuda_total: 800000, clientes_con_deuda: 3, saldo_promedio: 266666.67,
    al_dia: { clientes: 1, monto: 100000 }, alerta: { clientes: 1, monto: 200000 }, moroso: { clientes: 1, monto: 500000 },
  },
  mayores_deudores: [
    { id: 1, nombre: 'Danilo', deuda_total: 500000, dias_deuda: 75, estado_deuda: 'moroso' },
    { id: 2, nombre: 'Juan Manuel', deuda_total: 200000, dias_deuda: 40, estado_deuda: 'alerta' },
    { id: 3, nombre: 'Marta', deuda_total: 100000, dias_deuda: 2, estado_deuda: 'al_dia' },
  ],
  mejores_clientes: [
    { id: 1, nombre: 'Danilo', compras_cantidad: 3, compras_total: 535000 },
    { id: 4, nombre: 'Cliente Test', compras_cantidad: 3, compras_total: 53500 },
  ],
};

const acciones = () => ({ navigate: vi.fn(), onCobrar: vi.fn(), onVender: vi.fn() });
const abrir = async ({ datos = DATOS, props = acciones() } = {}) => {
  api.fetchCarteraDashboard.mockResolvedValue(datos);
  const vista = render(<CarteraDashboardSection formatMoney={formatMoney} recargar={0} {...props} />);
  await screen.findByText('Por cobrar');
  return { props, ...vista };
};

describe('CarteraDashboardSection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('todo sale de una sola peticion', async () => {
    await abrir();

    expect(api.fetchCarteraDashboard).toHaveBeenCalledTimes(1);
  });

  it('las tarjetas muestran lo que falta por cobrar, lo cobrado hoy, lo vendido hoy y los clientes', async () => {
    await abrir();

    expect(screen.getByText('Por cobrar').nextElementSibling.textContent).toBe('$ 800.000');
    expect(screen.getByText(/3 clientes con deuda/)).toBeTruthy();
    expect(screen.getByText('Cobrado hoy').nextElementSibling.textContent).toBe('$ 15.000');
    expect(screen.getByText(/Semana \$ 40\.000 · Mes \$ 90\.000/)).toBeTruthy();
    expect(screen.getByText('Vendido hoy').nextElementSibling.textContent).toBe('$ 50.000');
    expect(screen.getByText(/2 ventas · \$ 30\.000 a crédito/)).toBeTruthy();
    expect(screen.getByText('Clientes activos').nextElementSibling.textContent).toBe('12');
    expect(screen.getByText('1 morosos · 1 en alerta')).toBeTruthy();
  });

  it('la tabla separa lo vendido (credito y contado) de lo cobrado en hoy, semana y mes', async () => {
    await abrir();

    const fila = screen.getByText('Esta semana').closest('tr');

    expect(within(fila).getByText('$ 120.000')).toBeTruthy();
    expect(within(fila).getByText('$ 80.000')).toBeTruthy();
    expect(within(fila).getAllByText('$ 40.000')).toHaveLength(2); // de contado y cobrado coinciden en este caso
    expect(within(fila).getByText('5 ventas')).toBeTruthy();
    expect(within(fila).getByText('3 cobros')).toBeTruthy();
  });

  it('la deuda se reparte por antiguedad con clientes y monto en cada tramo', async () => {
    await abrir();

    expect(screen.getByRole('img', { name: 'Deuda repartida por antigüedad' })).toBeTruthy();
    const mora = screen.getByText('Más de 60 días').closest('li');
    expect(within(mora).getByText('$ 500.000')).toBeTruthy();
    expect(within(mora).getByText(/1 cliente\b/)).toBeTruthy();
  });

  it('los deudores traen su nivel y desde hace cuanto, con barras relativas al mayor', async () => {
    await abrir();

    const danilo = screen.getByRole('button', { name: 'Cobrar a Danilo' }).closest('div.rounded-2xl');
    const juan = screen.getByRole('button', { name: 'Cobrar a Juan Manuel' }).closest('div.rounded-2xl');

    expect(within(danilo).getByText('Moroso')).toBeTruthy();
    expect(within(danilo).getByText(/Debe hace 75 días/)).toBeTruthy();
    expect(danilo.querySelector('[style]').style.width).toBe('100%');
    expect(juan.querySelector('[style]').style.width).toBe('40%');
  });

  it('Cobrar y Vender abren el cobro y la venta de ese cliente', async () => {
    const { props } = await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Cobrar a Juan Manuel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vender a Marta' }));

    expect(props.onCobrar).toHaveBeenCalledWith(expect.objectContaining({ id: 2, nombre: 'Juan Manuel', deuda_total: 200000 }));
    expect(props.onVender).toHaveBeenCalledWith(expect.objectContaining({ id: 3, nombre: 'Marta' }));
  });

  it('los mejores clientes se ordenan por monto y sus barras no se igualan aunque tengan las mismas compras', async () => {
    await abrir();

    const mejor = screen.getByText(/\$ 535\.000 · 3 compras/).closest('div.rounded-2xl');
    const otro = screen.getByText(/\$ 53\.500 · 3 compras/).closest('div.rounded-2xl');

    expect(mejor.querySelector('[style]').style.width).toBe('100%');
    expect(otro.querySelector('[style]').style.width).toBe('10%');
  });

  it('los accesos rapidos llevan a cobrar, vender y clientes', async () => {
    const { props } = await abrir();

    fireEvent.click(screen.getByRole('button', { name: /Cobrar cartera/ }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar venta/ }));
    fireEvent.click(screen.getByRole('button', { name: /Clientes Registrar/ }));

    expect(props.navigate.mock.calls.map(([ruta]) => ruta)).toEqual(['/cartera/cobrar', '/cartera/venta', '/cartera/clientes']);
  });

  it('sin deudores ni compras lo dice y no inventa barras', async () => {
    const vacio = { ...DATOS, mayores_deudores: [], mejores_clientes: [], por_cobrar: { ...DATOS.por_cobrar, deuda_total: 0, clientes_con_deuda: 0, al_dia: { clientes: 0, monto: 0 }, alerta: { clientes: 0, monto: 0 }, moroso: { clientes: 0, monto: 0 } } };
    await abrir({ datos: vacio });

    expect(screen.getByText('No hay clientes con deuda.')).toBeTruthy();
    expect(screen.getByText('Aún no hay compras registradas.')).toBeTruthy();
    expect(screen.getByText('Nadie le debe a la tienda por ahora.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Deuda repartida por antigüedad' })).toBeNull();
  });

  it('si falla muestra el error con reintentar y NO muestra ceros', async () => {
    api.fetchCarteraDashboard.mockRejectedValueOnce(new Error('No hay conexión con el servidor'));
    render(<CarteraDashboardSection formatMoney={formatMoney} recargar={0} {...acciones()} />);

    expect(await screen.findByText('No hay conexión con el servidor')).toBeTruthy();
    expect(screen.queryByText('Por cobrar')).toBeNull();
    expect(screen.queryByText('$ 0')).toBeNull();

    api.fetchCarteraDashboard.mockResolvedValueOnce(DATOS);
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));

    expect(await screen.findByText('Por cobrar')).toBeTruthy();
  });

  it('vuelve a pedir los datos cuando la pantalla avisa que algo cambio', async () => {
    const { props, rerender } = await abrir();
    const antes = api.fetchCarteraDashboard.mock.calls.length;

    rerender(<CarteraDashboardSection formatMoney={formatMoney} recargar={1} {...props} />);

    await waitFor(() => expect(api.fetchCarteraDashboard.mock.calls.length).toBeGreaterThan(antes));
  });
});
