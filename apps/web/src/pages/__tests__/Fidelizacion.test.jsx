import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  fetchClientes: vi.fn(),
  fetchResumen: vi.fn(),
  fetchMovimientos: vi.fn(),
  ajustarPuntos: vi.fn(),
  inscribirCliente: vi.fn(),
  desactivarCliente: vi.fn(),
  reactivarCliente: vi.fn(),
}));

vi.mock('../../auth/AuthContext', () => ({ useAuth: useAuthMock }));
vi.mock('../../api/fidelizacionApi', () => api);
vi.mock('../../components/ErrorMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="error-message">{message}</div> : null),
}));
vi.mock('../../components/SuccessMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="success-message">{message}</div> : null),
}));
vi.mock('../../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));
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

import Fidelizacion from '../Fidelizacion';

const cliente = (extra = {}) => ({ id: 1, nombre: 'Monica Salazar', telefono_whatsapp: '573023456789', puntos_acumulados: 120, activo: true, ...extra });
const CLIENTES = [
  cliente(),
  cliente({ id: 2, nombre: 'Camilo Perez', telefono_whatsapp: '3012345678', puntos_acumulados: 65 }),
  cliente({ id: 3, nombre: 'Lina Rojas', telefono_whatsapp: '1234567', puntos_acumulados: 20 }),
];
const RESUMEN = { total_activos: 3, pueden_canjear: 1, desactivados: 2, puntos_en_circulacion: 205, valor_en_circulacion: 4100, umbral_bono: 100, valor_punto: 20 };

const pagina = (data, totalPages = 1) => ({ data, page: { total: data.length, total_pages: totalPages, current_page: 1, limit: 10 } });
const ultima = () => api.fetchClientes.mock.calls.at(-1)[0];

const abrir = async ({ rol = 'vendedor', clientes = CLIENTES, resumen = RESUMEN, totalPages = 1 } = {}) => {
  useAuthMock.mockReturnValue({ token: 't', user: { username: 'u', role: rol } });
  api.fetchClientes.mockResolvedValue(pagina(clientes, totalPages));
  if (resumen instanceof Error) api.fetchResumen.mockRejectedValue(resumen);
  else api.fetchResumen.mockResolvedValue(resumen);
  render(<Fidelizacion />);
  await waitFor(() => expect(api.fetchClientes).toHaveBeenCalled());
  if (clientes.length > 0) await waitFor(() => expect(screen.getAllByText('Monica Salazar').length).toBeGreaterThan(0));
  else await screen.findByText(/No hay clientes de fidelización registrados|No se encontraron clientes/);
};

const fila = (nombre) => screen.getAllByText(nombre).map((el) => el.closest('tr')).find(Boolean);

describe('Fidelizacion: lista y resumen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
  });

  it('pide al servidor la primera pagina de activos y el resumen de todo el programa', async () => {
    await abrir();

    expect(api.fetchClientes).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, estado: 'activos', q: '' }));
    expect(api.fetchResumen).toHaveBeenCalled();
    expect(screen.getByText('Clientes en el programa').nextElementSibling.textContent).toBe('3');
    expect(screen.getByText('2 desactivados')).toBeTruthy();
    expect(screen.getByText('Mínimo para canjear').nextElementSibling.textContent).toBe('100 pts');
    expect(screen.getByText('1 punto = $ 20')).toBeTruthy();
    expect(screen.getByText('Pueden canjear', { selector: 'p' }).nextElementSibling.textContent).toBe('1');
    expect(screen.getByText(/205 puntos en circulación/)).toBeTruthy();
  });

  it('cada cliente muestra su WhatsApp legible, lo que valen sus puntos y cuanto le falta', async () => {
    await abrir();

    const monica = fila('Monica Salazar');
    expect(within(monica).getByText('302 345 6789')).toBeTruthy();
    expect(within(monica).getByText(/2\.400/)).toBeTruthy(); // 120 x $20
    expect(within(monica).getByText('Puede canjear')).toBeTruthy();
    expect(within(fila('Camilo Perez')).getByText('Faltan 35 para canjear')).toBeTruthy();
    expect(within(fila('Lina Rojas')).getByText('123 4567')).toBeTruthy();
  });

  it('buscar escribiendo pide al servidor esa busqueda sin recargar la pagina', async () => {
    await abrir();

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'mon' } });

    await waitFor(() => expect(ultima()).toMatchObject({ q: 'mon', page: 1 }));
  });

  it('los filtros se envian al servidor y el de desactivados es solo de administradores', async () => {
    await abrir({ rol: 'vendedor' });
    expect(screen.queryByRole('button', { name: 'Desactivados' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pueden canjear' }));
    await waitFor(() => expect(ultima().estado).toBe('canjeables'));
  });

  it('el administrador ve y usa el filtro de desactivados', async () => {
    await abrir({ rol: 'admin' });

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
    expect(screen.getByText('No hay clientes de fidelización registrados.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pueden canjear' }));

    expect(await screen.findByText('No se encontraron clientes con ese criterio.')).toBeTruthy();
  });

  it('en celular cada cliente tiene su tarjeta con los puntos y su valor', async () => {
    await abrir();

    const tarjeta = screen.getAllByText('Camilo Perez').map((el) => el.closest('li')).find(Boolean);

    expect(within(tarjeta).getByText('301 234 5678')).toBeTruthy();
    expect(within(tarjeta).getByText(/puntos · .*1\.300/)).toBeTruthy();
    expect(within(tarjeta).getByRole('button', { name: 'Historial de Camilo Perez' })).toBeTruthy();
  });

  it('si no se pueden cargar las reglas avisa que se usan las de siempre', async () => {
    await abrir({ resumen: new Error('sin red') });

    expect(await screen.findByText(/No se pudieron cargar las reglas del programa/)).toBeTruthy();
    expect(within(fila('Monica Salazar')).getByText('Puede canjear')).toBeTruthy(); // con el minimo de siempre: 100
  });

  it('si falla la lista muestra el error', async () => {
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'u', role: 'vendedor' } });
    api.fetchClientes.mockRejectedValue(new Error('No fue posible cargar los clientes de fidelización'));
    api.fetchResumen.mockResolvedValue(RESUMEN);
    render(<Fidelizacion />);

    expect(await screen.findByText('No fue posible cargar los clientes de fidelización')).toBeTruthy();
  });
});

