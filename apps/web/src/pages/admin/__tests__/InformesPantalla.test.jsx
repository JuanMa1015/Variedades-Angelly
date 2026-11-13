import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InformesPantalla from '../informes/InformesPantalla';
import { rangoDe } from '../informes/periodos';

const http = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('../../../api/httpClient', () => ({ apiGet: http.apiGet }));
vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));

const COBRADO = (total) => ({ total, efectivo: total, transferencia: 0, tarjeta: 0 });
const INFORME = {
  periodo: { desde: '2026-03-01', hasta: '2026-03-12' },
  tienda: {
    ventas: { total: 250000, transacciones: 12, a_credito: 40000, de_contado: 210000 },
    cobrado: COBRADO(220000),
    gastos: 70000,
    cobrado_menos_gastos: 150000,
    por_cobrar: 30000,
    vendedores: [{ vendedor: 'vendedor1', ventas: 9, total_vendido: 180000 }],
    mas_vendidos: [{ producto_id: 1, producto: 'Agua Pool 600ml', unidades_vendidas: 40, total_vendido: 40000 }],
    menos_vendidos: [{ producto_id: 7, producto: 'Detergente Fab 1kg', unidades_vendidas: 0, total_vendido: 0 }],
  },
  cartera: {
    ventas: { total: 90000, transacciones: 3, a_credito: 90000, de_contado: 0 },
    cobrado: COBRADO(25000),
    por_cobrar: 300000,
    mas_vendidos: [{ producto_id: 20, producto: 'Bolso de mano', unidades_vendidas: 2, total_vendido: 90000 }],
    menos_vendidos: [],
  },
};
const ultima = () => http.apiGet.mock.calls.at(-1)[0];

describe('InformesPantalla', () => {
  beforeEach(() => http.apiGet.mockReset().mockResolvedValue(INFORME));

  it('trae el mes en curso con una sola peticion y separa tienda de cartera', async () => {
    render(<InformesPantalla />);

    expect(await screen.findByText('Agua Pool 600ml')).toBeInTheDocument();
    expect(http.apiGet).toHaveBeenCalledTimes(1);
    expect(ultima()).toMatch(/^\/api\/superadmin\/informes\?desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-\d{2}$/);
    const tienda = within(screen.getByRole('region', { name: 'Tienda' }));
    const cartera = within(screen.getByRole('region', { name: 'Cartera' }));
    expect(tienda.getByText('Detergente Fab 1kg')).toBeInTheDocument();
    expect(tienda.getByText(/Fiado por cobrar hoy/)).toBeInTheDocument();
    expect(cartera.getByText('Bolso de mano')).toBeInTheDocument();
    expect(cartera.getByText('Por cobrar')).toBeInTheDocument();
    expect(tienda.queryByText('Bolso de mano')).not.toBeInTheDocument();
    expect(screen.getByText('Del 2026-03-01 al 2026-03-12')).toBeInTheDocument();
  });

  it('cambiar de periodo vuelve a pedir el informe con ese rango', async () => {
    render(<InformesPantalla />);
    await screen.findByText('Agua Pool 600ml');

    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(http.apiGet).toHaveBeenCalledTimes(2));
    const [, desde, hasta] = ultima().match(/desde=([\d-]+)&hasta=([\d-]+)/);
    expect(desde).toBe(hasta);
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Mes pasado' }));
    await waitFor(() => expect(http.apiGet).toHaveBeenCalledTimes(3));
    expect(ultima()).toMatch(/desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-(28|29|30|31)/);
  });

  it('con fechas propias pide exactamente ese rango y no consulta uno incompleto o al reves', async () => {
    render(<InformesPantalla />);
    await screen.findByText('Agua Pool 600ml');

    fireEvent.click(screen.getByRole('button', { name: 'Otro periodo' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-02-01' } });
    await waitFor(() => expect(ultima()).toContain('desde=2026-02-01'));
    const antes = http.apiGet.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '' } });
    expect(await screen.findByText(/Elige una fecha inicial y una final/)).toBeInTheDocument();
    expect(http.apiGet.mock.calls.length).toBe(antes);

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-02-28' } });
    await waitFor(() => expect(ultima()).toContain('desde=2026-02-01&hasta=2026-02-28'));
  });

  it('si el servidor falla muestra el error con Reintentar, no ceros', async () => {
    http.apiGet.mockRejectedValueOnce(new Error('Servidor caido'));
    render(<InformesPantalla />);

    expect(await screen.findByText('Servidor caido')).toBeInTheDocument();
    expect(screen.queryByText('Vendido')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Agua Pool 600ml')).toBeInTheDocument();
  });

  it('avisa cuando no hay datos en el periodo', async () => {
    http.apiGet.mockResolvedValue({ ...INFORME, cartera: { ...INFORME.cartera, mas_vendidos: [] }, tienda: { ...INFORME.tienda, vendedores: [] } });
    render(<InformesPantalla />);

    await screen.findByRole('region', { name: 'Tienda' });
    expect(screen.getAllByText('No hay datos en este periodo').length).toBeGreaterThanOrEqual(2);
  });
});

describe('rangoDe', () => {
  const miercoles = new Date(2026, 2, 11); // miercoles 11 de marzo de 2026

  it('hoy, semana (desde el lunes), mes y mes pasado', () => {
    expect(rangoDe('hoy', miercoles)).toEqual({ desde: '2026-03-11', hasta: '2026-03-11' });
    expect(rangoDe('semana', miercoles)).toEqual({ desde: '2026-03-09', hasta: '2026-03-11' });
    expect(rangoDe('mes', miercoles)).toEqual({ desde: '2026-03-01', hasta: '2026-03-11' });
    expect(rangoDe('mes_pasado', miercoles)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('la semana de un domingo empieza el lunes anterior y enero mira a diciembre', () => {
    expect(rangoDe('semana', new Date(2026, 2, 15))).toEqual({ desde: '2026-03-09', hasta: '2026-03-15' });
    expect(rangoDe('mes_pasado', new Date(2026, 0, 20))).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
  });
});
