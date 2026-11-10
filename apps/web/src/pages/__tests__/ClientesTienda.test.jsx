import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const apiPatchMock = vi.hoisted(() => vi.fn());
const apiDeleteMock = vi.hoisted(() => vi.fn());
const apiRequestMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const printMock = vi.hoisted(() => vi.fn());

vi.mock('../../auth/AuthContext', () => ({ useAuth: useAuthMock }));
vi.mock('../../api/httpClient', () => ({
  apiDelete: apiDeleteMock,
  apiGet: apiGetMock,
  apiPatch: apiPatchMock,
  apiPost: apiPostMock,
  apiRequest: apiRequestMock,
}));
vi.mock('../../components/useConfirm', () => ({
  default: () => ({ confirm: confirmMock, ConfirmModal: <div data-testid="confirm-modal" /> }),
}));
vi.mock('../Ventas/printReceipt', () => ({ printHtml: printMock }));

import ClientesTienda from '../ClientesTienda';

const resumen = {
  clientes_totales: 4, clientes_con_deuda: 3, deuda_total: 479300, clientes_alto_riesgo: 1, clientes_riesgo_medio: 1, saldo_promedio: 159767, deuda_morosa: 452800,
};

const clientes = [
  { id: 1, nombre: 'Luz Dary Manco', telefono_whatsapp: '573001110008', deuda_total: 452800, dias_deuda: 90, estado_deuda: 'moroso', tiene_ventas: true, activo: true },
  { id: 2, nombre: 'Flor Manco', telefono_whatsapp: null, deuda_total: 20000, dias_deuda: 45, estado_deuda: 'alerta', tiene_ventas: true, activo: true },
  { id: 3, nombre: 'Aura Gomez', telefono_whatsapp: '573001110002', deuda_total: 0, dias_deuda: null, estado_deuda: 'sin_deuda', tiene_ventas: false, activo: true },
  { id: 4, nombre: 'Berta Villa', telefono_whatsapp: '573001110001', deuda_total: 0, dias_deuda: null, estado_deuda: 'sin_deuda', tiene_ventas: true, activo: true },
];

const fila = (nombre) => screen.getByText(nombre).closest('li');
const consultas = () => apiGetMock.mock.calls.map(([url]) => url).filter((url) => url.includes('/lista?'));

const abrir = async () => {
  render(<ClientesTienda />);
  await screen.findByText('Luz Dary Manco');
};