describe('Fidelizacion: historial de puntos', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('muestra por que cambiaron los puntos: compra, canje y ajuste', async () => {
    api.fetchMovimientos.mockResolvedValue({
      data: [
        { id: 3, fecha: '2026-11-10T20:00:00', tipo: 'ajuste', puntos: -10, saldo: 120, motivo: 'Puntos mal dados', usuario: 'admin', referencia_tipo: null, referencia_id: null },
        { id: 2, fecha: '2026-11-09T20:00:00', tipo: 'canje', puntos: -100, saldo: 130, motivo: 'Canje como descuento', usuario: 'vendedor1', referencia_tipo: 'venta', referencia_id: 14 },
        { id: 1, fecha: '2026-11-08T20:00:00', tipo: 'venta', puntos: 30, saldo: 230, motivo: 'Compra', usuario: 'vendedor1', referencia_tipo: 'venta', referencia_id: 12 },
      ],
      page: { total: 3, total_pages: 1 },
    });
    await abrir();

    fireEvent.click(within(fila('Monica Salazar')).getByRole('button', { name: 'Historial de Monica Salazar' }));

    expect(await screen.findByText('Ajuste')).toBeTruthy();
    expect(api.fetchMovimientos).toHaveBeenCalledWith(1, expect.objectContaining({ page: 1 }));
    expect(screen.getByText('Venta #14')).toBeTruthy();
    expect(screen.getByText('Venta #12')).toBeTruthy();
    expect(screen.getByText('+30')).toBeTruthy();
    expect(screen.getByText('-100')).toBeTruthy();
    expect(screen.getByText(/Puntos mal dados/)).toBeTruthy();
    expect(screen.getByText(/2\.400 en descuento/)).toBeTruthy();
  });

  it('un cliente sin movimientos explica que el historial empieza desde ahora', async () => {
    api.fetchMovimientos.mockResolvedValue({ data: [], page: { total: 0, total_pages: 1 } });
    await abrir();

    fireEvent.click(within(fila('Lina Rojas')).getByRole('button', { name: 'Historial de Lina Rojas' }));

    expect(await screen.findByText(/Todavía no hay movimientos/)).toBeTruthy();
  });

  it('si falla el historial muestra el error', async () => {
    api.fetchMovimientos.mockRejectedValue(new Error('No fue posible cargar el historial'));
    await abrir();

    fireEvent.click(within(fila('Lina Rojas')).getByRole('button', { name: 'Historial de Lina Rojas' }));

    expect(await within(screen.getByTestId('modal')).findByText('No fue posible cargar el historial')).toBeTruthy();
  });
});

