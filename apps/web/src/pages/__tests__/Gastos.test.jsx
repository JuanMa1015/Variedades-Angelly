import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const fetchCajaEstadoMock = vi.hoisted(() => vi.fn());
const fetchGastosMock = vi.hoisted(() => vi.fn());
const fetchResumenMock = vi.hoisted(() => vi.fn());

vi.mock('../../auth/AuthContext', () => ({ useAuth: useAuthMock }));
vi.mock('../../api/httpClient', () => ({ apiPost: apiPostMock }));
vi.mock('../../api/cajaApi', () => ({ fetchCajaEstado: fetchCajaEstadoMock }));
vi.mock('../../api/gastosApi', () => ({ fetchGastos: fetchGastosMock, fetchResumenGastos: fetchResumenMock }));

vi.mock('../../components/ErrorMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="error-message">{message}</div> : null),
}));
vi.mock('../../components/SuccessMessage', () => ({
  default: ({ message }) => (message ? <div data-testid="success-message">{message}</div> : null),
}));
vi.mock('../../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));

const MES = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7);

const gasto = (extra = {}) => ({
  id: 1, categoria: 'servicios', descripcion: 'Pago de la luz', monto: 120000, fecha: new Date().toISOString(), registrado_por: 'vendedor1',
  medio_pago: 'efectivo', caja_id: 1, anulado: false, motivo_anulacion: null, ...extra,
});

const GASTOS = [
  gasto(),
  gasto({ id: 2, categoria: 'arriendo', descripcion: 'Arriendo del local', monto: 1200000, medio_pago: 'transferencia' }),
  gasto({ id: 3, categoria: 'nomina', descripcion: 'Pago anulado por error', monto: 500000, anulado: true, motivo_anulacion: 'Error al digitar' }),
];

const RESUMEN = {
  mes: MES,
  total: 1320000,
  registros: 2,
  anulados: 1,
  por_categoria: [{ categoria: 'arriendo', total: 1200000, registros: 1 }, { categoria: 'servicios', total: 120000, registros: 1 }],
  total_efectivo: 120000,
  total_otros_medios: 1200000,
  mes_anterior: { mes: '2026-10', total: 1000000, registros: 3 },
  variacion_pct: 32,
};

const RESUMEN_VACIO = { ...RESUMEN, total: 0, registros: 0, anulados: 0, por_categoria: [], total_efectivo: 0, total_otros_medios: 0, variacion_pct: null };

const pagina = (data, totalPages = 1) => ({ data, page: { total: data.length, total_pages: totalPages, current_page: 1, limit: 10 } });
const ultimaConsulta = () => fetchGastosMock.mock.calls.at(-1)[0];

const abrirPagina = async ({ rol = 'vendedor', gastos = GASTOS, resumen = RESUMEN, caja = { abierta: true }, totalPages = 1 } = {}) => {
  useAuthMock.mockReturnValue({ token: 'test-token', user: { username: 'u', role: rol } });
  fetchGastosMock.mockResolvedValue(pagina(gastos, totalPages));
  fetchResumenMock.mockResolvedValue(resumen);
  if (caja instanceof Error) fetchCajaEstadoMock.mockRejectedValue(caja);
  else fetchCajaEstadoMock.mockResolvedValue(caja);
  const Gastos = (await import('../Gastos')).default;
  render(<Gastos />);
  await waitFor(() => expect(fetchResumenMock).toHaveBeenCalled());
  if (gastos.length > 0) await waitFor(() => expect(screen.getAllByText('Pago de la luz').length).toBeGreaterThan(0));
  else await screen.findByText(/No hay gastos registrados en este mes|No se encontraron gastos/);
};

const filaTabla = (texto) => screen.getAllByText(texto).map((el) => el.closest('tr')).find(Boolean);

const llenar = ({ descripcion = 'Pago de internet', monto = '85000', medio } = {}) => {
  fireEvent.change(screen.getByLabelText('Detalle del gasto'), { target: { value: descripcion } });
  fireEvent.change(screen.getByLabelText('Monto', { selector: 'input' }), { target: { value: monto } });
  if (medio) fireEvent.change(screen.getByLabelText('Pagado con'), { target: { value: medio } });
};

