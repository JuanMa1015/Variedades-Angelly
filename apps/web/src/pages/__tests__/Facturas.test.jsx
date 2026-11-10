import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/httpClient', () => ({ apiGet: apiGetMock, apiPost: apiPostMock }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: useAuthMock }));

import Facturas from '../Facturas';

const productos = [{ id: 1, nombre: 'Arroz Diana', precio_costo: 1190, precio_venta: 1500, codigo_barras: '770' }];

const cargarPagina = async () => {
  render(<Facturas />);
  const buscador = await screen.findByPlaceholderText('Buscar producto...');
  fireEvent.focus(buscador);
  fireEvent.click(await screen.findByText('Arroz Diana'));
};

describe('Facturas de compra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { // sin localStorage en este entorno de pruebas
    }
    useAuthMock.mockReturnValue({ token: 't' });
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/proveedores') return Promise.resolve([{ id: 5, nombre: 'Distribuidora' }]);
      if (endpoint.startsWith('/api/productos')) return Promise.resolve(productos);
      if (endpoint === '/api/facturas-compra/config') return Promise.resolve({ iva_rate: 0.19 });
      return Promise.resolve([]);
    });
    apiPostMock.mockResolvedValue({ id: 1, items: [] });
  });

  it('sugiere el precio de venta redondeado a multiplos de 50 y pide confirmar la actualizacion', async () => {
    await cargarPagina();

    fireEvent.change(screen.getByLabelText('Precio de factura sin IVA'), { target: { value: '2000' } });

    // 2000 / 0.70 = 2857,14 -> 2900
    const nuevoPrecio = await screen.findByLabelText('Nuevo precio de venta');
    expect(nuevoPrecio).toHaveValue(2900);
    expect(screen.getByLabelText('Actualizar precio de venta')).toBeChecked();
  });

  it('el costo guardado (con IVA) se convierte de vuelta a precio sin IVA al elegir el producto', async () => {
    render(<Facturas />);
    const buscador = await screen.findByPlaceholderText('Buscar producto...');
    // Marca IVA antes de elegir el producto: 1190 con IVA = 1000 sin IVA.
    fireEvent.click(screen.getByLabelText('Aplica IVA'));
    fireEvent.focus(buscador);
    fireEvent.click(await screen.findByText('Arroz Diana'));

    expect(screen.getByLabelText('Precio de factura sin IVA')).toHaveValue(1000);
  });

  it('envia al servidor la decision de actualizar el precio y el valor editado', async () => {
    await cargarPagina();
    fireEvent.change(screen.getByLabelText('Precio de factura sin IVA'), { target: { value: '2000' } });
    fireEvent.change(await screen.findByLabelText('Nuevo precio de venta'), { target: { value: '3000' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar factura/ }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/facturas-compra',
        expect.objectContaining({
          items: [expect.objectContaining({ producto_id: 1, actualizar_precio: true, precio_venta: 3000 })],
        }),
      );
    });
  });

  it('si se desmarca la casilla no se envia precio de venta', async () => {
    await cargarPagina();
    fireEvent.change(screen.getByLabelText('Precio de factura sin IVA'), { target: { value: '2000' } });
    fireEvent.click(await screen.findByLabelText('Actualizar precio de venta'));

    fireEvent.click(screen.getByRole('button', { name: /Guardar factura/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalled());
    const item = apiPostMock.mock.calls[0][1].items[0];
    expect(item.actualizar_precio).toBe(false);
    expect(item).not.toHaveProperty('precio_venta');
  });
});
