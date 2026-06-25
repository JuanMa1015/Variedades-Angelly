import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const apiRequestMock = vi.hoisted(() => vi.fn());
const apiDeleteMock = vi.hoisted(() => vi.fn());
const useParamsMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
  useParams: useParamsMock,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../../api/httpClient', () => ({
  apiRequest: apiRequestMock,
  apiDelete: apiDeleteMock,
}));

vi.mock('../../components/ErrorMessage', () => ({
  default: ({ message, onDismiss }) =>
    message ? (
      <div data-testid="error-message">
        <span>{message}</span>
        <button data-testid="dismiss-error" onClick={onDismiss}>x</button>
      </div>
    ) : null,
}));

vi.mock('../../components/SuccessMessage', () => ({
  default: ({ message, onDismiss }) =>
    message ? (
      <div data-testid="success-message">
        <span>{message}</span>
        <button data-testid="dismiss-success" onClick={onDismiss}>x</button>
      </div>
    ) : null,
}));

vi.mock('../../components/Skeleton', () => ({
  default: ({ lines }) => <div data-testid="skeleton" data-lines={lines} />,
}));

vi.mock('../../components/EditFormModal', () => ({
  default: ({ isOpen, title, initialValues, onSave, onClose }) =>
    isOpen ? (
      <div data-testid="edit-form-modal">
        <span>{title}</span>
        <button data-testid="edit-modal-save" onClick={() => onSave(initialValues)}>
          Guardar
        </button>
        <button data-testid="edit-modal-close" onClick={onClose}>Cerrar</button>
      </div>
    ) : null,
}));

vi.mock('../../components/useConfirm', () => ({
  default: () => ({
    confirm: confirmMock,
    ConfirmModal: <div data-testid="confirm-modal" />,
  }),
}));