describe('Gastos: historial y resumen', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('pide al servidor el historial y el resumen del mes actual', async () => {
    await abrirPagina();

    expect(fetchGastosMock).toHaveBeenCalledWith(expect.objectContaining({ mes: MES, estado: 'todos', page: 1, limit: 10 }));
    expect(fetchResumenMock).toHaveBeenCalledWith(expect.objectContaining({ mes: MES }));
  });

  it('muestra categoria con tilde, medio de pago y marca el gasto anulado con su motivo', async () => {
    await abrirPagina();

    expect(screen.getAllByText('Nómina').length).toBeGreaterThan(0);
    expect(within(filaTabla('Arriendo del local')).getByText('Transferencia')).toBeTruthy();
    const fila = filaTabla('Pago anulado por error');
    expect(within(fila).getByText('Anulado')).toBeTruthy();
    expect(within(fila).getByText('Motivo: Error al digitar')).toBeTruthy();
    expect(within(fila).queryByRole('button', { name: /Anular/ })).toBeNull();
  });

  it('las cifras vienen del resumen del servidor, con la comparacion contra el mes anterior', async () => {
    await abrirPagina();

    const resumen = screen.getByRole('region', { name: 'Resumen del mes' });
    expect(within(resumen).getByText('Total del mes').nextElementSibling.textContent).toContain('1.320.000');
    expect(within(resumen).getByText(/▲ 32 % más que en octubre/)).toBeTruthy();
    expect(within(resumen).getByText('1 anulado no cuentan')).toBeTruthy();
    expect(within(resumen).getByText('Pagado en efectivo').nextElementSibling.textContent).toContain('120.000');
    expect(within(resumen).getByText(/otros medios: \$\s?1\.200\.000/)).toBeTruthy();
  });

  it('la lista de categorias del mes sale del resumen', async () => {
    await abrirPagina();

    const top = screen.getByText('Top categorías del mes').closest('aside');
    expect(within(top).getByText(/Arriendo/)).toBeTruthy();
    expect(within(top).getByText(/Servicios/)).toBeTruthy();
  });

  it('cambiar el mes pide ese mes y ofrece volver al actual', async () => {
    await abrirPagina();

    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-03' } });

    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ mes: '2026-03', page: 1 }));
    expect(fetchResumenMock.mock.calls.at(-1)[0]).toMatchObject({ mes: '2026-03' });
    fireEvent.click(screen.getByRole('button', { name: 'Mes actual' }));
    await waitFor(() => expect(ultimaConsulta().mes).toBe(MES));
  });

  it('los filtros de categoria, medio y estado se envian al servidor y vuelven a la primera pagina', async () => {
    await abrirPagina({ totalPages: 3 });
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(ultimaConsulta().page).toBe(2));

    fireEvent.change(document.querySelector('#gastos-filtro-categoria'), { target: { value: 'arriendo' } });
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ categoria: 'arriendo', page: 1 }));
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'transferencia' } });
    await waitFor(() => expect(ultimaConsulta().medio).toBe('transferencia'));
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'anulados' } });
    await waitFor(() => expect(ultimaConsulta().estado).toBe('anulados'));
  });

  it('el buscador espera a que termines de escribir y busca en el servidor', async () => {
    await abrirPagina();

    fireEvent.change(screen.getByLabelText('Buscar gasto'), { target: { value: 'luz' } });

    await waitFor(() => expect(ultimaConsulta().q).toBe('luz'));
  });

  it('la paginacion pide la pagina siguiente', async () => {
    await abrirPagina({ totalPages: 4 });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(ultimaConsulta().page).toBe(2));
  });

  it('un mes sin gastos lo explica y no inventa porcentajes', async () => {
    await abrirPagina({ gastos: [], resumen: RESUMEN_VACIO });

    expect(screen.getByText('No hay gastos registrados en este mes.')).toBeTruthy();
    expect(screen.getByText('No hay gastos en este mes.')).toBeTruthy();
    expect(screen.getByText('Sin gastos en octubre')).toBeTruthy();
  });

  it('una busqueda sin resultados dice que no hubo coincidencias', async () => {
    await abrirPagina({ gastos: [], resumen: RESUMEN_VACIO });

    fireEvent.change(document.querySelector('#gastos-filtro-categoria'), { target: { value: 'nomina' } });

    expect(await screen.findByText('No se encontraron gastos con ese criterio.')).toBeTruthy();
  });

  it('en celular cada gasto tiene su tarjeta con el boton de anular', async () => {
    await abrirPagina();

    const tarjeta = screen.getAllByText('Arriendo del local').map((el) => el.closest('li')).find(Boolean);

    expect(within(tarjeta).getByText('Transferencia')).toBeTruthy();
    expect(within(tarjeta).getByRole('button', { name: /Anular gasto 2/ })).toBeTruthy();
  });

  it('si el servidor falla muestra el error', async () => {
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'u', role: 'vendedor' } });
    fetchGastosMock.mockRejectedValue(new Error('No se pudo cargar gastos'));
    fetchResumenMock.mockRejectedValue(new Error('No se pudo cargar gastos'));
    fetchCajaEstadoMock.mockResolvedValue({ abierta: true });
    const Gastos = (await import('../Gastos')).default;
    render(<Gastos />);

    expect(await screen.findByText('No se pudo cargar gastos')).toBeTruthy();
  });
});

