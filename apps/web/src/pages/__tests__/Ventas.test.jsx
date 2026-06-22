import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/httpClient', () => ({
  apiGet: apiGetMock,
  apiPost: apiPostMock,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../Ventas/ProductSelectionView', () => ({
  default: ({ productos, cart, onAddItem, loading }) => (
    <div data-testid="product-selection">
      <h2>Product Selection</h2>
      <p>Products: {productos.length}</p>
      <p>Cart: {cart.length}</p>
      <p>Loading: {String(loading)}</p>
      {productos.map((p) => (
        <button
          key={p.id}
          data-testid={`add-product-${p.id}`}
          onClick={() => onAddItem(p.id)}
        >
          Add {p.nombre}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../Ventas/CartPanel', () => ({
  default: ({
    cart, totalEstimado, esFiado, onSetEsFiado, montoPago, onSetMontoPago,
    clientesTiendaFiado, clienteTiendaId, onSetClienteTiendaId,
    onCrearCliente, onConfirmar, formatMoney, submittingVenta,
  }) => (
    <div data-testid="cart-panel">
      <h2>CartPanel</h2>
      <p>Cart items: {cart.length}</p>
      <p>Total: {typeof formatMoney === 'function' ? formatMoney(totalEstimado) : totalEstimado}</p>
      <p>Fiado: {String(esFiado)}</p>
      <button data-testid="set-contado" onClick={() => onSetEsFiado(false)}>
        Contado
      </button>
      <button data-testid="set-fiado" onClick={() => onSetEsFiado(true)}>
        Fiado
      </button>
      <input
        data-testid="monto-pago"
        value={montoPago}
        onChange={(e) => onSetMontoPago(Number(e.target.value))}
      />
      <select
        data-testid="cliente-select"
        value={clienteTiendaId}
        onChange={(e) => onSetClienteTiendaId(e.target.value)}
      >
        <option value="">Selecciona cliente</option>
        {clientesTiendaFiado.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
      <button data-testid="create-cliente" onClick={onCrearCliente}>
        + Crear cliente de ventas
      </button>
      <button
        data-testid="confirmar-venta"
        onClick={onConfirmar}
        disabled={submittingVenta}
      >
        {submittingVenta ? 'Confirmando venta...' : 'Confirmar venta'}
      </button>
    </div>
  ),
}));

vi.mock('../Ventas/SaleReceiptPanel', () => ({
  default: ({ receipt, onPrint, onNewSale }) => (
    <div data-testid="sale-receipt">
      <h2>Sale Receipt</h2>
      <p>Total: {receipt.total}</p>
      <p>Items: {receipt.items.length}</p>
      <p>Metodo: {receipt.metodoPago}</p>
      <button data-testid="print-receipt" onClick={onPrint}>Imprimir recibo</button>
      <button data-testid="new-sale" onClick={onNewSale}>Nueva venta</button>
    </div>
  ),
}));

import Ventas from '../Ventas';

const validProducts = [
  { id: 1, nombre: 'Arroz Diana 500g', precio_venta: 3500, stock_actual: 40, codigo_barras: '770101' },
  { id: 2, nombre: 'Aceite Vegetal 1L', precio_venta: 5500, stock_actual: 25, codigo_barras: '770102' },
];

const validClientes = [
  { id: 10, nombre: 'Marta Diaz', telefono_whatsapp: '573001234567' },
  { id: 11, nombre: 'Luis Perez', telefono_whatsapp: '573001234568' },
];

const mockApiGet = () => {
  apiGetMock.mockImplementation((endpoint) => {
    if (endpoint.startsWith('/api/productos/paginados?catalogo=tienda')) return Promise.resolve({ data: validProducts });
    if (endpoint === '/api/clientes/tienda-fiado') return Promise.resolve(validClientes);
    return Promise.resolve([]);
  });
};

describe('Ventas page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ token: 'fake-token' });
    mockApiGet();
  });

  it('loads products and clientes on mount', async () => {
    render(<Ventas />);

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith(
        '/api/productos/paginados?catalogo=tienda&limit=200',
        expect.any(Object),
      );
      expect(apiGetMock).toHaveBeenCalledWith(
        '/api/clientes/tienda-fiado',
        expect.any(Object),
      );
    });
  });

  it('renders product selection and cart panel', async () => {
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });
    expect(screen.getByText('Products: 2')).toBeInTheDocument();
    expect(screen.getByText('Cart: 0')).toBeInTheDocument();
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
  });

  it('shows loading state while fetching data', () => {
    apiGetMock.mockImplementation(() => new Promise(() => {}));
    render(<Ventas />);
    expect(screen.getByText('Loading: true')).toBeInTheDocument();
  });

  it('shows error message when data fetch fails', async () => {
    apiGetMock.mockRejectedValue(new Error('Error de conexión'));
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByText('Error de conexión')).toBeInTheDocument();
    });
  });

  it('adds a product to cart on click', async () => {
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    await waitFor(() => {
      expect(screen.getByText('Cart: 1')).toBeInTheDocument();
    });
    expect(screen.getByText('Cart items: 1')).toBeInTheDocument();
  });

  it('submits a contado sale successfully', async () => {
    apiPostMock.mockResolvedValue({ resumen_recibo: 'Venta registrada' });
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));

    const pagoInput = screen.getByTestId('monto-pago');
    fireEvent.change(pagoInput, { target: { value: '10000' } });

    fireEvent.click(screen.getByTestId('confirmar-venta'));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', {
        items: [{ producto_id: 1, cantidad: 1 }],
        es_fiado: false,
        metodo_pago: 'efectivo',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('sale-receipt')).toBeInTheDocument();
    });
  });

  it('submits a fiado sale successfully', async () => {
    apiPostMock.mockResolvedValue({});
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));

    fireEvent.click(screen.getByTestId('set-fiado'));

    await waitFor(() => {
      expect(screen.getByText('Fiado: true')).toBeInTheDocument();
    });

    const clienteSelect = screen.getByTestId('cliente-select');
    fireEvent.change(clienteSelect, { target: { value: '10' } });

    fireEvent.click(screen.getByTestId('confirmar-venta'));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/ventas', {
        items: [{ producto_id: 1, cantidad: 1 }],
        es_fiado: true,
        metodo_pago: 'efectivo',
        fiado_origen: 'tienda',
        cliente_tienda_id: 10,
        abono_inicial: 0,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('sale-receipt')).toBeInTheDocument();
    });
  });

  it('creates a new store client', async () => {
    const newClient = { id: 20, nombre: 'Nuevo Cliente' };
    apiPostMock.mockResolvedValue(newClient);
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('set-fiado'));
    fireEvent.click(screen.getByTestId('create-cliente'));

    await waitFor(() => {
      expect(screen.getByText('Nuevo cliente fiado tienda')).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText('Nombre del cliente');
    fireEvent.change(nameInput, { target: { value: 'Nuevo Cliente' } });

    const phoneInput = screen.getByPlaceholderText('WhatsApp (opcional)');
    fireEvent.change(phoneInput, { target: { value: '3001234567' } });

    fireEvent.click(screen.getByText('Guardar cliente'));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/clientes/tienda-fiado', {
        nombre: 'Nuevo Cliente',
        telefono_whatsapp: '573001234567',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Cliente fiado tienda creado correctamente')).toBeInTheDocument();
    });
  });

  it('does not load data when token is null', () => {
    useAuthMock.mockReturnValue({ token: null });
    render(<Ventas />);
    expect(apiGetMock).not.toHaveBeenCalled();
    expect(screen.getByText('Products: 0')).toBeInTheDocument();
    expect(screen.getByText('Loading: false')).toBeInTheDocument();
  });

  it('shows error on failed sale submission', async () => {
    apiPostMock.mockRejectedValue(new Error('Stock insuficiente'));
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));

    const pagoInput = screen.getByTestId('monto-pago');
    fireEvent.change(pagoInput, { target: { value: '10000' } });
    fireEvent.click(screen.getByTestId('confirmar-venta'));

    await waitFor(() => {
      expect(screen.getByText('Stock insuficiente')).toBeInTheDocument();
    });
  });

  it('shows sale receipt after successful sale and can start new sale', async () => {
    apiPostMock.mockResolvedValue({});
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));

    const pagoInput = screen.getByTestId('monto-pago');
    fireEvent.change(pagoInput, { target: { value: '10000' } });

    fireEvent.click(screen.getByTestId('confirmar-venta'));

    await waitFor(() => {
      expect(screen.getByTestId('sale-receipt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('new-sale'));

    await waitFor(() => {
      expect(screen.getByText('Cart: 0')).toBeInTheDocument();
    });
  });
});
