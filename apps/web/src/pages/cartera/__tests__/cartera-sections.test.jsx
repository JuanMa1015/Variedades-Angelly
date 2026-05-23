import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import CarteraDashboardSection from '../CarteraDashboardSection';
import CarteraClientesSection from '../CarteraClientesSection';
import CarteraVentaSection from '../CarteraVentaSection';
import CarteraCobrarSection from '../CarteraCobrarSection';

const formatMoney = (value) => `$${Number(value || 0).toLocaleString('es-CO')}`;

describe('Cartera sections smoke tests', () => {
  it('renders dashboard KPIs and quick actions', () => {
    const navigate = vi.fn();

    render(
      <CarteraDashboardSection
        resumenCartera={{
          clientes_totales: 12,
          clientes_con_deuda: 4,
          deuda_total: 250000,
          limite_total: 500000,
          disponible_total: 250000,
          clientes_alto_riesgo: 1,
          saldo_promedio: 62500,
        }}
        dashboardVentas={{
          ventas_diarias: 120000,
          ventas_semanales: 540000,
          ventas_mensuales: 2100000,
          transacciones_diarias: 3,
          transacciones_semanales: 15,
          transacciones_mensuales: 42,
        }}
        clientesRanking={[
          { id: 1, nombre: 'Cliente A', deuda_total: 90000, limite_credito: 100000 },
        ]}
        clientesMasCompras={[
          { id: 1, nombre: 'Cliente A', compras_cantidad: 4, compras_total: 120000 },
        ]}
        clientesAccesoRapido={[
          { id: 1, nombre: 'Cliente A', deuda_total: 90000 },
        ]}
        navigate={navigate}
        formatMoney={formatMoney}
      />,
    );

    expect(screen.getByText('Clientes totales')).toBeInTheDocument();
    expect(screen.getByText('Resumen operativo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cobrar cartera/i }));
    expect(navigate).toHaveBeenCalledWith('/cartera/cobrar');
  });

  it('renders clientes table actions for edit and delete flows', () => {
    const startNewCliente = vi.fn();
    const startEditingCliente = vi.fn();
    const handleDeleteCliente = vi.fn();

    render(
      <CarteraClientesSection
        clientesCarteraFiltrados={[
          { id: 1, nombre: 'Cliente A', documento: '123', telefono_whatsapp: '3001234567', deuda_total: 78000 },
        ]}
        formatMoney={formatMoney}
        searchTerm=""
        setSearchTerm={vi.fn()}
        startNewCliente={startNewCliente}
        startEditingCliente={startEditingCliente}
        handleDeleteCliente={handleDeleteCliente}
      />,
    );

    expect(screen.getByText('Registro de clientes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /registrar cliente/i }));
    expect(startNewCliente).toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /editar/i })[0]);
    expect(startEditingCliente).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, nombre: 'Cliente A' }),
    );

    fireEvent.click(screen.getAllByRole('button', { name: /eliminar/i })[0]);
    expect(handleDeleteCliente).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, nombre: 'Cliente A' }),
    );
  });

  it('renders venta flow and toggles critical controls', () => {
    const setVentaModo = vi.fn();
    const setVentaClienteId = vi.fn();
    const setVentaFecha = vi.fn();
    const setAbonoInicial = vi.fn();
    const setPagoRecibido = vi.fn();
    const setMetodoPago = vi.fn();
    const setReferenciaVenta = vi.fn();
    const setVentaItems = vi.fn();
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

    fireEvent.click(screen.getByRole('button', { name: /\+ agregar línea/i }));
    expect(setVentaItems).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /ver historial de ventas/i }));
    expect(handleOpenVentasHistorial).toHaveBeenCalled();
  });

  it('renders cobro cards and exposes client actions', () => {
    const toggleCobroCliente = vi.fn();
    const handleAbrirWhatsapp = vi.fn();
    const handleRegistrarAbono = vi.fn();
    const handleVerDetalle = vi.fn();
    const startEditingCliente = vi.fn();
    const handleDeleteCliente = vi.fn();

    render(
      <CarteraCobrarSection
        clientes={[
          { id: 1, nombre: 'Cliente A', deuda_total: 25000, telefono_whatsapp: '3001234567' },
        ]}
        loading={false}
        error=""
        searchTerm=""
        setSearchTerm={vi.fn()}
        expandedCobroClientes={[]}
        toggleCobroCliente={toggleCobroCliente}
        handleAbrirWhatsapp={handleAbrirWhatsapp}
        handleRegistrarAbono={handleRegistrarAbono}
        handleVerDetalle={handleVerDetalle}
        startEditingCliente={startEditingCliente}
        handleDeleteCliente={handleDeleteCliente}
        formatMoney={formatMoney}
        totalPages={1}
        currentPage={1}
        setCurrentPage={vi.fn()}
      />,
    );

    expect(screen.getByText('Cobrar cartera')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ver detalles/i }));
    expect(toggleCobroCliente).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: /whatsapp/i }));
    expect(handleAbrirWhatsapp).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});