describe('ClientesTienda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'vendedor1', role: 'vendedor' } });
    apiGetMock.mockImplementation((url) => {
      if (url.includes('/resumen')) return Promise.resolve(resumen);
      if (url.includes('/lista?')) return Promise.resolve({ data: clientes, total: 4, total_pages: 1, current_page: 1 });
      if (url.includes('/movimientos')) return Promise.resolve({ data: [], total_pages: 1, current_page: 1 });
      return Promise.resolve([]);
    });
    apiPostMock.mockResolvedValue({});
    apiPatchMock.mockResolvedValue({});
    apiDeleteMock.mockResolvedValue(undefined);
    apiRequestMock.mockResolvedValue({});
    confirmMock.mockResolvedValue(true);
  });

  it('muestra el resumen de la deuda y los clientes ordenados como los entrega el servidor', async () => {
    await abrir();

    const resumenDeuda = screen.getByRole('region', { name: 'Resumen de la deuda' });
    expect(within(resumenDeuda).getByText('$ 479.300')).toBeInTheDocument();
    expect(within(resumenDeuda).getByText(/\$ 452\.800 · más de 60 días/)).toBeInTheDocument();
    const nombres = screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent).filter(Boolean);
    expect(nombres.slice(0, 2)).toEqual(['Luz Dary Manco', 'Flor Manco']);
  });

  it('cada fila dice el estado y desde hace cuantos dias se debe', async () => {
    await abrir();

    expect(within(fila('Luz Dary Manco')).getByText('Moroso')).toBeInTheDocument();
    expect(within(fila('Luz Dary Manco')).getByText('Debe hace 90 días')).toBeInTheDocument();
    expect(within(fila('Flor Manco')).getByText('Alerta')).toBeInTheDocument();
    expect(within(fila('Berta Villa')).getByText('Sin deuda')).toBeInTheDocument();
  });

  it('el telefono se muestra legible, sin el indicativo', async () => {
    await abrir();

    expect(within(fila('Luz Dary Manco')).getByText('300 111 0008')).toBeInTheDocument();
    expect(within(fila('Flor Manco')).getByText('Sin WhatsApp')).toBeInTheDocument();
  });

  it('abonar solo esta disponible para quien debe', async () => {
    await abrir();

    expect(within(fila('Luz Dary Manco')).getByRole('button', { name: /Abonar/ })).toBeEnabled();
    expect(within(fila('Aura Gomez')).getByRole('button', { name: /Abonar/ })).toBeDisabled();
  });

  it('eliminar se bloquea con deuda o con historial y explica por que', async () => {
    await abrir();

    const conDeuda = within(fila('Luz Dary Manco')).getByRole('button', { name: /Eliminar/ });
    const conHistorial = within(fila('Berta Villa')).getByRole('button', { name: /Eliminar/ });
    const libre = within(fila('Aura Gomez')).getByRole('button', { name: /Eliminar/ });

    expect(conDeuda).toBeDisabled();
    expect(conDeuda).toHaveAttribute('title', 'Cobra o ajusta la deuda antes de eliminar');
    expect(conHistorial).toBeDisabled();
    expect(conHistorial).toHaveAttribute('title', 'Tiene historial de ventas: no se elimina');
    expect(libre).toBeEnabled();
    fireEvent.click(libre);
    await waitFor(() => expect(apiDeleteMock).toHaveBeenCalledWith('/api/clientes/tienda-fiado/3'));
  });

  it('recordar el cobro por WhatsApp necesita un numero valido', async () => {
    const abrirVentana = vi.spyOn(window, 'open').mockImplementation(() => null);
    await abrir();

    expect(within(fila('Flor Manco')).getByRole('button', { name: /Recordar/ })).toBeDisabled();
    fireEvent.click(within(fila('Luz Dary Manco')).getByRole('button', { name: /Recordar/ }));

    expect(abrirVentana).toHaveBeenCalledTimes(1);
    expect(abrirVentana.mock.calls[0][0]).toContain('https://wa.me/573001110008?text=');
    expect(decodeURIComponent(abrirVentana.mock.calls[0][0]).replace(/\u00a0/g, ' ')).toContain('$ 452.800');
    abrirVentana.mockRestore();
  });

  // -- Buscador, filtros y orden: los resuelve el servidor --

  it('los filtros y el orden vuelven a pedir la lista al servidor', async () => {
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Morosos' }));
    await waitFor(() => expect(consultas().at(-1)).toContain('filtro=moroso'));
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'nombre' } });
    await waitFor(() => expect(consultas().at(-1)).toContain('orden=nombre'));
  });

  it('el buscador espera a que termines de escribir', async () => {
    await abrir();
    const antes = consultas().length;

    fireEvent.change(screen.getByLabelText('Buscar clientes'), { target: { value: 'manco' } });

    await waitFor(() => expect(consultas().at(-1)).toContain('q=manco'));
    expect(consultas().length).toBe(antes + 1);
  });

  it('solo un administrador ve el filtro de eliminados y puede reactivar', async () => {
    await abrir();
    expect(screen.queryByRole('button', { name: 'Eliminados' })).not.toBeInTheDocument();
  });

  it('el superadmin ve los eliminados y reactiva un cliente', async () => {
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'root', role: 'superadmin' } });
    await abrir();
    apiGetMock.mockImplementation((url) => {
      if (url.includes('/resumen')) return Promise.resolve(resumen);
      if (url.includes('inactivos=true')) return Promise.resolve({ data: [{ ...clientes[2], activo: false }], total: 1, total_pages: 1, current_page: 1 });
      return Promise.resolve({ data: clientes, total: 4, total_pages: 1, current_page: 1 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminados' }));

    fireEvent.click(await screen.findByRole('button', { name: /Reactivar/ }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith('/api/clientes/tienda-fiado/3/reactivar', { method: 'PUT' }));
  });

  it('sin resultados explica que no hay coincidencias', async () => {
    await abrir();
    apiGetMock.mockImplementation((url) => Promise.resolve(url.includes('/resumen') ? resumen : { data: [], total: 0, total_pages: 1, current_page: 1 }));

    fireEvent.click(screen.getByRole('button', { name: 'Morosos' }));

    expect(await screen.findByText('No hay clientes que coincidan con la búsqueda.')).toBeInTheDocument();
  });

  // -- Alta y edicion --

  it('un cliente nuevo solo pide el nombre (sin apellido obligatorio) y se envia el telefono limpio', async () => {
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: /Nuevo cliente/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Pedro' } });
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '300 111 2233' } });
    expect(screen.getByText('Se guardará como 300 111 2233.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/clientes/tienda-fiado', { nombre: 'Pedro', telefono_whatsapp: '3001112233' }));
  });

  it('valida el nombre y el formato del WhatsApp antes de enviar', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo cliente/ }));

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Al' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/mínimo 3 letras/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Alberto' } });
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '123' } });
    expect(screen.getByText(/Debe tener 7/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('El WhatsApp no tiene un formato válido')).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('un homonimo pide confirmar y con el si se registra', async () => {
    apiPostMock.mockRejectedValueOnce(Object.assign(new Error('Ya hay un cliente con ese nombre'), {
      status: 409,
      payload: { homonimo: true, coincidencias: [{ id: 9, nombre: 'José Pérez', telefono_whatsapp: '573004445566' }] },
    })).mockResolvedValueOnce({});
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: /Nuevo cliente/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Jose Perez' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Es otra persona?' })));
    expect(confirmMock.mock.calls[0][0].message).toContain('José Pérez');
    await waitFor(() => expect(apiPostMock).toHaveBeenLastCalledWith('/api/clientes/tienda-fiado', { nombre: 'Jose Perez', telefono_whatsapp: null, confirmar_homonimo: true }));
  });

  it('si no confirma el homonimo no se guarda y el cuadro sigue abierto', async () => {
    apiPostMock.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409, payload: { homonimo: true, coincidencias: [] } }));
    confirmMock.mockResolvedValue(false);
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: /Nuevo cliente/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Jose Perez' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('No se guardó: ya existe un cliente con ese nombre.')).toBeInTheDocument();
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  it('cambiar la deuda exige un motivo y lo envia junto con el nuevo valor', async () => {
    await abrir();

    fireEvent.click(within(fila('Flor Manco')).getByRole('button', { name: /Editar/ }));
    expect(screen.queryByLabelText('Motivo del ajuste')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Deuda total', { selector: 'input' }), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText(/Escribe el motivo del ajuste/)).toBeInTheDocument();
    expect(apiPatchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Motivo del ajuste'), { target: { value: 'Pago no registrado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(apiPatchMock).toHaveBeenCalledWith('/api/clientes/tienda-fiado/2', {
      nombre: 'Flor Manco', telefono_whatsapp: null, deuda_total: 15000, motivo_ajuste: 'Pago no registrado',
    }));
  });

  it('un cliente de un solo nombre se puede editar sin inventarle apellido', async () => {
    apiGetMock.mockImplementation((url) => Promise.resolve(url.includes('/resumen') ? resumen : { data: [{ ...clientes[2], nombre: 'Marta' }], total: 1, total_pages: 1, current_page: 1 }));
    render(<ClientesTienda />);

    fireEvent.click(await screen.findByRole('button', { name: /Editar/ }));
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '3105556677' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(apiPatchMock).toHaveBeenCalledWith('/api/clientes/tienda-fiado/3', { nombre: 'Marta', telefono_whatsapp: '3105556677' }));
  });

  // -- Abonos --

  it('abonar: monto con puntos, medio de pago y comprobante despues de registrarlo', async () => {
    apiPostMock.mockResolvedValue({
      id: 7, cliente_id: 1, cliente_nombre: 'Luz Dary Manco', monto: 50000, metodo_pago: 'transferencia', deuda_anterior: 452800, saldo_cliente: 402800, fecha: '2026-11-10T20:00:00', anulado: false,
    });
    await abrir();

    fireEvent.click(within(fila('Luz Dary Manco')).getByRole('button', { name: /Abonar/ }));
    fireEvent.change(screen.getByLabelText('Monto del abono'), { target: { value: '50000' } });
    expect(screen.getByLabelText('Monto del abono')).toHaveValue('50.000');
    fireEvent.click(screen.getByRole('radio', { name: /Transferencia/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/clientes/tienda/1/abonos', { monto: 50000, metodo_pago: 'transferencia' }));
    expect(await screen.findByText('Abono registrado')).toBeInTheDocument();
    expect(screen.getByText('$ 402.800')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Imprimir comprobante/ }));
    expect(printMock.mock.calls[0][0]).toContain('COMPROBANTE DE ABONO #7');
    expect(screen.getByRole('link', { name: /Enviar por WhatsApp/ })).toHaveAttribute('href', expect.stringContaining('wa.me/573001110008'));
  });

  it('saldar toda la deuda llena el monto completo', async () => {
    await abrir();

    fireEvent.click(within(fila('Luz Dary Manco')).getByRole('button', { name: /Abonar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Saldar toda la deuda/ }));

    expect(screen.getByLabelText('Monto del abono')).toHaveValue('452.800');
  });

  it('no deja abonar mas que la deuda ni un monto vacio', async () => {
    await abrir();
    fireEvent.click(within(fila('Flor Manco')).getByRole('button', { name: /Abonar/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    expect(await screen.findByText('Ingresa un monto válido mayor a 0')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Monto del abono'), { target: { value: '99999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    expect(await screen.findByText('El abono supera la deuda actual del cliente')).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza el abono (caja cerrada) el motivo se ve dentro del cuadro', async () => {
    apiPostMock.mockRejectedValue(new Error('La caja esta cerrada. Abre la caja para registrar abonos'));
    await abrir();

    fireEvent.click(within(fila('Flor Manco')).getByRole('button', { name: /Abonar/ }));
    fireEvent.change(screen.getByLabelText('Monto del abono'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La caja esta cerrada');
  });

  // -- Historial --

  it('el historial muestra cada venta con sus productos y cada abono con su medio y saldo', async () => {
    apiGetMock.mockImplementation((url) => {
      if (url.includes('/resumen')) return Promise.resolve(resumen);
      if (url.includes('/movimientos')) {
        return Promise.resolve({
          total_pages: 1,
          data: [
            { id: 11, tipo: 'Abono', fecha: '2026-11-10T20:00:00', monto: 2000, metodo_pago: 'transferencia', referencia: 'Nequi 123', saldo: 3000, anulado: false },
            { id: 5, tipo: 'Venta', fecha: '2026-11-09T15:00:00', monto: 5000, por_pagar: 4000, items: [{ articulo: 'Arroz', cantidad: 2, precio_unitario: 2500, subtotal: 5000 }], anulado: false },
            { id: 4, tipo: 'Venta', fecha: '2026-11-08T15:00:00', monto: 900, por_pagar: 900, items: [], anulado: true, motivo_anulacion: 'Error al digitar' },
          ],
        });
      }
      return Promise.resolve({ data: clientes, total: 4, total_pages: 1, current_page: 1 });
    });
    await abrir();

    fireEvent.click(within(fila('Flor Manco')).getByRole('button', { name: /Historial/ }));

    expect(await screen.findByText('Abono #11')).toBeInTheDocument();
    expect(screen.getByText('Ref.: Nequi 123')).toBeInTheDocument();
    expect(screen.getByText(/Saldo después del abono/)).toBeInTheDocument();
    expect(screen.getByText('2× Arroz')).toBeInTheDocument();
    expect(screen.getByText('Quedó fiado: $ 4.000')).toBeInTheDocument();
    expect(screen.getByText('Anulada')).toBeInTheDocument();
    expect(screen.getByText('Motivo: Error al digitar')).toBeInTheDocument();
  });

  it('el vendedor anula un abono con la clave de un administrador', async () => {
    apiGetMock.mockImplementation((url) => {
      if (url.includes('/resumen')) return Promise.resolve(resumen);
      if (url.includes('/movimientos')) {
        return Promise.resolve({ total_pages: 1, data: [{ id: 11, tipo: 'Abono', fecha: '2026-11-10T20:00:00', monto: 2000, metodo_pago: 'efectivo', saldo: 3000, anulado: false }] });
      }
      return Promise.resolve({ data: clientes, total: 4, total_pages: 1, current_page: 1 });
    });
    await abrir();

    fireEvent.click(within(fila('Flor Manco')).getByRole('button', { name: /Historial/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Anular abono/ }));
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'Monto mal digitado' } });
    fireEvent.change(screen.getByLabelText('Usuario del administrador'), { target: { value: 'angelly_admin' } });
    fireEvent.change(screen.getByLabelText('Clave del administrador'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/clientes/tienda/abonos/11/anular', {
      motivo: 'Monto mal digitado', autorizador_usuario: 'angelly_admin', autorizador_password: 'secreta',
    }));
  });

  it('el superadmin anula sin pedir clave', async () => {
    useAuthMock.mockReturnValue({ token: 't', user: { username: 'root', role: 'superadmin' } });
    apiGetMock.mockImplementation((url) => {
      if (url.includes('/resumen')) return Promise.resolve(resumen);
      if (url.includes('/movimientos')) {
        return Promise.resolve({ total_pages: 1, data: [{ id: 11, tipo: 'Abono', fecha: '2026-11-10T20:00:00', monto: 2000, metodo_pago: 'efectivo', saldo: 3000, anulado: false }] });
      }
      return Promise.resolve({ data: clientes, total: 4, total_pages: 1, current_page: 1 });
    });
    await abrir();

    fireEvent.click(within(fila('Flor Manco')).getByRole('button', { name: /Historial/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Anular abono/ }));

    expect(screen.queryByLabelText('Clave del administrador')).not.toBeInTheDocument();
  });

  it('un cliente sin movimientos lo dice', async () => {
    await abrir();

    fireEvent.click(within(fila('Aura Gomez')).getByRole('button', { name: /Historial/ }));

    expect(await screen.findByText('Este cliente todavía no tiene movimientos.')).toBeInTheDocument();
  });
});
