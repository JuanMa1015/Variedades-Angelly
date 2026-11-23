import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchCajaMovimientos: vi.fn(), fetchVenta: vi.fn(), printHtml: vi.fn() }));

vi.mock('../../../api/cajaApi', () => ({ fetchCajaMovimientos: api.fetchCajaMovimientos }));
vi.mock('../../../api/ventasApi', () => ({ fetchVenta: api.fetchVenta }));
vi.mock('../../Ventas/printReceipt', () => ({ printHtml: api.printHtml }));

import MovimientosTurno from '../MovimientosTurno';

const MOVIMIENTOS = [
  { tipo: 'venta', id: 12, fecha: '2026-03-10T15:00:00', descripcion: 'Venta #12', metodo_pago: 'efectivo', monto: 7000, total: 7000, es_fiado: false, anulada: false },
  { tipo: 'gasto', id: 3, fecha: '2026-03-10T16:00:00', descripcion: 'servicios · luz', metodo_pago: 'efectivo', monto: 3000, total: null, es_fiado: false, anulada: false },
  { tipo: 'venta', id: 13, fecha: '2026-03-10T17:00:00', descripcion: 'Venta #13', metodo_pago: 'efectivo', monto: 0, total: 5000, es_fiado: false, anulada: true },
];

const VENTA = {
  venta_id: 12, total: 7000, saldo_pendiente: 0, es_fiado: false, metodo_pago: 'efectivo', monto_recibido: 10000, vendedor: 'vendedor1', cliente_nombre: null,
  descuento_puntos: 0, puntos_canjeados: 0, puntos_otorgados: 7, anulada: false, fecha: '2026-03-10T15:00:00',
  detalles: [
    { producto_id: 1, nombre_producto: 'Arroz Diana', cantidad: 2, precio_unitario: 3500, subtotal: 7000 },
  ],
};

describe('MovimientosTurno: detalle de cada venta', () => {
  beforeEach(() => {
    api.fetchCajaMovimientos.mockReset().mockResolvedValue(MOVIMIENTOS);
    api.fetchVenta.mockReset().mockResolvedValue(VENTA);
    api.printHtml.mockReset();
  });

  it('solo las ventas tienen «Ver productos»', async () => {
    render(<MovimientosTurno cajaId={1} />);

    expect(await screen.findByText('servicios · luz')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /los productos de la venta/ })).toHaveLength(2);
    expect(api.fetchVenta).not.toHaveBeenCalled(); // no se pide nada hasta abrir
  });

  it('al abrir una venta muestra sus productos, el cobro y quien la atendió', async () => {
    render(<MovimientosTurno cajaId={1} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver los productos de la venta 12' }));

    expect(await screen.findByText('Arroz Diana')).toBeInTheDocument();
    expect(api.fetchVenta).toHaveBeenCalledWith(12, expect.anything());
    const fila = screen.getByText('Arroz Diana').closest('div');
    expect(within(fila).getByText('vendedor1')).toBeInTheDocument();
    expect(within(fila).getByText(/Recibido .*10\.000 · cambio .*3\.000/)).toBeInTheDocument();
    expect(within(fila).getByText('7')).toBeInTheDocument(); // puntos ganados
  });

  it('se puede reimprimir el comprobante y se vuelve a ocultar', async () => {
    render(<MovimientosTurno cajaId={1} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver los productos de la venta 12' }));
    fireEvent.click(await screen.findByRole('button', { name: /Reimprimir comprobante/ }));

    expect(api.printHtml).toHaveBeenCalledTimes(1);
    expect(api.printHtml.mock.calls[0][0]).toContain('Arroz Diana');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar los productos de la venta 12' }));
    expect(screen.queryByText('Arroz Diana')).not.toBeInTheDocument();
  });

  it('una venta anulada muestra el motivo y no se reimprime', async () => {
    api.fetchVenta.mockResolvedValue({ ...VENTA, venta_id: 13, anulada: true, motivo_anulacion: 'Error al digitar', anulada_por: 'vendedor1', autorizada_por: 'angelly_admin' });
    render(<MovimientosTurno cajaId={1} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver los productos de la venta 13' }));

    expect(await screen.findByText(/Motivo: Error al digitar · Anuló vendedor1, autorizó angelly_admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reimprimir comprobante/ })).not.toBeInTheDocument();
  });

  it('si el detalle falla lo dice en la misma fila', async () => {
    api.fetchVenta.mockRejectedValue(new Error('Venta no encontrada'));
    render(<MovimientosTurno cajaId={1} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver los productos de la venta 12' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Venta no encontrada');
  });
});
