import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchClientesCartera: vi.fn(), fetchResumenDeuda: vi.fn(), fetchCobradoCartera: vi.fn() }));
vi.mock('../../../api/carteraClientesApi', () => api);
vi.mock('../../../components/ErrorMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="error-message">{message}</div> : null),
}));
vi.mock('../../../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));

import CarteraCobrarSection from '../CarteraCobrarSection';

const formatMoney = (v) => `$ ${Number(v).toLocaleString('es-CO')}`;
const cliente = (extra = {}) => ({ id: 1, nombre: 'Danilo', documento: '1039', telefono_whatsapp: '573205603611', deuda_total: 522800, activo: true, estado_deuda: 'moroso', dias_deuda: 75, ...extra });
const CLIENTES = [cliente(), cliente({ id: 2, nombre: 'Marta', telefono_whatsapp: null, deuda_total: 20000, estado_deuda: 'al_dia', dias_deuda: 2 })];
const RESUMEN = { clientes_activos: 5, con_deuda: 2, deuda_total: 542800, en_alerta: 1, deuda_en_alerta: 20000, morosos: 1, deuda_morosa: 522800, desactivados: 0 };
const COBRADO = {
  hoy: { total: 8000, efectivo: 5000, transferencia: 3000, tarjeta: 0, abonos: 2 },
  semana: { total: 30000, efectivo: 20000, transferencia: 10000, tarjeta: 0, abonos: 6 },
  mes: { total: 90000, efectivo: 60000, transferencia: 30000, tarjeta: 0, abonos: 15 },
};
const pagina = (data, totalPages = 1) => ({ data, page: { total: data.length, total_pages: totalPages, current_page: 1, limit: 10 } });
const ultima = () => api.fetchClientesCartera.mock.calls.at(-1)[0];

const acciones = () => ({ handleAbrirWhatsapp: vi.fn(), handleRegistrarAbono: vi.fn(), handleVerDetalle: vi.fn() });

const abrir = async ({ clientes = CLIENTES, totalPages = 1, props = acciones(), cobrado = COBRADO } = {}) => {
  api.fetchClientesCartera.mockResolvedValue(pagina(clientes, totalPages));
  api.fetchResumenDeuda.mockResolvedValue(RESUMEN);
  if (cobrado instanceof Error) api.fetchCobradoCartera.mockRejectedValue(cobrado);
  else api.fetchCobradoCartera.mockResolvedValue(cobrado);
  const vista = render(<CarteraCobrarSection formatMoney={formatMoney} recargar={0} {...props} />);
  await waitFor(() => expect(api.fetchClientesCartera).toHaveBeenCalled());
  if (clientes.length > 0) await screen.findByText('Danilo');
  return { props, ...vista };
};

const tarjeta = (nombre) => screen.getByText(nombre).closest('article');

describe('CarteraCobrarSection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('pide solo a quienes deben, de mayor a menor, en la primera pagina', async () => {
    await abrir();

    expect(api.fetchClientesCartera).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, estado: 'con_deuda', q: '' }));
    expect(screen.getByRole('button', { name: 'Con deuda' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('el resumen muestra lo que falta por cobrar y lo ya cobrado hoy, semana y mes', async () => {
    await abrir();

    expect(screen.getByText('Por cobrar').nextElementSibling.textContent).toBe('$ 542.800');
    expect(screen.getByText('Morosos', { selector: 'p' }).nextElementSibling.textContent).toBe('1');
    expect(screen.getByText('Cobrado hoy').nextElementSibling.textContent).toBe('$ 8.000');
    expect(screen.getByText(/Semana \$ 30\.000 · Mes \$ 90\.000/)).toBeTruthy();
    expect(screen.getByText(/Efectivo \$ 5\.000 · Transf\. \$ 3\.000/)).toBeTruthy();
  });

  it('si falla lo cobrado, la lista y lo que se debe igual se muestran', async () => {
    await abrir({ cobrado: new Error('sin red') });

    expect(screen.getByText('Por cobrar')).toBeTruthy();
    expect(screen.queryByText('Cobrado hoy')).toBeNull();
  });

  it('cada cliente muestra lo que debe, su nivel y desde hace cuanto', async () => {
    await abrir();

    const danilo = tarjeta('Danilo');
    expect(within(danilo).getByText('$ 522.800')).toBeTruthy();
    expect(within(danilo).getByText('Moroso')).toBeTruthy();
    expect(within(danilo).getByText('Debe hace 75 días')).toBeTruthy();
    expect(within(danilo).getByText('320 560 3611')).toBeTruthy();
    expect(within(tarjeta('Marta')).getByText('Sin WhatsApp')).toBeTruthy();
  });

  it('ya no ofrece editar ni eliminar clientes ni tiene botones duplicados', async () => {
    await abrir();

    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull();
    expect(within(tarjeta('Danilo')).getAllByRole('button')).toHaveLength(3);
  });

  it('las acciones llaman a la pantalla con el cliente elegido y WhatsApp se apaga sin numero', async () => {
    const { props } = await abrir();
    const danilo = tarjeta('Danilo');

    fireEvent.click(within(danilo).getByRole('button', { name: 'Registrar abono de Danilo' }));
    fireEvent.click(within(danilo).getByRole('button', { name: 'Cobrar por WhatsApp a Danilo' }));
    fireEvent.click(within(danilo).getByRole('button', { name: 'Ver detalle de Danilo' }));

    expect(props.handleRegistrarAbono).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(props.handleAbrirWhatsapp).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(props.handleVerDetalle).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(within(tarjeta('Marta')).getByRole('button', { name: 'Cobrar por WhatsApp a Marta' })).toBeDisabled();
  });

  it('buscar escribiendo y filtrar por alerta o morosos se piden al servidor', async () => {
    await abrir();

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: '300 111' } });
    await waitFor(() => expect(ultima()).toMatchObject({ q: '300 111', page: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Morosos' }));
    await waitFor(() => expect(ultima().estado).toBe('moroso'));
  });

  it('la paginacion pide la pagina siguiente', async () => {
    await abrir({ totalPages: 3 });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(ultima().page).toBe(2));
  });

  it('sin deudores y sin resultados se explican distinto', async () => {
    await abrir({ clientes: [] });
    expect(await screen.findByText('Nadie le debe a la tienda por ahora.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'En alerta' }));

    expect(await screen.findByText('No se encontraron clientes con ese criterio.')).toBeTruthy();
  });

  it('vuelve a pedir todo cuando la pantalla avisa que se registro un abono', async () => {
    const { props, rerender } = await abrir();
    const antes = api.fetchClientesCartera.mock.calls.length;
    const antesCobrado = api.fetchCobradoCartera.mock.calls.length;

    rerender(<CarteraCobrarSection formatMoney={formatMoney} recargar={1} {...props} />);

    await waitFor(() => expect(api.fetchClientesCartera.mock.calls.length).toBeGreaterThan(antes));
    await waitFor(() => expect(api.fetchCobradoCartera.mock.calls.length).toBeGreaterThan(antesCobrado));
  });

  it('si falla la lista muestra el error', async () => {
    api.fetchClientesCartera.mockRejectedValue(new Error('No fue posible cargar'));
    api.fetchResumenDeuda.mockResolvedValue(RESUMEN);
    api.fetchCobradoCartera.mockResolvedValue(COBRADO);
    render(<CarteraCobrarSection formatMoney={formatMoney} recargar={0} {...acciones()} />);

    expect(await screen.findByText('No fue posible cargar')).toBeTruthy();
  });
});
