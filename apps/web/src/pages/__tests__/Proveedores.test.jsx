import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const apiPatchMock = vi.hoisted(() => vi.fn());
const apiDeleteMock = vi.hoisted(() => vi.fn());
const apiRequestMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('../../auth/AuthContext', () => ({ useAuth: useAuthMock }));

vi.mock('../../api/httpClient', () => ({
  apiDelete: apiDeleteMock,
  apiGet: apiGetMock,
  apiPatch: apiPatchMock,
  apiPost: apiPostMock,
  apiRequest: apiRequestMock,
}));

vi.mock('../../components/ErrorMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="error-message">{message}</div> : null),
}));

vi.mock('../../components/SuccessMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="success-message">{message}</div> : null),
}));

vi.mock('../../components/Skeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}));

vi.mock('../../components/useConfirm', () => ({
  default: () => ({ confirm: confirmMock, ConfirmModal: <div data-testid="confirm-modal" /> }),
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, title, children, onClose }) =>
    isOpen ? (
      <div data-testid="modal">
        <span data-testid="modal-title">{title}</span>
        {children}
        <button data-testid="modal-close" onClick={onClose}>Cerrar</button>
      </div>
    ) : null,
}));

const proveedoresMock = [
  { id: 1, nombre: 'Bimbo', contacto: 'Robocop', telefono: '573001112233', activo: true },
  { id: 2, nombre: 'Coca-Cola', contacto: null, telefono: null, activo: true },
  { id: 3, nombre: 'Colanta', contacto: null, telefono: '573109998877', activo: false },
];

const productosBimbo = [
  { id: 10, nombre: 'Pan Tajado', proveedor_id: 1, precio_costo: 3500, stock_actual: 4, stock_minimo: 6 },
  { id: 11, nombre: 'Ponqué', proveedor_id: 1, precio_costo: 1200, stock_actual: 20, stock_minimo: 5 },
];

const pedido = (extra = {}) => ({
  id: 5, proveedor_id: 1, proveedor_nombre: 'Bimbo', descripcion: '3× Pan Tajado; 2× Ponqué', monto_estimado: 12900,
  estado: 'enviado', creado_por: 'vendedor1', fecha_creacion: '2026-11-10T10:00:00', factura_id: null, nota: null, ...extra,
});

const pagina = (data, totalPages = 1) => ({ data, page: { total: data.length, total_pages: totalPages, current_page: 1, limit: 10 } });

const consultasPedidos = () => apiGetMock.mock.calls.map(([endpoint]) => endpoint).filter((e) => e.startsWith('/api/proveedores/pedidos/paginados'));

const cargar = ({ rol = 'vendedor', pedidos = [pedido()], totalPages = 1, productos = productosBimbo } = {}) => {
  useAuthMock.mockReturnValue({ token: 'test-token', user: { username: 'u', role: rol } });
  apiGetMock.mockImplementation((endpoint) => {
    if (endpoint.startsWith('/api/proveedores/pedidos/paginados')) return Promise.resolve(pagina(pedidos, totalPages));
    if (endpoint.startsWith('/api/proveedores')) return Promise.resolve(proveedoresMock);
    if (endpoint.startsWith('/api/productos/paginados')) return Promise.resolve(pagina(productos));
    return Promise.resolve([]);
  });
};

const abrirPagina = async (opciones) => {
  cargar(opciones);
  const Proveedores = (await import('../Proveedores')).default;
  render(<Proveedores />);
  await waitFor(() => expect(screen.getAllByText('Bimbo').length).toBeGreaterThan(0));
};

// Fila del listado de proveedores (el nombre tambien sale en la tabla de pedidos).
const filaTabla = (nombre) => screen.getAllByText(nombre).map((el) => el.closest('tr')).find((fila) => fila && within(fila).queryByRole('button', { name: 'Editar proveedor' }));
const filaPedido = (id) => screen.getAllByText(`#${id}`).map((el) => el.closest('tr')).find(Boolean);
const modal = () => screen.getByTestId('modal');