vi.mock('../admin/components/AdminSection', () => ({
  default: ({ title, description, onCreate, children }) => (
    <div data-testid={`admin-section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <span data-testid="section-title">{title}</span>
      <span data-testid="section-desc">{description}</span>
      {onCreate && (
        <button data-testid="crear-button" onClick={onCreate}>
          Crear
        </button>
      )}
      {children}
    </div>
  ),
}));

vi.mock('../admin/components/AdminTable', () => ({
  default: ({ columns, data }) => (
    <div data-testid="admin-table">
      <span data-testid="table-columns">{columns.length}</span>
      <span data-testid="table-rows">{data.length}</span>
    </div>
  ),
}));

vi.mock('../admin/components/CreateDialogs/CreateVendedorDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-vendedor-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateAdminDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-admin-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateProductoDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-producto-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateProveedorDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-proveedor-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateAuditoriaDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-auditoria-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateClienteCarteraDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-cliente-cartera-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateClienteTiendaDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-cliente-tienda-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateClienteFidelizacionDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-cliente-fidelizacion-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateVentaDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-venta-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreatePedidoProveedorDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-pedido-proveedor-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateFacturaCompraDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-factura-compra-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateGastoDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-gasto-dialog" /> : null }));
vi.mock('../admin/components/CreateDialogs/CreateAbonoCarteraDialog', () => ({ default: ({ isOpen }) => isOpen ? <div data-testid="create-abono-cartera-dialog" /> : null }));

vi.mock('../../utils/format', () => ({
  formatMoney: (v) => `$${v}`,
  formatDateTime: (v) => v || '—',
}));

import Admin from '../Admin';

const mockData = {
  proveedores: [{ id: 1, nombre: 'Proveedor A', contacto: 'Carlos', telefono: '123' }],
  productos: [{ id: 1, nombre: 'Arroz', precio_costo: 1000, precio_venta: 2000, stock_actual: 50, stock_minimo: 10 }],
  vendedores: [{ id: 1, username: 'vendedor1', rol: 'Vendedor' }],
  admins: [{ id: 1, username: 'admin1', rol: 'Admin' }],
  clientes: [{ id: 1, nombre: 'Cliente A', documento: '123', telefono_whatsapp: '300', limite_credito: 500000, deuda_total: 10000 }],
  clientesTienda: [{ id: 1, nombre: 'Cliente T', telefono_whatsapp: '301' }],
  clientesFidelizacion: [{ id: 1, nombre: 'Cliente F', telefono_whatsapp: '302', puntos_acumulados: 100 }],
  ventas: [{ venta_id: 1, total: 5000, saldo_pendiente: 0, fecha: '2025-01-01', es_fiado: false, metodo_pago: 'Efectivo' }],
  pedidos: [{ id: 1, descripcion: 'Pedido 1', monto_estimado: 10000, estado: 'pendiente', creado_por: 'admin', fecha_creacion: '2025-01-01' }],
  facturas: [{ id: 1, subtotal: 5000, total_iva: 950, total_factura: 5950, fecha_creacion: '2025-01-01', items: [{ id: 1 }] }],
  gastos: [{ id: 1, categoria: 'Servicios', descripcion: 'Luz', monto: 200000, fecha: '2025-01-01', registrado_por: 'admin' }],
  abonos: [{ id: 1, cliente_id: 1, monto: 5000, metodo_pago: 'Efectivo', saldo_cliente: 0, fecha: '2025-01-01' }],
  auditorias: [{ id: 1, modulo: 'Productos', entidad: 'Producto', accion: 'Crear', detalle: 'Se creo producto', usuario: 'admin', fecha: '2025-01-01' }],
  informes: {
    ventas_totales: 100,
    facturacion_total: 500000,
    vendedor_mas_vendedor: { vendedor: 'Juan', ventas: 50, total_vendido: 250000 },
    vendedores_top: [{ vendedor: 'Juan', ventas: 50, total_vendido: 250000 }],
    producto_mas_vendido: { producto: 'Arroz', unidades_vendidas: 100, total_vendido: 200000 },
    producto_menos_vendido: null,
    productos_mas_vendidos: [{ producto_id: 1, producto: 'Arroz', unidades_vendidas: 100, total_vendido: 200000 }],
    productos_menos_vendidos: [],
  },
};

const setupApiMock = () => {
  apiRequestMock.mockImplementation((endpoint) => {
    if (endpoint.startsWith('/api/productos/paginados')) return Promise.resolve({ data: mockData.productos });
    if (endpoint.startsWith('/api/proveedores/paginados')) return Promise.resolve({ data: mockData.proveedores });
    if (endpoint.startsWith('/api/ventas/paginadas')) return Promise.resolve({ data: mockData.ventas });
    if (endpoint.startsWith('/api/proveedores/pedidos/paginados')) return Promise.resolve({ data: mockData.pedidos });
    if (endpoint.startsWith('/api/facturas-compra/paginadas')) return Promise.resolve({ data: mockData.facturas });
    if (endpoint.startsWith('/api/gastos/paginados')) return Promise.resolve({ data: mockData.gastos });
    if (endpoint.startsWith('/api/clientes/tienda-fiado')) return Promise.resolve(mockData.clientesTienda);
    if (endpoint.startsWith('/api/fidelizacion/clientes')) return Promise.resolve(mockData.clientesFidelizacion);
    if (endpoint.startsWith('/api/superadmin/auditorias')) return Promise.resolve(mockData.auditorias);
    if (endpoint === '/api/superadmin/usuarios/vendedores') return Promise.resolve(mockData.vendedores);
    if (endpoint === '/api/superadmin/usuarios/admins') return Promise.resolve(mockData.admins);
    if (endpoint === '/api/clientes') return Promise.resolve(mockData.clientes);
    if (endpoint === '/api/cartera/abonos') return Promise.resolve(mockData.abonos);
    if (endpoint === '/api/superadmin/informes') return Promise.resolve(mockData.informes);
    return Promise.resolve([]);
  });
};

describe('Admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useParamsMock.mockReturnValue({});
    confirmMock.mockResolvedValue(true);
  });

  it('shows restricted message when not superadmin', () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: false });
    render(<Admin />);
    expect(screen.getByText('Acceso restringido: solo superadmin')).toBeInTheDocument();
  });

  it('sets loading false immediately when not superadmin', () => {
    useAuthMock.mockReturnValue({ token: null, isSuperAdmin: false });
    render(<Admin />);
    expect(screen.getByText('Acceso restringido: solo superadmin')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    apiRequestMock.mockImplementation(() => new Promise(() => {}));
    render(<Admin />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('loads active module data on mount', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/superadmin/productos',
        expect.any(Object),
      );
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/superadmin/informes',
        expect.any(Object),
      );
    });
  });

  it('renders admin panel after loading', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByText('Panel de Administración')).toBeInTheDocument();
    });
  });

  it('renders tab sections for default active tab', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-section-productos')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-table')).toBeInTheDocument();
  });

  it('renders module buttons for role groups', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByText('Proveedores')).toBeInTheDocument();
      expect(screen.getByText('Gastos')).toBeInTheDocument();
      expect(screen.getByText('Pedidos proveedor')).toBeInTheDocument();
    });
  });

  it('toggles role group expansion on header click', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByText('Vendedor')).toBeInTheDocument();
    });

    const allProductos = screen.getAllByText('Productos');
    expect(allProductos.length).toBeGreaterThan(0);

    allProductos.forEach((el) => {
      expect(el).toBeInTheDocument();
    });

    const moduleButtons = screen.getAllByText('Gastos');
    expect(moduleButtons.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Vendedor'));

    await waitFor(() => {
      expect(screen.queryByText('Gastos')).not.toBeInTheDocument();
    });
  });

  it('switches tab when clicking a module', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByText('Proveedores')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Proveedores'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-section-proveedores')).toBeInTheDocument();
    });
  });

  it('opens create dialog on Crear button click', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    const btn = await screen.findByTestId('crear-button');
    fireEvent.click(btn);

    const dialog = await screen.findByTestId('create-producto-dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('shows error when data loading fails', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    apiRequestMock.mockRejectedValue(new Error('Error de conexion'));
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByText('Error de conexion')).toBeInTheDocument();
    });
  });

  it('refreshes data on Recargar click', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByText('Recargar')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Recargar'));

    await waitFor(() => {
      expect(screen.getByText('Datos actualizados')).toBeInTheDocument();
    });
  });

  it('dismisses error message', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    apiRequestMock.mockRejectedValue(new Error('Error de conexion'));
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('dismiss-error'));

    await waitFor(() => {
      expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    });
  });

  it('renders informes tab content', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByText('SuperAdmin')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('SuperAdmin'));

    await waitFor(() => {
      expect(screen.getByText('Informes')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Informes'));

    await waitFor(() => {
      expect(screen.getByText('Ventas registradas')).toBeInTheDocument();
    });
    expect(screen.getByText('Facturacion total')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('$500000')).toBeInTheDocument();
  });

  it('shows summary bar when no moduleKey provided', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin />);

    await waitFor(() => {
      expect(screen.getByText(/Productos /)).toBeInTheDocument();
    });
    expect(screen.getByText(/Facturacion/)).toBeInTheDocument();
  });

  it('hides role groups and summary when moduleKey prop given', async () => {
    useAuthMock.mockReturnValue({ token: 'token', isSuperAdmin: true });
    setupApiMock();
    render(<Admin moduleKey="vendedores" />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-section-vendedores')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Resumen:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Vendedor')).not.toBeInTheDocument();
  });
});
