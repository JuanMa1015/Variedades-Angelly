// Flujo completo del POS con los componentes reales (solo se simulan la API y el virtualizador del grid).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const abrirCajaMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/httpClient', () => ({ apiGet: apiGetMock, apiPost: apiPostMock }));
vi.mock('../../api/cajaApi', () => ({ abrirCaja: abrirCajaMock }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ token: 'fake-token' }) }));
vi.mock('react-virtuoso', () => ({
  VirtuosoGrid: ({ totalCount, itemContent, listClassName }) => (
    <div className={listClassName}>
      {Array.from({ length: totalCount }, (_, index) => <div key={index}>{itemContent(index)}</div>)}
    </div>
  ),
}));

import Ventas from '../Ventas';

const productos = [
  { id: 1, nombre: 'Arroz Diana', precio_venta: 3500, stock_actual: 10, codigo_barras: '770101' },
  { id: 2, nombre: 'Aceite Girasol', precio_venta: 9800, stock_actual: 3, codigo_barras: '770102' },
  { id: 3, nombre: 'Agua Sabor', precio_venta: 1200, stock_actual: 0, codigo_barras: '770103' },
];

const mockApi = ({ cajaAbierta = true, remoto = [], puntosAna = 95, valorPunto } = {}) => {
  apiGetMock.mockImplementation((endpoint) => {
    if (endpoint.includes('&q=')) return Promise.resolve({ data: remoto });
    if (endpoint.startsWith('/api/productos/paginados')) return Promise.resolve({ data: productos });
    if (endpoint === '/api/clientes/tienda-fiado') return Promise.resolve([{ id: 10, nombre: 'Marta', deuda_total: 0 }]);
    if (endpoint === '/api/fidelizacion/clientes') return Promise.resolve([{ id: 4, nombre: 'Ana', puntos_acumulados: puntosAna }]);
    if (endpoint === '/api/fidelizacion/config') return Promise.resolve({ umbral_bono: 100, pesos_por_punto: 1000, valor_punto: valorPunto });
    if (endpoint === '/api/caja/estado') return Promise.resolve({ abierta: cajaAbierta });
    return Promise.resolve([]);
  });
};

const renderPos = async (options) => {
  mockApi(options);
  render(<MemoryRouter><Ventas /></MemoryRouter>);
  if (options?.cajaAbierta === false) return;
  await screen.findByRole('button', { name: 'Agregar Arroz Diana' });
};

const ticket = () => screen.getByRole('region', { name: 'Ticket de venta' });
const agregar = (nombre) => fireEvent.click(screen.getByRole('button', { name: `Agregar ${nombre}` }));

