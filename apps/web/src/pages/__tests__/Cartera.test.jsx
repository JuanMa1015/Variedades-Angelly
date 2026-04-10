import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

const useCarteraDataMock = vi.hoisted(() => vi.fn());

vi.mock('../cartera/useCarteraData', () => ({
  useCarteraData: useCarteraDataMock,
}));

vi.mock('../cartera/CarteraDashboardSection', () => ({
  default: () => <div data-testid="dashboard-section" />,
}));

vi.mock('../cartera/CarteraClientesSection', () => ({
  default: () => <div data-testid="clientes-section" />,
}));

vi.mock('../cartera/CarteraCobrarSection', () => ({
  default: () => <div data-testid="cobrar-section" />,
}));

vi.mock('../cartera/CarteraProductosSection', () => ({
  default: () => <div data-testid="productos-section" />,
}));

vi.mock('../cartera/CarteraVentaSection', () => ({
  default: () => <div data-testid="venta-section" />,
}));

vi.mock('../../components/RegistrarAbonoModal', () => ({
  default: () => <div data-testid="abono-modal" />,
}));

vi.mock('../../components/VerDetalleModal', () => ({
  default: () => <div data-testid="detalle-modal" />,
}));

import Cartera from '../Cartera';

const baseData = {
  activeSection: 'dashboard',
  clientes: [],
  clientesCatalogo: [],
  clientesCarteraFiltrados: [],
  clientesRanking: [],
  clientesMasCompras: [],
  clientesAccesoRapido: [],
  dashboardVentas: {},
  resumenCartera: {},
  productosCartera: [],
  loading: false,
  error: '',
  success: '',
  searchTerm: '',
  setSearchTerm: vi.fn(),
  currentPage: 1,
  setCurrentPage: vi.fn(),
  totalPages: 1,
  selectedClienteAbono: null,
  setSelectedClienteAbono: vi.fn(),
  selectedClienteDetalle: null,
  setSelectedClienteDetalle: vi.fn(),
  expandedCobroClientes: [],
  toggleCobroCliente: vi.fn(),
  ventasHistorial: [],
  loadingVentasHistorial: false,
  isVentasHistorialOpen: false,
  setIsVentasHistorialOpen: vi.fn(),
  clienteForm: {
    nombre: 'Cliente de prueba',
    documento: '123',
    telefono_whatsapp: '3001234567',
    limite_credito: '100000',
  },
  setClienteForm: vi.fn(),
  productoForm: {
    nombre: 'Producto de prueba',
    codigo_barras: '',
    precio_costo: '0',
    precio_venta: '0',
    stock_actual: '0',
  },
  setProductoForm: vi.fn(),
  isClienteModalOpen: false,
  setIsClienteModalOpen: vi.fn(),
  isProductoModalOpen: false,
  setIsProductoModalOpen: vi.fn(),
  editingClienteId: null,
  savingCliente: false,
  savingProducto: false,
  startNewCliente: vi.fn(),
  startNewProducto: vi.fn(),
  startEditingCliente: vi.fn(),
  cancelEditingCliente: vi.fn(),
  handleSubmitCliente: vi.fn(),
  handleDeleteCliente: vi.fn(),
  handleSubmitProducto: vi.fn(),
  handleAbrirWhatsapp: vi.fn(),
  handleRegistrarAbono: vi.fn(),
  handleConfirmAbono: vi.fn(),
  handleOpenVentasHistorial: vi.fn(),
  handleVerDetalle: vi.fn(),
  handleSubmitVentaCartera: vi.fn(),
  handleChangeVentaItem: vi.fn(),
  handleRemoveVentaItem: vi.fn(),
  ventaModo: 'fiado',
  setVentaModo: vi.fn(),
  ventaClienteId: '',
  setVentaClienteId: vi.fn(),
  ventaFecha: '2026-04-09T10:00',
  setVentaFecha: vi.fn(),
  abonoInicial: '',
  setAbonoInicial: vi.fn(),
  pagoRecibido: '',
  setPagoRecibido: vi.fn(),
  metodoPago: 'efectivo',
  setMetodoPago: vi.fn(),
  referenciaVenta: '',
  setReferenciaVenta: vi.fn(),
  ventaItems: [],
  setVentaItems: vi.fn(),
  productosById: new Map(),
  totalVentaEstimado: 0,
  totalAPagar: 0,
  cambioContado: 0,
  savingVenta: false,
  navigate: vi.fn(),
  formatMoney: (value) => `$${Number(value || 0).toLocaleString('es-CO')}`,
};

const renderCartera = (overrides = {}) => {
  const data = {
    ...baseData,
    ...overrides,
  };

  useCarteraDataMock.mockReturnValue(data);
  render(<Cartera />);

  return data;
};

describe('Cartera page modals', () => {
  it('renders and closes the client create modal', () => {
    const data = renderCartera({
      isClienteModalOpen: true,
      editingClienteId: null,
    });

    expect(screen.getByRole('heading', { name: /registrar cliente/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar cliente/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cerrar modal/i }));
    expect(data.cancelEditingCliente).toHaveBeenCalled();
  });

  it('renders the client edit modal with update action', () => {
    renderCartera({
      isClienteModalOpen: true,
      editingClienteId: 42,
    });

    expect(screen.getByRole('heading', { name: /editar cliente/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actualizar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });
});