describe('Proveedores: listado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    apiRequestMock.mockResolvedValue({});
  });

  it('pide tambien los inactivos y solo muestra los activos al empezar', async () => {
    await abrirPagina();

    expect(apiGetMock).toHaveBeenCalledWith('/api/proveedores?include_inactivos=true', expect.anything());
    expect(screen.getAllByText('Coca-Cola').length).toBeGreaterThan(0);
    expect(screen.getAllByText('300 111 2233').length).toBeGreaterThan(0);
    expect(screen.queryByText('Colanta')).toBeNull();
    expect(screen.getByRole('button', { name: 'Activos (2)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inactivos (1)' })).toBeTruthy();
  });

  it('un proveedor inactivo se ve en su pestaña y se puede reactivar', async () => {
    apiPatchMock.mockResolvedValue({ ...proveedoresMock[2], activo: true });
    await abrirPagina();

    fireEvent.click(screen.getByRole('button', { name: 'Inactivos (1)' }));
    const fila = filaTabla('Colanta');
    expect(within(fila).getByText('Inactivo')).toBeTruthy();
    fireEvent.click(within(fila).getByRole('button', { name: 'Activar proveedor' }));

    await waitFor(() => expect(apiPatchMock).toHaveBeenCalledWith('/api/proveedores/3', { activo: true }));
    expect(await screen.findByText(/"Colanta" activado/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activos (3)' })).toBeTruthy();
  });

  it('desactivar saca al proveedor de los pedidos y lo explica', async () => {
    apiPatchMock.mockResolvedValue({ ...proveedoresMock[1], activo: false });
    await abrirPagina();

    fireEvent.click(within(filaTabla('Coca-Cola')).getByRole('button', { name: 'Desactivar proveedor' }));

    expect(await screen.findByText(/desactivado: ya no aparece al crear pedidos/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo pedido/ }));
    const opciones = within(screen.getByLabelText('Proveedor')).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Selecciona proveedor', 'Bimbo']);
  });

  it('el buscador encuentra proveedores por nombre, contacto o telefono', async () => {
    await abrirPagina();

    fireEvent.change(screen.getByLabelText('Buscar proveedor'), { target: { value: 'robocop' } });
    expect(screen.getAllByText('Bimbo').length).toBeGreaterThan(0);
    expect(screen.queryByText('Coca-Cola')).toBeNull();

    fireEvent.change(screen.getByLabelText('Buscar proveedor'), { target: { value: '300 111' } });
    expect(screen.getAllByText('Bimbo').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Buscar proveedor'), { target: { value: 'zzz' } });
    expect(screen.getByText('No se encontraron proveedores con ese criterio.')).toBeTruthy();
  });

  // -- Alta y edicion --

  it('crear un proveedor usa etiquetas, envia los datos limpios y lo agrega ordenado', async () => {
    apiPostMock.mockResolvedValue({ id: 9, nombre: 'Alpina', contacto: null, telefono: '573001234567', activo: true });
    await abrirPagina();

    fireEvent.click(screen.getByRole('button', { name: /Nuevo proveedor/ }));
    expect(screen.getByLabelText('Nombre')).toBeTruthy();
    expect(screen.getByLabelText('Contacto')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '  Alpina  ' } });
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '300 123 4567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar proveedor' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/proveedores', { nombre: 'Alpina', contacto: null, telefono: '300 123 4567' }));
    expect(await screen.findByText('Proveedor creado correctamente')).toBeTruthy();
    expect(screen.queryByTestId('modal')).toBeNull();
    const filas = screen.getAllByRole('row').filter((fila) => within(fila).queryByRole('button', { name: 'Editar proveedor' })).map((fila) => fila.textContent);
    expect(filas.findIndex((t) => t.includes('Alpina'))).toBeLessThan(filas.findIndex((t) => t.includes('Bimbo')));
  });

  it('un nombre muy corto se rechaza dentro del cuadro sin llamar al servidor', async () => {
    await abrirPagina();

    fireEvent.click(screen.getByRole('button', { name: /Nuevo proveedor/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar proveedor' }));

    expect(await within(modal()).findByText('El nombre debe tener al menos 3 caracteres')).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('el error del servidor se ve dentro del cuadro y el cuadro sigue abierto', async () => {
    apiPostMock.mockRejectedValue(new Error('Ese telefono ya lo tiene el proveedor \'Bimbo\''));
    await abrirPagina();

    fireEvent.click(screen.getByRole('button', { name: /Nuevo proveedor/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar proveedor' }));

    expect(await within(modal()).findByText(/ya lo tiene el proveedor 'Bimbo'/)).toBeTruthy();
    expect(modal()).toBeTruthy();
  });

  it('editar carga los datos del proveedor y guarda los cambios', async () => {
    apiPatchMock.mockResolvedValue({ ...proveedoresMock[0], contacto: 'Ana' });
    await abrirPagina();

    fireEvent.click(within(filaTabla('Bimbo')).getByRole('button', { name: 'Editar proveedor' }));
    expect(screen.getByTestId('modal-title').textContent).toBe('Editar proveedor');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Bimbo');
    fireEvent.change(screen.getByLabelText('Contacto'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(apiPatchMock).toHaveBeenCalledWith('/api/proveedores/1', { nombre: 'Bimbo', contacto: 'Ana', telefono: '300 111 2233' }));
    expect(await screen.findByText('Proveedor actualizado correctamente')).toBeTruthy();
  });

  // -- Borrar --

  it('el vendedor no ve el boton de eliminar', async () => {
    await abrirPagina({ rol: 'vendedor' });

    expect(screen.queryByRole('button', { name: 'Eliminar proveedor' })).toBeNull();
  });

  it('el admin elimina tras confirmar', async () => {
    apiDeleteMock.mockResolvedValue(undefined);
    await abrirPagina({ rol: 'admin' });

    fireEvent.click(within(filaTabla('Coca-Cola')).getByRole('button', { name: 'Eliminar proveedor' }));

    await waitFor(() => expect(apiDeleteMock).toHaveBeenCalledWith('/api/proveedores/2'));
    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Coca-Cola') }));
    expect(await screen.findByText('Proveedor "Coca-Cola" eliminado')).toBeTruthy();
    expect(screen.queryByText('Coca-Cola')).toBeNull();
  });

  it('si el admin cancela no se elimina nada', async () => {
    confirmMock.mockResolvedValue(false);
    await abrirPagina({ rol: 'admin' });

    fireEvent.click(within(filaTabla('Coca-Cola')).getByRole('button', { name: 'Eliminar proveedor' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(apiDeleteMock).not.toHaveBeenCalled();
  });

  it('si el proveedor tiene historial muestra el motivo del servidor y lo conserva', async () => {
    apiDeleteMock.mockRejectedValue(new Error('No se puede eliminar: el proveedor tiene 2 pedido(s) de proveedor.'));
    await abrirPagina({ rol: 'admin' });

    fireEvent.click(within(filaTabla('Bimbo')).getByRole('button', { name: 'Eliminar proveedor' }));

    expect(await screen.findByText(/No se puede eliminar: el proveedor tiene 2 pedido/)).toBeTruthy();
    expect(screen.getAllByText('Bimbo').length).toBeGreaterThan(0);
  });
});

describe('Proveedores: pedidos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    apiRequestMock.mockResolvedValue({});
  });

  it('empieza mostrando los pendientes y los filtros piden al servidor', async () => {
    await abrirPagina();

    expect(consultasPedidos()[0]).toContain('estado=enviado');
    expect(screen.getByRole('button', { name: 'Pendientes' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Recibidos' }));
    await waitFor(() => expect(consultasPedidos().at(-1)).toContain('estado=recibido'));
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(consultasPedidos().at(-1)).toContain('estado=todos'));
  });

  it('el buscador de pedidos espera a que termines de escribir y busca en el servidor', async () => {
    await abrirPagina();

    fireEvent.change(screen.getByLabelText('Buscar pedido'), { target: { value: 'pan' } });

    await waitFor(() => expect(consultasPedidos().at(-1)).toContain('q=pan'));
  });

  it('un estado sin pedidos lo explica', async () => {
    await abrirPagina({ pedidos: [] });

    expect(await screen.findByText('No hay pedidos pendientes.')).toBeTruthy();
  });

  it('la paginacion pide la pagina siguiente', async () => {
    await abrirPagina({ totalPages: 3 });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(consultasPedidos().at(-1)).toContain('page=2'));
  });

  it('marcar recibido cambia el estado en el servidor y recarga la lista', async () => {
    await abrirPagina();

    fireEvent.click(within(filaPedido(5)).getByRole('button', { name: /Recibido/ }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith('/api/proveedores/pedidos/5/estado', { method: 'PUT', body: { estado: 'recibido', nota: null } }));
    expect(await screen.findByText('Pedido #5 marcado como recibido')).toBeTruthy();
    expect(consultasPedidos().length).toBeGreaterThan(1);
  });

  it('cancelar pide confirmacion y si se arrepiente no cambia nada', async () => {
    confirmMock.mockResolvedValue(false);
    await abrirPagina();

    fireEvent.click(within(filaPedido(5)).getByRole('button', { name: /Cancelar/ }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('#5') })));
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('cancelar confirmado cancela el pedido', async () => {
    await abrirPagina();

    fireEvent.click(within(filaPedido(5)).getByRole('button', { name: /Cancelar/ }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith('/api/proveedores/pedidos/5/estado', { method: 'PUT', body: { estado: 'cancelado', nota: null } }));
    expect(await screen.findByText('Pedido #5 cancelado')).toBeTruthy();
  });

  it('un pedido cerrado se puede reabrir, salvo si lo cumplio una factura', async () => {
    await abrirPagina({ pedidos: [pedido({ id: 6, estado: 'cancelado' }), pedido({ id: 7, estado: 'recibido', factura_id: 33 })] });

    expect(within(filaPedido(6)).getByRole('button', { name: /Reabrir/ })).toBeTruthy();
    expect(within(filaPedido(7)).queryByRole('button', { name: /Reabrir/ })).toBeNull();
    expect(within(filaPedido(7)).getByText('Factura #33')).toBeTruthy();
    expect(within(filaPedido(7)).queryByRole('button', { name: /Recibido/ })).toBeNull();

    fireEvent.click(within(filaPedido(6)).getByRole('button', { name: /Reabrir/ }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith('/api/proveedores/pedidos/6/estado', { method: 'PUT', body: { estado: 'enviado', nota: null } }));
  });

  it('si el servidor rechaza el cambio de estado muestra el motivo', async () => {
    apiRequestMock.mockRejectedValue(new Error('El pedido ya esta recibido'));
    await abrirPagina();

    fireEvent.click(within(filaPedido(5)).getByRole('button', { name: /Recibido/ }));

    expect(await screen.findByText('El pedido ya esta recibido')).toBeTruthy();
  });

  it('WhatsApp reenvia el pedido con su detalle y se apaga si el proveedor no tiene telefono', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    await abrirPagina({ pedidos: [pedido(), pedido({ id: 6, proveedor_id: 2, proveedor_nombre: 'Coca-Cola', descripcion: '1× Gaseosa' })] });

    expect(within(filaPedido(6)).getByRole('button', { name: /WhatsApp/ })).toBeDisabled();
    fireEvent.click(within(filaPedido(5)).getByRole('button', { name: /WhatsApp/ }));

    expect(await screen.findByText('Pedido #5 abierto en WhatsApp')).toBeTruthy();
    const enlace = decodeURIComponent(abrir.mock.calls[0][0]);
    expect(enlace).toContain('https://wa.me/573001112233?text=');
    expect(enlace).toContain('Hola Robocop');
    expect(enlace).toContain('pedido #5');
    expect(enlace).toContain('- 3× Pan Tajado');
    expect(enlace).toContain('- 2× Ponqué');
    abrir.mockRestore();
  });
});

describe('Proveedores: nuevo pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    apiRequestMock.mockResolvedValue({});
  });

  const abrirNuevoPedido = async (opciones, proveedorId = '1') => {
    await abrirPagina(opciones);
    fireEvent.click(screen.getByRole('button', { name: /Nuevo pedido/ }));
    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: proveedorId } });
  };

  it('al elegir proveedor carga sus productos con lo que falta ya marcado y la cantidad sugerida', async () => {
    await abrirNuevoPedido();

    expect(await screen.findByText('Pan Tajado')).toBeTruthy();
    const llamada = apiGetMock.mock.calls.map(([e]) => e).find((e) => e.startsWith('/api/productos/paginados'));
    expect(llamada).toContain('proveedor_id=1');
    expect(llamada).toContain('limit=200');
    expect(screen.getByLabelText('Incluir Pan Tajado')).toBeChecked();
    expect(screen.getByLabelText('Cantidad de Pan Tajado')).toHaveValue(8); // 6 * 2 - 4
    expect(screen.getByLabelText('Incluir Ponqué')).not.toBeChecked();
    expect(screen.getByText(/1 productos · \$\s?28\.000 estimado/)).toBeTruthy(); // 8 x 3.500
    expect(screen.getByText(/Hay 4 · mínimo 6 · falta/)).toBeTruthy();
  });

  it('se pueden agregar productos que no faltan y el estimado se recalcula', async () => {
    await abrirNuevoPedido();
    await screen.findByText('Pan Tajado');

    fireEvent.click(screen.getByLabelText('Incluir Ponqué'));
    fireEvent.change(screen.getByLabelText('Cantidad de Ponqué'), { target: { value: '10' } });

    expect(screen.getByText(/2 productos · \$\s?40\.000 estimado/)).toBeTruthy(); // 28.000 + 10 x 1.200
  });

  it('registrar guarda el pedido con el detalle y abre WhatsApp con el mismo texto', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    apiPostMock.mockResolvedValue(pedido({ id: 31 }));
    await abrirNuevoPedido();
    await screen.findByText('Pan Tajado');
    fireEvent.click(screen.getByLabelText('Incluir Ponqué'));
    fireEvent.change(screen.getByLabelText('Cantidad de Ponqué'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: /Registrar pedido y enviar por WhatsApp/ }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/proveedores/pedidos', {
      proveedor_id: 1,
      descripcion: '8× Pan Tajado; 2× Ponqué',
      monto_estimado: 30400, // 8 x 3.500 + 2 x 1.200
    }));
    expect(await screen.findByText('Pedido #31 registrado y abierto en WhatsApp')).toBeTruthy();
    expect(screen.queryByTestId('modal')).toBeNull();
    const enlace = decodeURIComponent(abrir.mock.calls[0][0]);
    expect(enlace).toContain('https://wa.me/573001112233?text=');
    expect(enlace).toContain('pedido #31');
    expect(enlace).toContain('- 8× Pan Tajado');
    abrir.mockRestore();
  });

  it('si el proveedor no tiene WhatsApp registra el pedido, avisa y no abre nada', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    apiPostMock.mockResolvedValue(pedido({ id: 32, proveedor_id: 2, proveedor_nombre: 'Coca-Cola' }));
    await abrirNuevoPedido({ productos: [{ id: 12, nombre: 'Gaseosa', proveedor_id: 2, precio_costo: 2000, stock_actual: 1, stock_minimo: 5 }] }, '2');
    await screen.findByText('Gaseosa');

    expect(screen.getByText(/no tiene un WhatsApp válido/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Registrar pedido/ }));

    expect(await screen.findByText(/Pedido #32 registrado\. Agrega el WhatsApp del proveedor/)).toBeTruthy();
    expect(abrir).not.toHaveBeenCalled();
    abrir.mockRestore();
  });

  it('un proveedor sin productos explica que hay que asignarselos', async () => {
    await abrirNuevoPedido({ productos: [] });

    expect(await screen.findByText(/no tiene productos asignados/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Registrar pedido/ })).toBeNull();
  });

  it('un producto sin precio de costo no genera un pedido en cero', async () => {
    await abrirNuevoPedido({ productos: [{ id: 10, nombre: 'Sin costo', proveedor_id: 1, precio_costo: 0, stock_actual: 0, stock_minimo: 3 }] });
    await screen.findByText('Sin costo');

    fireEvent.click(screen.getByRole('button', { name: /Registrar pedido/ }));

    expect(await screen.findByText(/no tiene precio de costo/)).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('el boton se apaga cuando no hay nada marcado', async () => {
    await abrirNuevoPedido();
    await screen.findByText('Pan Tajado');

    fireEvent.click(screen.getByLabelText('Incluir Pan Tajado'));

    expect(screen.getByRole('button', { name: /Registrar pedido/ })).toBeDisabled();
  });

  it('si el servidor rechaza el pedido muestra el motivo, mantiene el cuadro y no abre WhatsApp', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    apiPostMock.mockRejectedValue(new Error('El proveedor esta desactivado'));
    await abrirNuevoPedido();
    await screen.findByText('Pan Tajado');

    fireEvent.click(screen.getByRole('button', { name: /Registrar pedido/ }));

    expect(await within(modal()).findByText('El proveedor esta desactivado')).toBeTruthy();
    expect(abrir).not.toHaveBeenCalled();
    abrir.mockRestore();
  });
});
