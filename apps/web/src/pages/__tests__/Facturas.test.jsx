import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const fetchCajaEstadoMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/httpClient', () => ({ apiGet: apiGetMock, apiPost: apiPostMock }));
vi.mock('../../api/cajaApi', () => ({ fetchCajaEstado: fetchCajaEstadoMock }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: useAuthMock }));
vi.mock('../../components/useConfirm', () => ({
  default: () => ({ confirm: confirmMock, ConfirmModal: <div data-testid="confirm-modal" /> }),
}));

import Facturas from '../Facturas';

const productos = [{ id: 1, nombre: 'Arroz Diana', precio_costo: 1190, precio_venta: 1500, codigo_barras: '770' }];

const factura = (extra = {}) => ({
  id: 7, proveedor_id: 5, proveedor_nombre: 'Distribuidora', numero_factura: 'FEV-100', subtotal: 10000, total_iva: 0, total_factura: 10000,
  creado_por: 'vendedor1', encomienda: null, porcentaje_ganancia: 0.7, fecha_creacion: '2026-11-10T10:00:00', items: [{ producto_id: 1 }], medio_pago: 'efectivo',
  anulada: false, motivo_anulacion: null, ...extra,
});

const cargarPagina = async () => {
  render(<Facturas />);
  const buscador = await screen.findByPlaceholderText('Buscar producto...');
  fireEvent.focus(buscador);
  fireEvent.click(await screen.findByText('Arroz Diana'));
};

// Lo minimo que pide una factura para guardarse: proveedor, como se pago y un producto con precio.
const prepararFactura = async ({ medio = 'transferencia', precio = '2000', proveedor = '5' } = {}) => {
  await cargarPagina();
  fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: proveedor } });
  if (medio) fireEvent.change(screen.getByLabelText('Pagado con'), { target: { value: medio } });
  fireEvent.change(screen.getByLabelText('Precio de factura sin IVA'), { target: { value: precio } });
};

const guardar = () => fireEvent.click(screen.getByRole('button', { name: /Guardar factura/ }));

