import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiUpload: vi.fn(), apiRequest: vi.fn(),
}));
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../auth/AuthContext', () => ({ useAuth: () => ({ token: 't', user: { username: 'admin', role: 'admin' } }) }));
vi.mock('../../../../api/httpClient', () => http);
vi.mock('../../../../components/ErrorMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="error-message">{message}</div> : null),
}));
vi.mock('../../../../components/SuccessMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="success-message">{message}</div> : null),
}));
vi.mock('../../../../components/Skeleton', () => ({
  default: () => <div data-testid="skeleton" />,
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));
vi.mock('../../../../components/useConfirm', () => ({
  default: () => ({ confirm: confirmMock, ConfirmModal: <div data-testid="confirm-modal" /> }),
}));
vi.mock('../../../../components/Modal', () => ({
  default: ({ isOpen, title, children }) => (isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null),
}));

import ProductosCarteraSection from '../ProductosCarteraSection';

const PRODUCTOS = [
  { id: 1, nombre: 'Bolso de mano', codigo_barras: null, precio_costo: 35000, precio_venta: 50000, stock_actual: 8, stock_minimo: 2, catalogo: 'cartera', activo: true, imagen_url: null, proveedor_id: null },
  { id: 2, nombre: 'Juego de sabanas', codigo_barras: '7701', precio_costo: 45000, precio_venta: 85000, stock_actual: 0, stock_minimo: 2, catalogo: 'cartera', activo: true, imagen_url: null, proveedor_id: null },
];
const RESUMEN = { total: 2, stock_total: 8, agotados: 1, bajo_stock: 0, urgentes: [{ id: 2, nombre: 'Juego de sabanas', stock_actual: 0, stock_minimo: 2 }] };
const pagina = (data) => ({ data, page: { total: data.length, total_pages: 1, current_page: 1, limit: 25 } });
const consultas = () => http.apiGet.mock.calls.map(([endpoint]) => endpoint);
const ultimaLista = () => consultas().filter((e) => e.includes('productos/paginados')).at(-1);

const abrir = async ({ productos = PRODUCTOS, onCambio = vi.fn() } = {}) => {
  http.apiGet.mockImplementation((endpoint) => {
    if (endpoint.includes('productos/resumen')) return Promise.resolve(RESUMEN);
    if (endpoint.includes('productos/paginados')) return Promise.resolve(pagina(productos));
    if (endpoint.includes('movimientos-stock')) return Promise.resolve({ data: [], page: { total: 0, total_pages: 1, current_page: 1, limit: 10 } });
    return Promise.resolve([]);
  });
  render(<ProductosCarteraSection onCambio={onCambio} />);
  if (productos.length) await screen.findAllByText('Bolso de mano');
  return { onCambio };
};

describe('ProductosCarteraSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    http.apiPost.mockResolvedValue({ id: 9 });
    http.apiPatch.mockResolvedValue({});
    http.apiDelete.mockResolvedValue(undefined);
    http.apiRequest.mockResolvedValue({});
  });

  it('pide solo productos y resumen del catalogo de cartera', async () => {
    await abrir();

    expect(ultimaLista()).toContain('catalogo=cartera');
    expect(consultas().some((e) => e.includes('productos/resumen?catalogo=cartera'))).toBe(true);
    expect(consultas().some((e) => e.includes('catalogo=tienda'))).toBe(false);
    expect(consultas().some((e) => e.includes('proveedores'))).toBe(false);
  });

  it('muestra el resumen, el stock de cada producto y no tiene filtro ni campo de proveedor', async () => {
    await abrir();

    expect(screen.getByText('Productos', { selector: 'p' }).nextElementSibling.textContent).toBe('2');
    expect(screen.getByText('Agotados', { selector: 'p' }).nextElementSibling.textContent).toBe('1');
    expect(screen.queryByLabelText('Proveedor')).toBeNull();
    expect(screen.queryByText('Todos los proveedores')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Proveedor' })).toBeNull();
    expect(screen.getAllByText('Agotado').length).toBeGreaterThan(0);
  });

  it('buscar escribiendo y filtrar agotados se piden al servidor del catalogo de cartera', async () => {
    await abrir();

    fireEvent.change(screen.getByLabelText('Buscar productos'), { target: { value: 'bolso' } });
    await waitFor(() => expect(ultimaLista()).toContain('q=bolso'));
    fireEvent.click(screen.getByRole('button', { name: 'Agotados' }));
    await waitFor(() => expect(ultimaLista()).toContain('estado=agotado'));
    expect(ultimaLista()).toContain('catalogo=cartera');
  });

  it('el administrador ve los desactivados y puede reactivarlos', async () => {
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Desactivados' }));
    await waitFor(() => expect(ultimaLista()).toContain('solo_inactivos=true'));
    http.apiGet.mockImplementation((endpoint) => {
      if (endpoint.includes('productos/resumen')) return Promise.resolve(RESUMEN);
      return Promise.resolve(pagina([{ ...PRODUCTOS[0], activo: false }]));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    const fila = (await screen.findAllByText('Bolso de mano')).map((el) => el.closest('tr')).find(Boolean);
    fireEvent.click(within(fila).getByRole('button', { name: /Reactivar/ }));

    await waitFor(() => expect(http.apiRequest).toHaveBeenCalledWith('/api/productos/1/reactivar', { method: 'PUT' }));
  });

  it('desactivar pide confirmar, avisa y recarga; si no confirma no hace nada', async () => {
    const { onCambio } = await abrir();
    confirmMock.mockResolvedValueOnce(false);

    fireEvent.click(screen.getAllByTitle('Desactivar producto')[0]);
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(http.apiDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByTitle('Desactivar producto')[0]);

    await waitFor(() => expect(http.apiDelete).toHaveBeenCalledWith('/api/productos/1'));
    expect(await screen.findByText('Producto "Bolso de mano" desactivado')).toBeTruthy();
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
    expect(confirmMock).toHaveBeenLastCalledWith(expect.objectContaining({ confirmLabel: 'Desactivar' }));
  });

  it('registrar un producto lo crea en el catalogo de cartera con stock inicial, sin proveedor, y avisa a la pantalla', async () => {
    const { onCambio } = await abrir();

    fireEvent.click(screen.getByRole('button', { name: /Registrar producto/ }));
    const modal = screen.getByTestId('modal');
    expect(within(modal).getByText('Registrar producto de cartera')).toBeTruthy();
    expect(within(modal).queryByLabelText('Proveedor')).toBeNull();
    fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: 'Cobija' } });
    fireEvent.change(within(modal).getAllByLabelText('Precio de costo', { selector: 'input' })[0], { target: { value: '30000' } });
    fireEvent.change(within(modal).getAllByLabelText('Precio de venta', { selector: 'input' })[0], { target: { value: '45000' } });
    fireEvent.change(within(modal).getByLabelText('Stock inicial'), { target: { value: '6' } });
    fireEvent.click(within(modal).getAllByRole('button', { name: /Agregar producto/ }).pop());

    await waitFor(() => expect(http.apiPost).toHaveBeenCalledWith('/api/productos', expect.objectContaining({
      nombre: 'Cobija', catalogo: 'cartera', precio_costo: 30000, precio_venta: 45000, stock_actual: 6, proveedor_id: null,
    })));
    expect(await screen.findByText('Producto agregado correctamente')).toBeTruthy();
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
  });

  it('vender por debajo del costo pide confirmar antes de guardar', async () => {
    await abrir();
    confirmMock.mockResolvedValueOnce(false);

    fireEvent.click(screen.getByRole('button', { name: /Registrar producto/ }));
    const modal = screen.getByTestId('modal');
    fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: 'Cobija' } });
    fireEvent.change(within(modal).getAllByLabelText('Precio de costo', { selector: 'input' })[0], { target: { value: '30000' } });
    fireEvent.change(within(modal).getAllByLabelText('Precio de venta', { selector: 'input' })[0], { target: { value: '20000' } });
    expect(within(modal).getByText(/por debajo del costo/)).toBeTruthy();
    fireEvent.click(within(modal).getAllByRole('button', { name: /Agregar producto/ }).pop());

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Precio por debajo del costo' })));
    expect(http.apiPost).not.toHaveBeenCalled();
  });

  it('editar no muestra proveedor y enviar solo lo cambiado no toca el proveedor', async () => {
    await abrir();

    fireEvent.click(screen.getAllByTitle('Editar producto')[0]);
    const modal = screen.getByTestId('modal');
    expect(within(modal).queryByLabelText('Proveedor')).toBeNull();
    fireEvent.change(within(modal).getAllByLabelText('Precio de venta', { selector: 'input' })[0], { target: { value: '52000' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(http.apiPatch).toHaveBeenCalledWith('/api/productos/1', { precio_venta: 52000 }));
  });

  it('el historial y el ajuste de stock estan a un clic', async () => {
    await abrir();

    fireEvent.click(screen.getAllByTitle('Historial de stock')[0]);

    expect(consultas().length).toBeGreaterThan(0);
    await waitFor(() => expect(consultas().some((e) => e.includes('/api/productos/1/movimientos-stock'))).toBe(true));
  });

  it('sin productos explica como empezar y sin resultados lo dice distinto', async () => {
    await abrir({ productos: [] });
    expect(await screen.findByText('Todavía no hay productos de cartera: registra el primero')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Agotados' }));

    expect(await screen.findByText('No se encontraron productos con ese criterio')).toBeTruthy();
  });
});
