import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import CarteraVentaSection from '../CarteraVentaSection';

const formatMoney = (value) => `$${Number(value || 0).toLocaleString('es-CO')}`;

describe('Cartera sections smoke tests', () => {
  it('renders venta flow and toggles critical controls', () => {
    const setVentaModo = vi.fn();
    const setVentaClienteId = vi.fn();
    const setVentaFecha = vi.fn();
    const setAbonoInicial = vi.fn();
    const setPagoRecibido = vi.fn();
    const setMetodoPago = vi.fn();
    const setReferenciaVenta = vi.fn();
    const setVentaItems = vi.fn();
    const handleAddProductoVenta = vi.fn();
    const handleOpenVentasHistorial = vi.fn();
    const startNewCliente = vi.fn();
    const startNewProducto = vi.fn();
    const handleChangeVentaItem = vi.fn();
    const handleRemoveVentaItem = vi.fn();
    const handleSubmitVentaCartera = vi.fn();

    render(
      <CarteraVentaSection
        clientesCatalogo={[{ id: 1, nombre: 'Cliente A', deuda_total: 12000 }]}
        formatMoney={formatMoney}
        ventaModo="fiado"
        setVentaModo={setVentaModo}
        ventaClienteId=""
        setVentaClienteId={setVentaClienteId}
        ventaFecha="2026-04-09T10:00"
        setVentaFecha={setVentaFecha}
        abonoInicial=""
        setAbonoInicial={setAbonoInicial}
        pagoRecibido=""
        setPagoRecibido={setPagoRecibido}
        metodoPago="efectivo"
        setMetodoPago={setMetodoPago}
        referenciaVenta=""
        setReferenciaVenta={setReferenciaVenta}
        ventaItems={[{ producto_id: '', cantidad: 1 }]}
        setVentaItems={setVentaItems}
        handleAddProductoVenta={handleAddProductoVenta}
        productosById={new Map()}
        todosLosProductos={[{ id: 10, nombre: 'Arroz', catalogo: 'cartera' }]}
        totalVentaEstimado={3500}
        totalAPagar={3500}
        cambioContado={0}
        savingVenta={false}
        handleOpenVentasHistorial={handleOpenVentasHistorial}
        startNewCliente={startNewCliente}
        startNewProducto={startNewProducto}
        handleChangeVentaItem={handleChangeVentaItem}
        handleRemoveVentaItem={handleRemoveVentaItem}
        handleSubmitVentaCartera={handleSubmitVentaCartera}
      />,
    );

    expect(screen.getByText('Registro de venta de cartera')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /contado/i }));
    expect(setVentaModo).toHaveBeenCalledWith('contado');

    fireEvent.click(screen.getByRole('button', { name: /🍚 Arroz \$0/i }));
    expect(handleAddProductoVenta).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, nombre: 'Arroz' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /historial/i }));
    expect(handleOpenVentasHistorial).toHaveBeenCalled();
  });
});
