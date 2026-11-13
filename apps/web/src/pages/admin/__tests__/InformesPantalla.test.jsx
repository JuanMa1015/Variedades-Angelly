import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InformesPantalla from '../informes/InformesPantalla';

const http = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('../../../api/httpClient', () => ({ apiGet: http.apiGet }));
vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));

const INFORME = {
  ventas_totales: 12,
  facturacion_total: 250000,
  vendedor_mas_vendedor: { vendedor: 'vendedor1', ventas: 9, total_vendido: 180000 },
  vendedores_top: [{ vendedor: 'vendedor1', ventas: 9, total_vendido: 180000 }],
  producto_mas_vendido: { producto: 'Agua Pool 600ml', unidades_vendidas: 40, total_vendido: 40000 },
  productos_menos_vendidos: [{ producto_id: 7, producto: 'Detergente Fab 1kg', unidades_vendidas: 1, total_vendido: 9500 }],
};

describe('InformesPantalla', () => {
  beforeEach(() => http.apiGet.mockReset());

  it('carga el informe con una sola peticion y lo muestra', async () => {
    http.apiGet.mockResolvedValue(INFORME);
    render(<InformesPantalla />);

    expect(await screen.findByText('Agua Pool 600ml')).toBeInTheDocument();
    expect(screen.getAllByText('vendedor1').length).toBeGreaterThan(0);
    expect(screen.getByText('Detergente Fab 1kg')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(http.apiGet).toHaveBeenCalledTimes(1);
    expect(http.apiGet).toHaveBeenCalledWith('/api/superadmin/informes', expect.anything());
  });

  it('si el servidor falla muestra el error con Reintentar, no ceros', async () => {
    http.apiGet.mockRejectedValueOnce(new Error('Servidor caido'));
    render(<InformesPantalla />);

    expect(await screen.findByText('Servidor caido')).toBeInTheDocument();
    http.apiGet.mockResolvedValueOnce(INFORME);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Agua Pool 600ml')).toBeInTheDocument();
  });
});