describe('Fidelizacion: ajustar, desactivar e inscribir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
  });

  const abrirAjuste = async (nombre = 'Monica Salazar') => {
    await abrir({ rol: 'admin' });
    fireEvent.click(within(fila(nombre)).getByRole('button', { name: `Ajustar puntos de ${nombre}` }));
    return screen.getByTestId('modal');
  };

  it('el vendedor no ve ajustar ni desactivar', async () => {
    await abrir({ rol: 'vendedor' });

    expect(screen.queryByRole('button', { name: /Ajustar puntos de/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desactivar a/ })).toBeNull();
    expect(within(fila('Monica Salazar')).getByRole('button', { name: /Historial/ })).toBeTruthy();
  });

  it('el ajuste muestra cuantos puntos quedarian antes de aplicarlo', async () => {
    const modal = await abrirAjuste();

    fireEvent.change(within(modal).getByLabelText('Cantidad de puntos'), { target: { value: '30' } });
    expect(within(modal).getByText(/120 → 150 puntos \(\+30\)/)).toBeTruthy();
    fireEvent.click(within(modal).getByRole('radio', { name: 'Restar' }));
    expect(within(modal).getByText(/120 → 90 puntos \(-30\)/)).toBeTruthy();
    fireEvent.click(within(modal).getByRole('radio', { name: 'Dejar en' }));
    expect(within(modal).getByLabelText('Puntos que debe tener')).toBeTruthy();
    expect(within(modal).getByText(/120 → 30 puntos \(-90\)/)).toBeTruthy();
  });

  it('envia el ajuste con su motivo y recarga la lista', async () => {
    api.ajustarPuntos.mockResolvedValue({});
    const modal = await abrirAjuste();
    const consultasAntes = api.fetchClientes.mock.calls.length;

    fireEvent.change(within(modal).getByLabelText('Cantidad de puntos'), { target: { value: '30' } });
    fireEvent.change(within(modal).getByLabelText('Motivo (obligatorio)'), { target: { value: '  Promoción de noviembre  ' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Ajustar puntos' }));

    await waitFor(() => expect(api.ajustarPuntos).toHaveBeenCalledWith(1, { modo: 'sumar', puntos: 30, motivo: 'Promoción de noviembre' }));
    expect(await screen.findByText(/Puntos de Monica Salazar ajustados/)).toBeTruthy();
    expect(screen.queryByTestId('modal')).toBeNull();
    await waitFor(() => expect(api.fetchClientes.mock.calls.length).toBeGreaterThan(consultasAntes));
  });

  it('valida cantidad, motivo y que no se reste mas de lo que hay, sin llamar al servidor', async () => {
    const modal = await abrirAjuste();
    const enviar = () => fireEvent.click(within(modal).getByRole('button', { name: 'Ajustar puntos' }));

    enviar();
    expect(await within(modal).findByText('Escribe una cantidad válida')).toBeTruthy();

    fireEvent.change(within(modal).getByLabelText('Cantidad de puntos'), { target: { value: '30' } });
    enviar();
    expect(await within(modal).findByText('Explica el motivo del ajuste (mínimo 3 letras)')).toBeTruthy();

    fireEvent.click(within(modal).getByRole('radio', { name: 'Restar' }));
    fireEvent.change(within(modal).getByLabelText('Cantidad de puntos'), { target: { value: '500' } });
    fireEvent.change(within(modal).getByLabelText('Motivo (obligatorio)'), { target: { value: 'Corrección' } });
    enviar();
    expect(await within(modal).findByText('No se pueden restar 500: el cliente solo tiene 120')).toBeTruthy();

    fireEvent.click(within(modal).getByRole('radio', { name: 'Dejar en' }));
    fireEvent.change(within(modal).getByLabelText('Puntos que debe tener'), { target: { value: '120' } });
    enviar();
    expect(await within(modal).findByText('Nada que ajustar: el cliente ya tiene esos puntos')).toBeTruthy();
    expect(api.ajustarPuntos).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza el ajuste muestra el motivo dentro del cuadro', async () => {
    api.ajustarPuntos.mockRejectedValue(new Error('El cliente solo tiene 120 puntos'));
    const modal = await abrirAjuste();

    fireEvent.change(within(modal).getByLabelText('Cantidad de puntos'), { target: { value: '10' } });
    fireEvent.change(within(modal).getByLabelText('Motivo (obligatorio)'), { target: { value: 'Prueba' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Ajustar puntos' }));

    expect(await within(modal).findByText('El cliente solo tiene 120 puntos')).toBeTruthy();
    expect(screen.getByTestId('modal')).toBeTruthy();
  });

  it('desactivar pide confirmacion y recarga; si se arrepiente no hace nada', async () => {
    api.desactivarCliente.mockResolvedValue(undefined);
    await abrir({ rol: 'admin' });
    confirmMock.mockResolvedValueOnce(false);

    fireEvent.click(within(fila('Lina Rojas')).getByRole('button', { name: 'Desactivar a Lina Rojas' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Lina Rojas') })));
    expect(api.desactivarCliente).not.toHaveBeenCalled();

    fireEvent.click(within(fila('Lina Rojas')).getByRole('button', { name: 'Desactivar a Lina Rojas' }));
    await waitFor(() => expect(api.desactivarCliente).toHaveBeenCalledWith(3));
    expect(await screen.findByText('Lina Rojas desactivado')).toBeTruthy();
  });

  it('un cliente desactivado se puede reactivar y no se le puede ajustar', async () => {
    api.reactivarCliente.mockResolvedValue({});
    await abrir({ rol: 'admin', clientes: [cliente({ id: 9, nombre: 'Pedro Viejo', puntos_acumulados: 500, activo: false }), ...CLIENTES] });

    const viejo = fila('Pedro Viejo');
    expect(within(viejo).getByText('Desactivado')).toBeTruthy();
    expect(within(viejo).queryByRole('button', { name: /Ajustar puntos/ })).toBeNull();
    fireEvent.click(within(viejo).getByRole('button', { name: 'Reactivar a Pedro Viejo' }));

    await waitFor(() => expect(api.reactivarCliente).toHaveBeenCalledWith(9));
    expect(await screen.findByText('Pedro Viejo reactivado')).toBeTruthy();
  });

  it('si el servidor rechaza desactivar muestra el motivo', async () => {
    api.desactivarCliente.mockRejectedValue(new Error('Cliente no encontrado'));
    await abrir({ rol: 'admin' });

    fireEvent.click(within(fila('Lina Rojas')).getByRole('button', { name: 'Desactivar a Lina Rojas' }));

    expect(await screen.findByText('Cliente no encontrado')).toBeTruthy();
  });

  it('inscribir exige nombre, WhatsApp y la autorizacion de datos, y envia lo escrito', async () => {
    api.inscribirCliente.mockResolvedValue({ id: 8, nombre: 'Maria Perez' });
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: /Inscribir cliente/ }));
    const modal = screen.getByTestId('modal');
    const guardar = within(modal).getByRole('button', { name: 'Inscribir cliente' });
    expect(guardar).toBeDisabled();
    fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: '  Maria Perez ' } });
    fireEvent.change(within(modal).getByLabelText('WhatsApp'), { target: { value: '300 111 2233' } });
    expect(guardar).toBeDisabled();
    fireEvent.click(within(modal).getByRole('checkbox'));
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);

    await waitFor(() => expect(api.inscribirCliente).toHaveBeenCalledWith({ nombre: 'Maria Perez', telefono: '300 111 2233', aceptaDatos: true }));
    expect(await screen.findByText('Maria Perez quedó inscrito en el programa de puntos')).toBeTruthy();
    expect(screen.queryByTestId('modal')).toBeNull();
  });

  it('si el WhatsApp ya esta inscrito muestra quien lo tiene dentro del cuadro', async () => {
    api.inscribirCliente.mockRejectedValue(new Error('Ya existe un cliente con ese WhatsApp: Monica Salazar'));
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: /Inscribir cliente/ }));
    const modal = screen.getByTestId('modal');
    fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: 'Otra Persona' } });
    fireEvent.change(within(modal).getByLabelText('WhatsApp'), { target: { value: '3023456789' } });
    fireEvent.click(within(modal).getByRole('checkbox'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Inscribir cliente' }));

    expect(await within(modal).findByText(/Ya existe un cliente con ese WhatsApp: Monica Salazar/)).toBeTruthy();
    expect(screen.getByTestId('modal')).toBeTruthy();
  });
});