describe('POS: flujo completo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPostMock.mockResolvedValue({ puntos_otorgados: 0 });
    window.print = vi.fn();
  });

  it('agregar productos arma el ticket con su total', async () => {
    await renderPos();

    agregar('Arroz Diana');
    agregar('Arroz Diana');
    agregar('Aceite Girasol');

    expect(within(ticket()).getByText('Arroz Diana')).toBeInTheDocument();
    expect(within(ticket()).getByRole('button', { name: /^Cobrar .*16\.800/ })).toBeInTheDocument();
    expect(within(ticket()).getByText('3 ítems')).toBeInTheDocument();
  });

  it('no permite agregar mas unidades que el stock', async () => {
    await renderPos();

    for (let i = 0; i < 6; i += 1) agregar('Aceite Girasol'); // stock = 3

    expect(within(ticket()).getByLabelText('Cantidad: 3')).toBeInTheDocument();
  });

  it('cobrar con el campo vacio es pago exacto y muestra el comprobante', async () => {
    await renderPos();
    agregar('Arroz Diana');

    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', {
      items: [{ producto_id: 1, cantidad: 1 }],
      es_fiado: false,
      metodo_pago: 'efectivo',
      monto_recibido: 3500,
    }));
    expect(await screen.findByText('Venta completada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    expect(await screen.findByText('El ticket está vacío')).toBeInTheDocument();
  });

  it('F9 cobra y F2 con el comprobante abierto empieza una venta nueva', async () => {
    await renderPos();
    agregar('Arroz Diana');

    fireEvent.keyDown(window, { key: 'F9' });
    await screen.findByText('Venta completada');
    fireEvent.keyDown(window, { key: 'F2' });

    expect(await screen.findByText('El ticket está vacío')).toBeInTheDocument();
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  it('efectivo insuficiente no registra la venta y explica por que', async () => {
    await renderPos();
    agregar('Arroz Diana');
    fireEvent.change(within(ticket()).getByLabelText('Monto recibido'), { target: { value: '1000' } });

    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));

    expect(await screen.findByText('El dinero recibido es menor al total de la venta')).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('el cliente de fidelizacion viaja en la venta y el comprobante muestra los puntos', async () => {
    apiPostMock.mockResolvedValue({ puntos_otorgados: 3 });
    await renderPos();
    agregar('Arroz Diana');
    fireEvent.focus(within(ticket()).getByRole('combobox', { name: 'Cliente de fidelización' }));
    fireEvent.click(await screen.findByRole('option', { name: /Ana/ }));

    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', expect.objectContaining({ cliente_fidelizacion_id: 4 })));
    expect(await screen.findByText('+3')).toBeInTheDocument();
  });

  it('usar puntos descuenta del total y viaja en la venta', async () => {
    apiPostMock.mockResolvedValue({ puntos_otorgados: 0 });
    await renderPos({ puntosAna: 300, valorPunto: 20 });
    agregar('Aceite Girasol'); // $9.800
    agregar('Aceite Girasol'); // $19.600
    fireEvent.focus(within(ticket()).getByRole('combobox', { name: 'Cliente de fidelización' }));
    fireEvent.click(await screen.findByRole('option', { name: /Ana/ }));

    fireEvent.click(await within(ticket()).findByRole('checkbox', { name: /Usar 300 puntos/ }));

    expect(within(ticket()).getByText(/Descuento por 300 puntos/)).toBeInTheDocument();
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar .*13\.600/ })); // 19.600 - 6.000
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', expect.objectContaining({
      cliente_fidelizacion_id: 4,
      puntos_a_canjear: 300,
      monto_recibido: 13600,
    })));
  });

  it('el canje nunca supera el total de la venta', async () => {
    await renderPos({ puntosAna: 900, valorPunto: 20 });
    agregar('Aceite Girasol'); // $9.800 -> maximo 490 puntos
    fireEvent.focus(within(ticket()).getByRole('combobox', { name: 'Cliente de fidelización' }));
    fireEvent.click(await screen.findByRole('option', { name: /Ana/ }));

    expect(await within(ticket()).findByRole('checkbox', { name: /Usar 490 puntos/ })).toBeInTheDocument();
  });

  it('con menos puntos del minimo no ofrece canjear', async () => {
    await renderPos({ puntosAna: 95, valorPunto: 20 });
    agregar('Arroz Diana');
    fireEvent.focus(within(ticket()).getByRole('combobox', { name: 'Cliente de fidelización' }));
    fireEvent.click(await screen.findByRole('option', { name: /Ana/ }));

    expect(within(ticket()).queryByRole('checkbox', { name: /Usar/ })).not.toBeInTheDocument();
  });

  it('inscribir un cliente desde el mostrador exige autorizar sus datos y lo deja seleccionado', async () => {
    apiPostMock.mockResolvedValue({ id: 8, nombre: 'Maria Perez', telefono_whatsapp: '3104445566', puntos_acumulados: 0 });
    await renderPos();

    fireEvent.click(within(ticket()).getByRole('button', { name: 'Inscribir cliente de fidelización' }));
    fireEvent.change(screen.getByLabelText('Nombre del cliente de fidelización'), { target: { value: 'Maria Perez' } });
    fireEvent.change(screen.getByLabelText('WhatsApp del cliente de fidelización'), { target: { value: '310 444 5566' } });
    const guardar = screen.getByRole('button', { name: 'Inscribir cliente' });
    expect(guardar).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(guardar);

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/fidelizacion/clientes', {
      nombre: 'Maria Perez',
      telefono_whatsapp: '3104445566',
      acepta_datos: true,
    }));
    expect(await screen.findByText(/Maria Perez quedó inscrito/)).toBeInTheDocument();
  });

  it('si otra pestaña cerró la caja, el cobro rechazado vuelve a mostrar la apertura', async () => {
    apiPostMock.mockRejectedValue(Object.assign(new Error('La caja esta cerrada. Abre la caja para registrar ventas'), { status: 409 }));
    await renderPos();
    agregar('Arroz Diana');
    mockApi({ cajaAbierta: false });

    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));

    expect(await screen.findByRole('button', { name: 'Abrir caja y vender' })).toBeInTheDocument();
  });

  it('fiado: pide cliente y envia abono', async () => {
    await renderPos();
    agregar('Aceite Girasol');
    fireEvent.click(within(ticket()).getByRole('radio', { name: 'Fiado' }));

    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    expect(await screen.findByText('Selecciona el cliente al que se le fía')).toBeInTheDocument();

    const buscador = within(ticket()).getByRole('combobox', { name: 'Cliente que fía' });
    fireEvent.change(buscador, { target: { value: 'mar' } }); // busqueda en vivo
    fireEvent.click(await screen.findByRole('option', { name: /Marta/ }));
    fireEvent.change(within(ticket()).getByLabelText('Abono inicial'), { target: { value: '2000' } });
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', expect.objectContaining({
      es_fiado: true,
      cliente_tienda_id: 10,
      abono_inicial: 2000,
      fiado_origen: 'tienda',
    })));
  });

  it('tickets en espera: guardar, atender otro y recuperar', async () => {
    await renderPos();
    agregar('Arroz Diana');
    agregar('Arroz Diana');

    fireEvent.keyDown(window, { key: 'F4' });
    expect(await screen.findByText(/Ticket 1 en espera/)).toBeInTheDocument();
    expect(screen.getByText('El ticket está vacío')).toBeInTheDocument();

    agregar('Aceite Girasol');
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar ticket 1' }));

    // El ticket actual (aceite) pasa a espera y vuelve el de arroz.
    expect(within(ticket()).getByText('Arroz Diana')).toBeInTheDocument();
    expect(within(ticket()).getByLabelText('Cantidad: 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recuperar ticket 2' })).toBeInTheDocument();
  });

  it('vaciar el ticket pide confirmacion', async () => {
    await renderPos();
    agregar('Arroz Diana');

    fireEvent.click(within(ticket()).getByRole('button', { name: 'Vaciar ticket' }));
    expect(await screen.findByText('¿Quitar todos los productos del ticket actual?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('El ticket está vacío')).toBeInTheDocument();
  });

  it('Enter en la barra agrega el unico resultado de la busqueda por nombre', async () => {
    await renderPos();
    const barra = screen.getByLabelText('Buscar producto o escanear código de barras');

    fireEvent.change(barra, { target: { value: 'girasol' } });
    fireEvent.keyDown(barra, { key: 'Enter' });

    await waitFor(() => expect(within(ticket()).getByText('Aceite Girasol')).toBeInTheDocument());
    expect(barra).toHaveValue('');
  });

  it('Enter con un codigo de barras lo agrega y Esc limpia la busqueda', async () => {
    await renderPos();
    const barra = screen.getByLabelText('Buscar producto o escanear código de barras');

    fireEvent.change(barra, { target: { value: '770101' } });
    fireEvent.keyDown(barra, { key: 'Enter' });
    await waitFor(() => expect(within(ticket()).getByText('Arroz Diana')).toBeInTheDocument());

    fireEvent.change(barra, { target: { value: 'algo' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(barra).toHaveValue('');
  });

  it('un producto agotado no se agrega por escaneo', async () => {
    await renderPos();
    const barra = screen.getByLabelText('Buscar producto o escanear código de barras');

    fireEvent.change(barra, { target: { value: '770103' } });
    fireEvent.keyDown(barra, { key: 'Enter' });

    expect(await screen.findByText('"Agua Sabor" no tiene stock disponible')).toBeInTheDocument();
  });

  it('con la caja cerrada pide abrirla en la misma pantalla y luego deja vender', async () => {
    abrirCajaMock.mockResolvedValue({ id: 1 });
    await renderPos({ cajaAbierta: false });

    expect(await screen.findByText(/La caja está cerrada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar Arroz Diana' })).not.toBeInTheDocument();

    mockApi({ cajaAbierta: true });
    fireEvent.change(screen.getByLabelText('Efectivo inicial'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caja y vender' }));

    await waitFor(() => expect(abrirCajaMock).toHaveBeenCalledWith({ monto_inicial: 50000 }));
    expect(await screen.findByRole('button', { name: 'Agregar Arroz Diana' })).toBeInTheDocument();
  });

  it('si la recarga falla tras abrir la caja no lo presenta como error de apertura', async () => {
    abrirCajaMock.mockResolvedValue({ id: 1 });
    await renderPos({ cajaAbierta: false });
    await screen.findByText(/La caja está cerrada/);

    apiGetMock.mockRejectedValue(new Error('Sin red'));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caja y vender' }));

    expect(await screen.findByText(/La caja se abrió, pero no se pudo actualizar/)).toBeInTheDocument();
    expect(screen.queryByText('No fue posible abrir la caja')).not.toBeInTheDocument();
  });

  it('el historial de ventas se abre desde el punto de venta', async () => {
    await renderPos();
    apiGetMock.mockImplementation(() => Promise.resolve({ data: [] }));

    fireEvent.click(screen.getByRole('button', { name: /Historial de ventas/ }));

    expect(await screen.findByText('Todavía no hay ventas.')).toBeInTheDocument();
  });

  it('marcar favorito agrega el producto a la fila de acceso rapido', async () => {
    await renderPos();

    fireEvent.click(screen.getByRole('button', { name: 'Marcar Arroz Diana como favorito' }));

    const fila = await screen.findByText('Favoritos y frecuentes');
    expect(within(fila.parentElement).getByText('Arroz Diana')).toBeInTheDocument();
  });

  it('crear cliente desde el fiado abre el dialogo con el foco en el nombre', async () => {
    await renderPos();
    agregar('Arroz Diana');
    fireEvent.click(within(ticket()).getByRole('radio', { name: 'Fiado' }));

    fireEvent.click(within(ticket()).getByRole('button', { name: 'Crear cliente nuevo' }));

    expect(await screen.findByText('Nuevo cliente fiado tienda')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del cliente')).toHaveFocus();
  });
});