describe('Gastos: registrar', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('el formulario tiene etiquetas y el monto se escribe con puntos de miles', async () => {
    await abrirPagina();

    ['Categoría', 'Detalle del gasto', 'Pagado con'].forEach((etiqueta) => expect(screen.getAllByLabelText(etiqueta).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Monto', { selector: 'input' }), { target: { value: '85000' } });
    expect(screen.getByLabelText('Monto', { selector: 'input' })).toHaveValue('85.000');
  });

  it('un gasto en efectivo se envia sin fecha y recarga el historial y el resumen', async () => {
    apiPostMock.mockResolvedValue(gasto({ id: 9 }));
    await abrirPagina();
    const consultasAntes = fetchGastosMock.mock.calls.length;

    llenar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/gastos', {
      categoria: 'servicios', descripcion: 'Pago de internet', monto: 85000, medio_pago: 'efectivo',
    }));
    expect(await screen.findByText('Gasto registrado correctamente')).toBeTruthy();
    await waitFor(() => expect(fetchGastosMock.mock.calls.length).toBeGreaterThan(consultasAntes));
    expect(screen.getByLabelText('Detalle del gasto')).toHaveValue('');
  });

  it('por transferencia aparece la fecha opcional y se envia', async () => {
    apiPostMock.mockResolvedValue(gasto({ id: 9, medio_pago: 'transferencia' }));
    await abrirPagina();

    expect(screen.queryByLabelText('Fecha (si no fue hoy)')).toBeNull();
    llenar({ medio: 'transferencia' });
    fireEvent.change(screen.getByLabelText('Fecha (si no fue hoy)'), { target: { value: '2026-03-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/gastos', expect.objectContaining({ medio_pago: 'transferencia', fecha: '2026-03-15' })));
  });

  it('explica si el gasto sale del cajon o no', async () => {
    await abrirPagina();

    expect(screen.getByText(/Sale del cajón/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pagado con'), { target: { value: 'tarjeta' } });
    expect(screen.getByText(/No sale del cajón/)).toBeTruthy();
  });

  it('con la caja cerrada no deja pagar en efectivo, pero si por transferencia', async () => {
    await abrirPagina({ caja: { abierta: false } });

    expect(screen.getByText(/La caja está cerrada: ábrela para pagar en efectivo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar gasto' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Pagado con'), { target: { value: 'transferencia' } });
    expect(screen.getByRole('button', { name: 'Guardar gasto' })).toBeEnabled();
  });

  it('si no se pudo consultar la caja no bloquea: decide el servidor', async () => {
    apiPostMock.mockRejectedValue(new Error('La caja esta cerrada. Abre la caja para registrar gastos en efectivo'));
    await abrirPagina({ caja: new Error('sin red') });

    llenar();
    expect(screen.getByRole('button', { name: 'Guardar gasto' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(await screen.findByText(/La caja esta cerrada/)).toBeTruthy();
  });

  it('valida detalle y monto antes de llamar al servidor', async () => {
    await abrirPagina();

    llenar({ descripcion: 'ab', monto: '1000' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }));
    expect(await screen.findByText('Describe el gasto (mínimo 4 letras)')).toBeTruthy();

    llenar({ descripcion: 'Pago de internet', monto: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }));
    expect(await screen.findByText('El monto debe ser mayor a cero')).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('el error del servidor se muestra y no se pierde lo escrito', async () => {
    apiPostMock.mockRejectedValue(new Error('El monto es demasiado grande'));
    await abrirPagina();

    llenar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(await screen.findByText('El monto es demasiado grande')).toBeTruthy();
    expect(screen.getByLabelText('Detalle del gasto')).toHaveValue('Pago de internet');
  });
});

describe('Gastos: anular', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const abrirAnulacion = () => fireEvent.click(screen.getAllByRole('button', { name: 'Anular gasto 1' })[0]);

  it('el vendedor debe dar usuario y clave de un administrador y la lista se recarga', async () => {
    apiPostMock.mockResolvedValue(gasto({ anulado: true }));
    await abrirPagina({ rol: 'vendedor' });
    const consultasAntes = fetchGastosMock.mock.calls.length;

    abrirAnulacion();
    expect(screen.getAllByLabelText('Usuario del administrador').length).toBeGreaterThan(0);
    fireEvent.change(screen.getAllByLabelText('Motivo de la anulación')[0], { target: { value: 'Error al digitar' } });
    fireEvent.change(screen.getAllByLabelText('Usuario del administrador')[0], { target: { value: 'admin' } });
    fireEvent.change(screen.getAllByLabelText('Clave del administrador')[0], { target: { value: 'secreta' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar anulación/ })[0]);

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/gastos/1/anular', {
      motivo: 'Error al digitar', autorizador_usuario: 'admin', autorizador_password: 'secreta',
    }));
    expect(await screen.findByText('Gasto #1 anulado: ya no cuenta en la caja')).toBeTruthy();
    await waitFor(() => expect(fetchGastosMock.mock.calls.length).toBeGreaterThan(consultasAntes));
    expect(screen.queryByLabelText('Motivo de la anulación')).toBeNull();
  });

  it('el administrador solo da el motivo', async () => {
    apiPostMock.mockResolvedValue(gasto({ anulado: true }));
    await abrirPagina({ rol: 'admin' });

    abrirAnulacion();
    expect(screen.queryByLabelText('Usuario del administrador')).toBeNull();
    fireEvent.change(screen.getAllByLabelText('Motivo de la anulación')[0], { target: { value: 'Duplicado' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar anulación/ })[0]);

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/gastos/1/anular', { motivo: 'Duplicado', autorizador_usuario: null, autorizador_password: null }));
  });

  it('si el servidor rechaza la anulacion el motivo se ve en el formulario y no se recarga nada', async () => {
    apiPostMock.mockRejectedValue(new Error('Autorizacion invalida'));
    await abrirPagina({ rol: 'vendedor' });
    const consultasAntes = fetchGastosMock.mock.calls.length;

    abrirAnulacion();
    fireEvent.change(screen.getAllByLabelText('Motivo de la anulación')[0], { target: { value: 'Error al digitar' } });
    fireEvent.change(screen.getAllByLabelText('Usuario del administrador')[0], { target: { value: 'admin' } });
    fireEvent.change(screen.getAllByLabelText('Clave del administrador')[0], { target: { value: 'mala' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar anulación/ })[0]);

    expect((await screen.findAllByText('Autorizacion invalida')).length).toBeGreaterThan(0);
    expect(fetchGastosMock.mock.calls.length).toBe(consultasAntes);
  });

  it('cancelar cierra el formulario sin llamar al servidor', async () => {
    await abrirPagina();

    abrirAnulacion();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);

    expect(screen.queryByLabelText('Motivo de la anulación')).toBeNull();
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});
