import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CarteraVentaSection from '../CarteraVentaSection';

const formatMoney = (v) => `$ ${Number(v || 0).toLocaleString('es-CO')}`;
const CLIENTES = [
  { id: 1, nombre: 'Ana Torres', deuda_total: 12000 },
  { id: 2, nombre: 'José Núñez', deuda_total: 0 },
  { id: 3, nombre: 'Beto Gomez', deuda_total: 50000 },
];
const PRODUCTOS = [
  { id: 10, nombre: 'Arroz', precio_venta: 2000, stock_actual: 8, stock_minimo: 2, activo: true },
  { id: 11, nombre: 'Aceite', precio_venta: 9000, stock_actual: 0, stock_minimo: 2, activo: true },
  { id: 12, nombre: 'Sal', precio_venta: 1000, stock_actual: 2, stock_minimo: 5, activo: true },
  { id: 13, nombre: 'Descontinuado', precio_venta: 500, stock_actual: 9, stock_minimo: 1, activo: false },
];

const abrir = (extra = {}) => {
  const props = {
    clientesCatalogo: CLIENTES, formatMoney, ventaModo: 'fiado', setVentaModo: vi.fn(), ventaClienteId: '', setVentaClienteId: vi.fn(),
    ventaFecha: '2026-11-10T10:00', setVentaFecha: vi.fn(), abonoInicial: '', setAbonoInicial: vi.fn(), pagoRecibido: '', setPagoRecibido: vi.fn(),
    metodoPago: 'efectivo', setMetodoPago: vi.fn(), referenciaVenta: '', setReferenciaVenta: vi.fn(), ventaItems: [{ producto_id: '', cantidad: 1 }],
    productosById: new Map(PRODUCTOS.map((p) => [p.id, p])), todosLosProductos: PRODUCTOS, totalVentaEstimado: 0, totalAPagar: 0, cambioContado: 0,
    savingVenta: false, handleOpenVentasHistorial: vi.fn(), startNewCliente: vi.fn(), startNewProducto: vi.fn(), handleAddProductoVenta: vi.fn(),
    handleChangeVentaItem: vi.fn(), handleRemoveVentaItem: vi.fn(), handleSubmitVentaCartera: vi.fn(), ...extra,
  };
  render(<CarteraVentaSection {...props} />);
  return props;
};

describe('CarteraVentaSection: cliente buscable y stock', () => {
  it('el cliente se busca escribiendo, sin tildes, y se elige de la lista', () => {
    const props = abrir();
    const caja = screen.getByLabelText('Cliente');

    fireEvent.focus(caja);
    fireEvent.change(caja, { target: { value: 'jose nunez' } });
    const opciones = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(opciones).toHaveLength(1);
    expect(opciones[0].textContent).toContain('José Núñez');
    fireEvent.click(within(opciones[0]).getByRole('button'));

    expect(props.setVentaClienteId).toHaveBeenCalledWith('2');
  });

  it('cada cliente muestra cuanto debe', () => {
    abrir();

    fireEvent.focus(screen.getByLabelText('Cliente'));

    expect(screen.getByText(/Beto Gomez · debe \$ 50\.000/)).toBeTruthy();
  });

  it('los productos muestran su stock: normal, bajo y agotado, y no salen los desactivados', () => {
    abrir();

    expect(screen.getByText('Stock 8')).toBeTruthy();
    expect(screen.getByText('Stock 2')).toBeTruthy(); // por debajo del minimo (5): se resalta
    expect(screen.getByText('Sin stock')).toBeTruthy();
    expect(screen.queryByText('Descontinuado')).toBeNull();
  });

  it('un producto agotado se ve deshabilitado', () => {
    abrir();

    const aceite = screen.getByText('Aceite').closest('[role="button"]');

    expect(aceite).toHaveAttribute('aria-disabled', 'true');
  });
});
