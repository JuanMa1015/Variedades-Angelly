// Flujo completo del POS con los componentes reales (solo se simulan la API y el virtualizador del grid).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const abrirCajaMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/httpClient', () => ({ apiGet: apiGetMock, apiPost: apiPostMock }));
vi.mock('../../api/cajaApi', () => ({ abrirCaja: abrirCajaMock }));
const auth = vi.hoisted(() => ({ user: { username: 'vendedor1', role: 'vendedor' } }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ token: 'fake-token', user: auth.user }) }));
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
    localStorage.clear();
    auth.user = { username: 'vendedor1', role: 'vendedor' };
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
      clave_idempotencia: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
    }));
    expect(await screen.findByText('Venta completada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    expect(await screen.findByText('El ticket está vacío')).toBeInTheDocument();
  });

  it('F9 cobra y F2 con el comprobante abierto empieza una venta nueva', async () => {
    await renderPos();
    agregar('Arroz Diana');

    fireEvent.keyDown(window, { key: 'F9' });
    await screen.findByText('Venta completada', {}, { timeout: 4000 });
    fireEvent.keyDown(window, { key: 'F2' });

    expect(await screen.findByText('El ticket está vacío', {}, { timeout: 4000 })).toBeInTheDocument();
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

  it('recupera por ID el precio de un producto ausente del catálogo inicial', async () => {
    localStorage.setItem('angelly.pos.tickets.v1', JSON.stringify({
      counter: 1,
      tickets: [{ id: 'guardado', numero: 1, items: [{ producto_id: '235', cantidad: 15 }] }],
    }));
    await renderPos();
    let responder;
    apiGetMock.mockImplementationOnce(() => new Promise((resolve) => { responder = resolve; }));

    fireEvent.click(screen.getByRole('button', { name: 'Recuperar ticket 1' }));
    expect(apiGetMock).toHaveBeenCalledWith('/api/productos?catalogo=tienda&ids=235');
    expect(within(ticket()).getByText('Precio sin confirmar')).toBeInTheDocument();
    expect(within(ticket()).getByRole('button', { name: 'Confirma los productos' })).toBeDisabled();
    responder([{ id: 235, nombre: 'Chicle', precio_venta: 300, stock_actual: 20 }]);

    expect(await within(ticket()).findByText('Chicle')).toBeInTheDocument();
    expect(within(ticket()).getByLabelText('Cantidad: 15')).toBeInTheDocument();
    expect(within(ticket()).getByRole('button', { name: /^Cobrar .*4\.500/ })).toBeEnabled();
  });

  it('si un producto del ticket en espera ya no existe lo avisa y no deja cobrar', async () => {
    localStorage.setItem('angelly.pos.tickets.v1', JSON.stringify({
      counter: 1,
      tickets: [{ id: 'guardado', numero: 1, items: [{ producto_id: '999', cantidad: 2 }] }],
    }));
    await renderPos();
    apiGetMock.mockResolvedValueOnce([]);

    fireEvent.click(screen.getByRole('button', { name: 'Recuperar ticket 1' }));

    expect(await screen.findByText(/Un producto del ticket ya no está disponible en la tienda/)).toBeInTheDocument();
    expect(within(ticket()).getByRole('button', { name: 'Confirma los productos' })).toBeDisabled();
  });

  it('el ticket en curso sobrevive a irse a otro módulo y volver', async () => {
    mockApi();
    const primera = render(<MemoryRouter><Ventas /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Agregar Arroz Diana' });
    agregar('Arroz Diana');
    agregar('Arroz Diana');
    primera.unmount();

    render(<MemoryRouter><Ventas /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Agregar Arroz Diana' });

    expect(within(ticket()).getByText('Arroz Diana')).toBeInTheDocument();
    expect(within(ticket()).getByLabelText('Cantidad: 2')).toBeInTheDocument();
    expect(within(ticket()).getByRole('button', { name: /^Cobrar .*7\.000/ })).toBeEnabled();
  });

  it('al volver, los productos del borrador que no están en el catálogo cargado se piden por ID', async () => {
    localStorage.setItem('angelly.pos.borrador.v1.vendedor1', JSON.stringify({ items: [{ producto_id: '1', cantidad: 1 }, { producto_id: '384', cantidad: 2 }] }));
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/productos?catalogo=tienda&ids=384') return Promise.resolve([{ id: 384, nombre: 'Atun real', precio_venta: 4800, stock_actual: 9 }]);
      if (endpoint.startsWith('/api/productos/paginados')) return Promise.resolve({ data: productos });
      if (endpoint === '/api/caja/estado') return Promise.resolve({ abierta: true });
      return Promise.resolve([]);
    });
    render(<MemoryRouter><Ventas /></MemoryRouter>);

    expect(await within(ticket()).findByText('Atun real')).toBeInTheDocument();
    expect(within(ticket()).queryByText(/Producto #384/)).not.toBeInTheDocument();
    expect(within(ticket()).getByRole('button', { name: /^Cobrar .*13\.100/ })).toBeEnabled();
    expect(apiGetMock.mock.calls.filter(([endpoint]) => endpoint.includes('ids=384'))).toHaveLength(1);
  });

  it('el recuadro En espera muestra cada ticket con su total y un botón Abrir', async () => {
    await renderPos();
    agregar('Arroz Diana');
    agregar('Arroz Diana');

    fireEvent.click(within(ticket()).getByRole('button', { name: /Poner en espera/ }));

    const recuadro = within(await screen.findByLabelText('Tickets en espera'));
    expect(recuadro.getByText('1 ticket en espera')).toBeInTheDocument();
    expect(recuadro.getByText(/2 productos · \$ 7\.000/)).toBeInTheDocument();
    expect(recuadro.getByRole('button', { name: 'Recuperar ticket 1' })).toHaveTextContent('Abrir');
  });

  it('descartar un ticket en espera pide confirmar y si se cancela no se pierde', async () => {
    await renderPos();
    agregar('Arroz Diana');
    fireEvent.keyDown(window, { key: 'F4' });
    await screen.findByText(/Ticket 1 en espera/);

    fireEvent.click(screen.getByRole('button', { name: 'Descartar ticket 1' }));
    expect(await screen.findByText(/¿Descartar el ticket 1 \(1 producto\)\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Recuperar ticket 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar ticket 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Recuperar ticket 1' })).not.toBeInTheDocument());
  });

  it('al elegir un producto de una búsqueda, la búsqueda se borra y el cursor vuelve a la barra', async () => {
    await renderPos();
    const barra = screen.getByLabelText('Buscar producto o escanear código de barras');
    fireEvent.change(barra, { target: { value: 'girasol' } });
    expect(screen.queryByRole('button', { name: 'Agregar Arroz Diana' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Aceite Girasol' }));

    expect(barra).toHaveValue('');
    expect(barra).toHaveFocus();
    expect(within(ticket()).getByText('Aceite Girasol')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar Arroz Diana' })).toBeInTheDocument();
  });

  it('con el + del ticket no se pasa del stock', async () => {
    await renderPos();
    agregar('Aceite Girasol');
    agregar('Aceite Girasol');
    agregar('Aceite Girasol');

    fireEvent.click(within(ticket()).getByRole('button', { name: 'Agregar una unidad de Aceite Girasol' }));

    expect(await screen.findByText(/"Aceite Girasol" solo tiene 3 en stock/)).toBeInTheDocument();
    expect(within(ticket()).getByLabelText('Cantidad: 3')).toBeInTheDocument();
  });

  it('si el cobro falla por la conexión, reintentar el mismo ticket reutiliza la clave y no duplica la venta', async () => {
    await renderPos();
    agregar('Arroz Diana');
    apiPostMock.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce({ puntos_otorgados: 0 });

    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    expect(await screen.findByText('Venta completada', {}, { timeout: 4000 })).toBeInTheDocument();

    const [primera, segunda] = apiPostMock.mock.calls.filter(([endpoint]) => endpoint === '/api/ventas').map(([, cuerpo]) => cuerpo);
    expect(segunda.clave_idempotencia).toBe(primera.clave_idempotencia);
  });

  it('si el ticket cambia entre intentos, el cobro usa una clave nueva', async () => {
    await renderPos();
    agregar('Arroz Diana');
    apiPostMock.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce({ puntos_otorgados: 0 });

    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    await screen.findByText('Failed to fetch');
    agregar('Aceite Girasol');
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    await screen.findByText('Venta completada', {}, { timeout: 4000 });

    const [primera, segunda] = apiPostMock.mock.calls.filter(([endpoint]) => endpoint === '/api/ventas').map(([, cuerpo]) => cuerpo);
    expect(segunda.clave_idempotencia).not.toBe(primera.clave_idempotencia);
  });

  it('una venta nueva después de una cobrada no hereda la clave anterior', async () => {
    await renderPos();
    agregar('Arroz Diana');
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    await screen.findByText('Venta completada');
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    agregar('Arroz Diana');
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    await waitFor(() => expect(apiPostMock.mock.calls.filter(([endpoint]) => endpoint === '/api/ventas')).toHaveLength(2));

    const [primera, segunda] = apiPostMock.mock.calls.map(([, cuerpo]) => cuerpo);
    expect(segunda.clave_idempotencia).not.toBe(primera.clave_idempotencia);
  });

  const aplicarDescuento = (tipo, valor, motivo = 'Cliente frecuente') => {
    fireEvent.click(within(ticket()).getByRole('button', { name: /Aplicar descuento/ }));
    if (tipo === 'monto') fireEvent.click(within(ticket()).getByRole('radio', { name: 'Descuento en pesos' }));
    const campo = tipo === 'monto' ? within(ticket()).getByLabelText('Pesos de descuento') : within(ticket()).getByLabelText('Porcentaje de descuento');
    fireEvent.change(campo, { target: { value: String(valor) } });
    fireEvent.change(within(ticket()).getByLabelText('Motivo del descuento'), { target: { value: motivo } });
  };

  it('un descuento dentro del límite baja el total y viaja en la venta sin pedir clave', async () => {
    await renderPos();
    agregar('Arroz Diana');
    agregar('Arroz Diana'); // 7.000

    aplicarDescuento('porcentaje', 5);

    expect(within(ticket()).getByRole('button', { name: /^Cobrar .*6\.650/ })).toBeEnabled(); // 7.000 - 350
    expect(within(ticket()).getByLabelText('Descuento manual')).toHaveTextContent(/Descuento: −.*350.*\(5 %\)/);
    expect(within(ticket()).queryByLabelText('Usuario del administrador')).not.toBeInTheDocument();
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', expect.objectContaining({
      descuento_manual: { tipo: 'porcentaje', valor: 5, motivo: 'Cliente frecuente' },
      monto_recibido: 6650,
    })));
    const cuerpo = apiPostMock.mock.calls.find(([endpoint]) => endpoint === '/api/ventas')[1];
    expect(cuerpo).not.toHaveProperty('autorizador_usuario');
    expect(await screen.findByText('Venta completada')).toBeInTheDocument();
    expect(screen.getByText('Descuento')).toBeInTheDocument();
  });

  it('un descuento en pesos también funciona', async () => {
    await renderPos();
    agregar('Aceite Girasol'); // 9.800

    aplicarDescuento('monto', 400, 'Empaque roto');

    expect(within(ticket()).getByRole('button', { name: /^Cobrar .*9\.400/ })).toBeEnabled();
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', expect.objectContaining({ descuento_manual: { tipo: 'monto', valor: 400, motivo: 'Empaque roto' } })));
  });

  it('pasado el límite el vendedor debe dar la clave de un administrador y esa clave no se guarda', async () => {
    await renderPos();
    agregar('Arroz Diana');
    agregar('Arroz Diana');

    aplicarDescuento('porcentaje', 10);
    expect(within(ticket()).getByText(/pasa del 5 %: necesita un administrador/)).toBeInTheDocument();
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    expect(await screen.findByText(/necesita usuario y clave de un administrador/)).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();

    fireEvent.change(within(ticket()).getByLabelText('Usuario del administrador'), { target: { value: 'angelly_admin' } });
    fireEvent.change(within(ticket()).getByLabelText('Clave del administrador'), { target: { value: 'secreta-777' } });
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', expect.objectContaining({
      descuento_manual: expect.objectContaining({ valor: 10 }),
      autorizador_usuario: 'angelly_admin',
      autorizador_password: 'secreta-777',
    })));
    await screen.findByText('Venta completada');
    const guardado = Object.keys(localStorage).map((clave) => localStorage.getItem(clave)).join('|');
    expect(guardado).not.toContain('secreta-777');
  });

  it('un administrador no necesita clave: se autoriza solo', async () => {
    auth.user = { username: 'angelly_superadmin', role: 'superadmin' };
    await renderPos();
    agregar('Arroz Diana');
    agregar('Arroz Diana');

    aplicarDescuento('porcentaje', 10);

    expect(within(ticket()).getByText(/lo autorizas tú/)).toBeInTheDocument();
    expect(within(ticket()).queryByLabelText('Usuario del administrador')).not.toBeInTheDocument();
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalled());
  });

  it('el descuento exige motivo y se puede quitar', async () => {
    await renderPos();
    agregar('Arroz Diana');

    aplicarDescuento('porcentaje', 3, '');
    fireEvent.click(within(ticket()).getByRole('button', { name: /^Cobrar/ }));
    expect(await screen.findByText('Escribe el motivo del descuento')).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();

    fireEvent.click(within(ticket()).getByRole('button', { name: 'Quitar descuento' }));
    expect(within(ticket()).getByRole('button', { name: /^Cobrar .*3\.500/ })).toBeEnabled();
    expect(within(ticket()).getByRole('button', { name: /Aplicar descuento/ })).toBeInTheDocument();
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

  it('el POS tampoco abre la caja sin declarar el efectivo inicial', async () => {
    await renderPos({ cajaAbierta: false });

    expect(await screen.findByRole('button', { name: 'Abrir caja y vender' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caja y vender' }));

    expect(abrirCajaMock).not.toHaveBeenCalled();
  });

  it('si la recarga falla tras abrir la caja no lo presenta como error de apertura', async () => {
    abrirCajaMock.mockResolvedValue({ id: 1 });
    await renderPos({ cajaAbierta: false });
    await screen.findByText(/La caja está cerrada/);

    apiGetMock.mockRejectedValue(new Error('Sin red'));
    fireEvent.click(screen.getByLabelText(/Empiezo sin efectivo en el cajón/));
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
