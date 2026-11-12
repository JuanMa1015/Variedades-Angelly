import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchClientesCartera: vi.fn(), fetchResumenDeuda: vi.fn() }));
vi.mock('../../../api/carteraClientesApi', () => api);
vi.mock('../../../components/ErrorMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="error-message">{message}</div> : null),
}));
vi.mock('../../../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));

import CarteraClientesSection from '../CarteraClientesSection';

const formatMoney = (v) => `$ ${Number(v).toLocaleString('es-CO')}`;
const cliente = (extra = {}) => ({ id: 1, nombre: 'Danilo', documento: '1039048367', telefono_whatsapp: '573205603611', deuda_total: 522800, compras_total: 900000, compras_cantidad: 4, activo: true, estado_deuda: 'moroso', dias_deuda: 75, ...extra });
const CLIENTES = [
  cliente(),
  cliente({ id: 2, nombre: 'Gilar', documento: '123456789', telefono_whatsapp: null, deuda_total: 0, compras_total: 0, compras_cantidad: 0, estado_deuda: 'sin_deuda', dias_deuda: null }),
  cliente({ id: 3, nombre: 'Marta', documento: null, deuda_total: 20000, estado_deuda: 'al_dia', dias_deuda: 2 }),
];
const RESUMEN = { clientes_activos: 3, con_deuda: 2, deuda_total: 542800, en_alerta: 0, deuda_en_alerta: 0, morosos: 1, deuda_morosa: 522800, desactivados: 2 };
const pagina = (data, totalPages = 1) => ({ data, page: { total: data.length, total_pages: totalPages, current_page: 1, limit: 10 } });
const ultima = () => api.fetchClientesCartera.mock.calls.at(-1)[0];

const acciones = () => ({
  startNewCliente: vi.fn(),
  startEditingCliente: vi.fn(),
  handleDeleteCliente: vi.fn(),
  handleReactivarCliente: vi.fn(),
  handleVerDetalle: vi.fn(),
});

const abrir = async ({ clientes = CLIENTES, resumen = RESUMEN, totalPages = 1, props = acciones() } = {}) => {
  api.fetchClientesCartera.mockResolvedValue(pagina(clientes, totalPages));
  api.fetchResumenDeuda.mockResolvedValue(resumen);
  const vista = render(<CarteraClientesSection formatMoney={formatMoney} recargar={0} {...props} />);
  await waitFor(() => expect(api.fetchClientesCartera).toHaveBeenCalled());
  if (clientes.length > 0) await waitFor(() => expect(screen.getAllByText('Danilo').length).toBeGreaterThan(0));
  return { props, ...vista };
};

const fila = (nombre) => screen.getAllByText(nombre).map((el) => el.closest('tr')).find(Boolean);

describe('CarteraClientesSection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('pide al servidor la primera pagina de activos y el resumen de toda la cartera', async () => {
    await abrir();

    expect(api.fetchClientesCartera).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, estado: 'activos', q: '' }));
    expect(screen.getByText('Clientes activos').nextElementSibling.textContent).toBe('3');
    expect(screen.getByText('2 desactivados')).toBeTruthy();
    expect(screen.getByText('Deuda total').nextElementSibling.textContent).toBe('$ 542.800');
    expect(screen.getByText('Morosos', { selector: 'p' }).nextElementSibling.textContent).toBe('1');
  });

  it('cada cliente muestra su nivel, desde cuando debe, su WhatsApp legible y sus compras', async () => {
    await abrir();

    const danilo = fila('Danilo');
    expect(within(danilo).getByText('Moroso')).toBeTruthy();
    expect(within(danilo).getByText('Debe hace 75 días')).toBeTruthy();
    expect(within(danilo).getByText('320 560 3611')).toBeTruthy();
    expect(within(danilo).getByText(/4 · \$ 900\.000/)).toBeTruthy();
    expect(within(fila('Gilar')).getByText('Sin deuda')).toBeTruthy();
    expect(within(fila('Marta')).getByText('Al día')).toBeTruthy();
  });

  it('buscar escribiendo pide al servidor esa busqueda sin recargar la pagina', async () => {
    await abrir();

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'dan' } });

    await waitFor(() => expect(ultima()).toMatchObject({ q: 'dan', page: 1 }));
  });

  it('los filtros se envian al servidor', async () => {
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'En alerta' }));
    await waitFor(() => expect(ultima().estado).toBe('alerta'));
    fireEvent.click(screen.getByRole('button', { name: 'Desactivados' }));
    await waitFor(() => expect(ultima().estado).toBe('desactivados'));
    expect(screen.getByRole('button', { name: 'Desactivados' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('la paginacion pide la pagina siguiente', async () => {
    await abrir({ totalPages: 3 });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(ultima().page).toBe(2));
  });

  it('sin clientes y sin resultados se explican distinto', async () => {
    await abrir({ clientes: [] });
    expect(screen.getByText('Todavía no hay clientes registrados.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Morosos' }));

    expect(await screen.findByText('No se encontraron clientes con ese criterio.')).toBeTruthy();
  });

  it('las acciones llaman a la pantalla con el cliente elegido', async () => {
    const { props } = await abrir();
    const danilo = fila('Danilo');

    fireEvent.click(within(danilo).getByRole('button', { name: 'Ver detalle de Danilo' }));
    fireEvent.click(within(danilo).getByRole('button', { name: 'Editar a Danilo' }));
    fireEvent.click(within(danilo).getByRole('button', { name: 'Desactivar a Danilo' }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar cliente/ }));

    expect(props.handleVerDetalle).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(props.startEditingCliente).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(props.handleDeleteCliente).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(props.startNewCliente).toHaveBeenCalled();
  });

  it('un cliente desactivado se puede reactivar y no se edita', async () => {
    const { props } = await abrir({ clientes: [cliente({ activo: false, deuda_total: 0, estado_deuda: 'sin_deuda', dias_deuda: null })] });
    const danilo = fila('Danilo');

    expect(within(danilo).getByText('Desactivado')).toBeTruthy();
    expect(within(danilo).queryByRole('button', { name: /Editar a/ })).toBeNull();
    fireEvent.click(within(danilo).getByRole('button', { name: 'Reactivar a Danilo' }));

    expect(props.handleReactivarCliente).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('vuelve a pedir los datos cuando la pantalla avisa que algo cambio', async () => {
    const { props, rerender } = await abrir();
    const antes = api.fetchClientesCartera.mock.calls.length;

    rerender(<CarteraClientesSection formatMoney={formatMoney} recargar={1} {...props} />);

    await waitFor(() => expect(api.fetchClientesCartera.mock.calls.length).toBeGreaterThan(antes));
  });

  it('si falla la lista muestra el error', async () => {
    api.fetchClientesCartera.mockRejectedValue(new Error('No fue posible cargar'));
    api.fetchResumenDeuda.mockResolvedValue(RESUMEN);
    render(<CarteraClientesSection formatMoney={formatMoney} recargar={0} {...acciones()} />);

    expect(await screen.findByText('No fue posible cargar')).toBeTruthy();
  });

  it('si el resumen falla, la lista igual se muestra', async () => {
    api.fetchClientesCartera.mockResolvedValue(pagina(CLIENTES));
    api.fetchResumenDeuda.mockRejectedValue(new Error('sin red'));
    render(<CarteraClientesSection formatMoney={formatMoney} recargar={0} {...acciones()} />);

    expect((await screen.findAllByText('Danilo')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Clientes activos')).toBeNull();
  });
});