describe('Facturas de compra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { // sin localStorage en este entorno de pruebas
    }
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'vendedor1', role: 'vendedor' } });
    confirmMock.mockResolvedValue(true);
    fetchCajaEstadoMock.mockResolvedValue({ abierta: true });
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/proveedores') return Promise.resolve([{ id: 5, nombre: 'Distribuidora' }]);
      if (endpoint.startsWith('/api/productos')) return Promise.resolve(productos);
      if (endpoint === '/api/facturas-compra/config') return Promise.resolve({ iva_rate: 0.19 });
      if (endpoint === '/api/facturas-compra') return Promise.resolve([]);
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
    await prepararFactura();
    fireEvent.change(await screen.findByLabelText('Nuevo precio de venta'), { target: { value: '3000' } });

    guardar();

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
    await prepararFactura();
    fireEvent.click(await screen.findByLabelText('Actualizar precio de venta'));

    guardar();

    await waitFor(() => expect(apiPostMock).toHaveBeenCalled());
    const item = apiPostMock.mock.calls[0][1].items[0];
    expect(item.actualizar_precio).toBe(false);
    expect(item).not.toHaveProperty('precio_venta');
  });

  // -- Proveedor, pago y confirmacion --

  it('no preselecciona ningun proveedor y pide elegirlo', async () => {
    await cargarPagina();
    fireEvent.change(screen.getByLabelText('Precio de factura sin IVA'), { target: { value: '2000' } });

    expect(screen.getByLabelText('Proveedor')).toHaveValue('');
    guardar();

    expect(await screen.findByText('Selecciona un proveedor')).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('exige elegir como se pago y envia el medio', async () => {
    await prepararFactura({ medio: '' });

    guardar();
    expect(await screen.findByText('Elige cómo se pagó la compra')).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Pagado con'), { target: { value: 'tarjeta' } });
    guardar();
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/facturas-compra', expect.objectContaining({ proveedor_id: 5, medio_pago: 'tarjeta' })));
  });

  it('antes de guardar pide confirmar con el total, el proveedor y como se pago', async () => {
    await prepararFactura({ medio: 'transferencia' });

    guardar();

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Guardar factura',
      variant: 'primary',
      message: expect.stringMatching(/Distribuidora.*2\.000.*pagada por transferencia.*1 producto/s),
    })));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalled());
  });

  it('si se arrepiente en la confirmacion no se guarda nada', async () => {
    confirmMock.mockResolvedValue(false);
    await prepararFactura();

    guardar();

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('un precio de venta bajo el costo pide una segunda confirmacion y se envia marcado', async () => {
    await prepararFactura();
    fireEvent.change(await screen.findByLabelText('Nuevo precio de venta'), { target: { value: '1500' } });

    guardar();

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Precio por debajo del costo', message: expect.stringContaining('Arroz Diana') })));
    await waitFor(() => expect(apiPostMock.mock.calls[0][1].items[0]).toMatchObject({ precio_venta: 1500, permitir_bajo_costo: true }));
  });

  it('si no acepta vender con perdida no se guarda', async () => {
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await prepararFactura();
    fireEvent.change(await screen.findByLabelText('Nuevo precio de venta'), { target: { value: '1500' } });

    guardar();

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(2));
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('un precio normal no pide la segunda confirmacion ni la marca', async () => {
    await prepararFactura();

    guardar();

    await waitFor(() => expect(apiPostMock).toHaveBeenCalled());
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock.mock.calls[0][1].items[0]).not.toHaveProperty('permitir_bajo_costo');
  });

  it('un numero de factura demasiado corto se rechaza antes de llamar al servidor', async () => {
    await prepararFactura();
    fireEvent.change(screen.getByPlaceholderText('FEV-36965'), { target: { value: '0' } });

    guardar();

    expect(await screen.findByText(/al menos 3 caracteres/)).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('el error del servidor (por ejemplo una factura repetida) se muestra', async () => {
    apiPostMock.mockRejectedValue(new Error('Esa factura ya esta registrada para este proveedor (#3)'));
    await prepararFactura();
    fireEvent.change(screen.getByPlaceholderText('FEV-36965'), { target: { value: 'FEV-100' } });

    guardar();

    expect(await screen.findByText(/Esa factura ya esta registrada/)).toBeTruthy();
  });

  it('la encomienda se rotula como lo que es: se resta del total', async () => {
    await cargarPagina();

    expect(screen.getByText('Encomienda (−)')).toBeTruthy();
    expect(screen.getByText(/Encomienda \(se resta\)/)).toBeTruthy();
  });

  it('con la caja cerrada no deja registrar una compra en efectivo, pero si por otro medio', async () => {
    fetchCajaEstadoMock.mockResolvedValue({ abierta: false });
    await prepararFactura({ medio: 'efectivo' });

    expect(await screen.findByText(/La caja está cerrada: ábrela para registrar una compra en efectivo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Guardar factura/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Pagado con'), { target: { value: 'credito' } });
    expect(screen.getByRole('button', { name: /Guardar factura/ })).toBeEnabled();
  });

  it('con la caja abierta explica que el efectivo sale del cajon', async () => {
    await prepararFactura({ medio: 'efectivo' });

    expect(screen.getByText(/Sale del cajón: el total de la factura se descuenta/)).toBeTruthy();
  });

  // -- Pedidos pendientes --

  const conPedidosPendientes = () => {
    const base = apiGetMock.getMockImplementation();
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.startsWith('/api/proveedores/pedidos/paginados')) {
        return Promise.resolve({ data: [{ id: 12, proveedor_id: 5, monto_estimado: 25000, fecha_creacion: '2026-11-10T10:00:00' }], page: { total: 1 } });
      }
      return base(endpoint);
    });
  };

  it('sin pedidos pendientes no ofrece enlazar la factura y no envia pedido_id', async () => {
    await prepararFactura();

    expect(screen.queryByLabelText('¿Esta factura cumple un pedido?')).toBeNull();
    guardar();

    await waitFor(() => expect(apiPostMock).toHaveBeenCalled());
    expect(apiPostMock.mock.calls[0][1]).not.toHaveProperty('pedido_id');
  });

  it('ofrece los pedidos pendientes del proveedor y envia el elegido para marcarlo recibido', async () => {
    conPedidosPendientes();
    await prepararFactura();

    const selector = await screen.findByLabelText('¿Esta factura cumple un pedido?');
    expect(apiGetMock).toHaveBeenCalledWith(expect.stringContaining('estado=enviado&limit=50&proveedor_id=5'), expect.anything());
    expect(selector).toHaveValue('');
    fireEvent.change(selector, { target: { value: '12' } });
    guardar();

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/facturas-compra', expect.objectContaining({ proveedor_id: 5, pedido_id: 12 })));
    expect(await screen.findByText(/pedido #12 marcado como recibido/)).toBeTruthy();
    expect(screen.queryByLabelText('¿Esta factura cumple un pedido?')).toBeNull();
  });
});

const pagina = (data, totalPages = 1) => ({ data, page: { total: data.length, total_pages: totalPages, current_page: 1, limit: 10 } });
const consultasHistorial = () => apiGetMock.mock.calls.map(([endpoint]) => endpoint).filter((e) => e.startsWith('/api/facturas-compra/paginadas'));

describe('Facturas registradas', () => {
  const abrirConFacturas = async (facturas, { rol = 'vendedor', totalPages = 1 } = {}) => {
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'u', role: rol } });
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/proveedores') return Promise.resolve([{ id: 5, nombre: 'Distribuidora' }, { id: 6, nombre: 'Coca-Cola' }]);
      if (endpoint.startsWith('/api/productos')) return Promise.resolve(productos);
      if (endpoint === '/api/facturas-compra/config') return Promise.resolve({ iva_rate: 0.19 });
      if (endpoint.startsWith('/api/facturas-compra/paginadas')) return Promise.resolve(pagina(facturas, totalPages));
      return Promise.resolve([]);
    });
    render(<Facturas />);
    if (facturas.length > 0) await waitFor(() => expect(screen.getAllByText('FEV-100').length).toBeGreaterThan(0));
    else await screen.findByText(/No hay facturas registradas|No se encontraron facturas/);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { // sin localStorage
    }
    confirmMock.mockResolvedValue(true);
    fetchCajaEstadoMock.mockResolvedValue({ abierta: true });
  });

  const filaDe = (texto) => screen.getAllByText(texto).map((el) => el.closest('tr')).find(Boolean);

  it('pide al servidor la primera pagina del historial', async () => {
    await abrirConFacturas([factura()]);

    expect(consultasHistorial()[0]).toContain('page=1');
    expect(consultasHistorial()[0]).toContain('limit=10');
    expect(consultasHistorial()[0]).toContain('estado=todas');
  });

  it('la lista muestra como se pago cada factura y marca las anuladas con su motivo', async () => {
    await abrirConFacturas([factura(), factura({ id: 8, numero_factura: 'FEV-200', anulada: true, motivo_anulacion: 'Error al digitar', medio_pago: null })]);

    expect(within(filaDe('FEV-100')).getByText('Efectivo')).toBeTruthy();
    const anulada = filaDe('FEV-200');
    expect(within(anulada).getByText('Anulada')).toBeTruthy();
    expect(within(anulada).getByText('Motivo: Error al digitar')).toBeTruthy();
    expect(within(anulada).getByText('Sin dato')).toBeTruthy();
    expect(within(anulada).queryByRole('button', { name: /Anular/ })).toBeNull();
  });

  it('los filtros y la busqueda se envian al servidor y vuelven a la primera pagina', async () => {
    await abrirConFacturas([factura()], { totalPages: 3 });
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(consultasHistorial().at(-1)).toContain('page=2'));

    fireEvent.change(screen.getByLabelText('Filtrar por proveedor'), { target: { value: '6' } });
    await waitFor(() => expect(consultasHistorial().at(-1)).toMatch(/proveedor_id=6.*|page=1/));
    expect(consultasHistorial().at(-1)).toContain('page=1');
    fireEvent.change(screen.getByLabelText('Filtrar por medio de pago'), { target: { value: 'credito' } });
    await waitFor(() => expect(consultasHistorial().at(-1)).toContain('medio_pago=credito'));
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'anuladas' } });
    await waitFor(() => expect(consultasHistorial().at(-1)).toContain('estado=anuladas'));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-01' } });
    await waitFor(() => expect(consultasHistorial().at(-1)).toContain('fecha_desde=2026-03-01'));
    fireEvent.change(screen.getByLabelText('Buscar factura'), { target: { value: 'fev' } });
    await waitFor(() => expect(consultasHistorial().at(-1)).toContain('q=fev'));
  });

  it('la paginacion pide la pagina siguiente', async () => {
    await abrirConFacturas([factura()], { totalPages: 4 });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(consultasHistorial().at(-1)).toContain('page=2'));
  });

  it('sin facturas y sin resultados se explican distinto', async () => {
    await abrirConFacturas([]);
    expect(screen.getByText('No hay facturas registradas.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'vigentes' } });

    expect(await screen.findByText('No se encontraron facturas con ese criterio.')).toBeTruthy();
  });

  it('el detalle muestra las lineas de la factura y se puede ocultar', async () => {
    const lineas = [
      { producto_id: 1, nombre_producto: 'Arroz Diana', cantidad: 5, aplica_iva: true, precio_unitario: 1000, precio_total: 5950, precio_venta_sugerido: 1500 },
      { producto_id: 2, nombre_producto: 'Aceite', cantidad: 2, aplica_iva: false, precio_unitario: 8000, precio_total: 16000, precio_venta_sugerido: null },
    ];
    await abrirConFacturas([factura({ items: lineas })]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle de la factura 7' })[0]);

    const detalle = screen.getAllByText('Aceite')[0].closest('table');
    expect(within(detalle).getByText('Arroz Diana')).toBeTruthy();
    expect(within(detalle).getByText('Sí')).toBeTruthy();
    expect(within(detalle).getByText('No')).toBeTruthy();
    expect(screen.getAllByText(/Registrada por vendedor1/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Ocultar detalle de la factura 7' })[0]);
    expect(screen.queryByText('Aceite')).toBeNull();
  });

  it('en celular cada factura tiene su tarjeta con las mismas acciones', async () => {
    await abrirConFacturas([factura()]);

    const tarjeta = screen.getAllByText('FEV-100').map((el) => el.closest('li')).find(Boolean);

    expect(within(tarjeta).getByRole('button', { name: 'Anular factura 7' })).toBeTruthy();
    expect(within(tarjeta).getByRole('button', { name: 'Ver detalle de la factura 7' })).toBeTruthy();
  });

  it('el vendedor anula con usuario y clave de un administrador y la lista se recarga', async () => {
    apiPostMock.mockResolvedValue(factura({ anulada: true, motivo_anulacion: 'Error al digitar' }));
    await abrirConFacturas([factura()]);
    const consultasAntes = consultasHistorial().length;

    fireEvent.click(screen.getAllByRole('button', { name: 'Anular factura 7' })[0]);
    fireEvent.change(screen.getAllByLabelText('Motivo de la anulación')[0], { target: { value: 'Error al digitar' } });
    fireEvent.change(screen.getAllByLabelText('Usuario del administrador')[0], { target: { value: 'admin' } });
    fireEvent.change(screen.getAllByLabelText('Clave del administrador')[0], { target: { value: 'secreta' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar anulación/ })[0]);

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/facturas-compra/7/anular', {
      motivo: 'Error al digitar', autorizador_usuario: 'admin', autorizador_password: 'secreta',
    }));
    expect(await screen.findByText(/Factura #7 anulada: se devolvió el stock/)).toBeTruthy();
    await waitFor(() => expect(consultasHistorial().length).toBeGreaterThan(consultasAntes));
  });

  it('el administrador solo da el motivo', async () => {
    apiPostMock.mockResolvedValue(factura({ anulada: true }));
    await abrirConFacturas([factura()], { rol: 'admin' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Anular factura 7' })[0]);
    expect(screen.queryByLabelText('Usuario del administrador')).toBeNull();
    fireEvent.change(screen.getAllByLabelText('Motivo de la anulación')[0], { target: { value: 'Duplicada' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar anulación/ })[0]);

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/facturas-compra/7/anular', { motivo: 'Duplicada', autorizador_usuario: null, autorizador_password: null }));
  });

  it('si el servidor rechaza la anulacion (ya se vendio parte) muestra el motivo y no recarga', async () => {
    apiPostMock.mockRejectedValue(new Error('No se puede revertir: ya se vendio parte de esta compra.'));
    await abrirConFacturas([factura()], { rol: 'admin' });
    const consultasAntes = consultasHistorial().length;

    fireEvent.click(screen.getAllByRole('button', { name: 'Anular factura 7' })[0]);
    fireEvent.change(screen.getAllByLabelText('Motivo de la anulación')[0], { target: { value: 'Duplicada' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar anulación/ })[0]);

    expect((await screen.findAllByText(/ya se vendio parte de esta compra/)).length).toBeGreaterThan(0);
    expect(consultasHistorial().length).toBe(consultasAntes);
  });
});

describe('Facturas: buscador de producto y producto nuevo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { // sin localStorage
    }
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'vendedor1', role: 'vendedor' } });
    confirmMock.mockResolvedValue(true);
    fetchCajaEstadoMock.mockResolvedValue({ abierta: true });
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/proveedores') return Promise.resolve([{ id: 5, nombre: 'Distribuidora', activo: true }]);
      if (endpoint.startsWith('/api/productos')) return Promise.resolve([...productos, { id: 2, nombre: 'Aceite Gourmet', precio_costo: 8000, precio_venta: 11000, codigo_barras: '880' }]);
      if (endpoint === '/api/facturas-compra/config') return Promise.resolve({ iva_rate: 0.19 });
      if (endpoint.startsWith('/api/facturas-compra/paginadas')) return Promise.resolve(pagina([]));
      return Promise.resolve([]);
    });
  });

  it('se maneja con el teclado: flechas para moverse, Enter para elegir, Escape para cerrar', async () => {
    render(<Facturas />);
    const buscador = await screen.findByRole('combobox', { name: 'Buscar producto' });

    fireEvent.focus(buscador);
    expect(await screen.findByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(buscador, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.keyDown(buscador, { key: 'ArrowDown' });
    const opciones = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(opciones.map((o) => o.textContent)).toEqual([expect.stringContaining('Aceite Gourmet'), expect.stringContaining('Arroz Diana')]);
    expect(opciones[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(buscador, { key: 'ArrowDown' });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(buscador, { key: 'Enter' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('Arroz Diana')).toBeTruthy();
    expect(screen.getByLabelText('Precio de factura sin IVA')).toHaveValue(1190); // el costo guardado del producto elegido
  });

  it('buscar por codigo de barras filtra la lista', async () => {
    render(<Facturas />);
    const buscador = await screen.findByRole('combobox', { name: 'Buscar producto' });

    fireEvent.change(buscador, { target: { value: '880' } });

    const opciones = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(opciones).toHaveLength(1);
    expect(opciones[0].textContent).toContain('Aceite Gourmet');
  });

  it('una busqueda sin coincidencias lo dice', async () => {
    render(<Facturas />);
    const buscador = await screen.findByRole('combobox', { name: 'Buscar producto' });

    fireEvent.change(buscador, { target: { value: 'zzz' } });

    expect(screen.getByText('Sin resultados')).toBeTruthy();
  });

  it('el producto nuevo usa el alta compartida: sin stock inicial ni codigo de barras y entra a la factura', async () => {
    apiPostMock.mockResolvedValue({ id: 9, nombre: 'Galleta Nueva', precio_costo: 900, precio_venta: 1500 });
    render(<Facturas />);
    await screen.findByRole('combobox', { name: 'Buscar producto' });

    fireEvent.click(screen.getByRole('button', { name: /Producto nuevo/ }));
    expect(screen.getByText('Producto nuevo para la factura')).toBeTruthy();
    expect(screen.queryByLabelText('Stock inicial')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Por código de barras/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Galleta Nueva' } });
    fireEvent.change(screen.getAllByLabelText('Precio de costo', { selector: 'input' })[0], { target: { value: '900' } });
    fireEvent.change(screen.getAllByLabelText('Precio de venta', { selector: 'input' })[0], { target: { value: '1500' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Agregar producto/ }).pop());

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/productos', expect.objectContaining({ nombre: 'Galleta Nueva', stock_actual: 0, precio_costo: 900, precio_venta: 1500 })));
    expect(await screen.findByText('Producto "Galleta Nueva" creado: ya está en la factura')).toBeTruthy();
    expect(screen.getByText('Galleta Nueva')).toBeTruthy();
    expect(screen.getByLabelText('Precio de factura sin IVA')).toHaveValue(900);
  });
});
