import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());
const formatMoneyMock = vi.hoisted(() => vi.fn((val) => `$${Number(val || 0).toLocaleString('es-CO')}`));

vi.mock('../../api/httpClient', () => ({
  apiGet: apiGetMock,
  apiPost: apiPostMock,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../Ventas/ProductSelectionView', () => ({
  default: ({ productos, cart, onAddItem, onGoToTicket, formatMoney, loading }) => (
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
      <button data-testid="go-to-ticket" onClick={onGoToTicket} disabled={cart.length === 0}>
        Ver ticket
      </button>
    </div>
  ),
}));

vi.mock('../Ventas/TicketReviewView', () => ({
  default: ({ cart, totalEstimado, onGoToProducts, onGoToCheckout, formatMoney }) => (
    <div data-testid="ticket-review">
      <h2>Ticket Review</h2>
      <p>Cart items: {cart.length}</p>
      <p>Total: {typeof formatMoney === 'function' ? formatMoney(totalEstimado) : totalEstimado}</p>
      <button data-testid="go-to-products" onClick={onGoToProducts}>
        + Productos
      </button>
      <button data-testid="go-to-checkout" onClick={onGoToCheckout} disabled={cart.length === 0}>
        Cobrar →
      </button>
    </div>
  ),
}));

vi.mock('../Ventas/CheckoutView', () => ({
  default: ({
    totalEstimado, esFiado, onSetEsFiado, montoPago, onSetMontoPago,
    metodoPago, onSetMetodoPago, clientesTiendaFiado, clienteTiendaId,
    onSetClienteTiendaId, onCrearCliente, onConfirmar, onGoToTicket,
    formatMoney, submittingVenta, cartCount,
  }) => (
    <div data-testid="checkout-view">
      <h2>Checkout</h2>
      <p>Total: {typeof formatMoney === 'function' ? formatMoney(totalEstimado) : totalEstimado}</p>
      <p>Fiado: {String(esFiado)}</p>
      <p>Cart count: {cartCount}</p>
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
      <button data-testid="metodo-pago" onClick={() => onSetMetodoPago('nequi')}>
        Nequi
      </button>
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
      <button data-testid="go-to-ticket-from-checkout" onClick={onGoToTicket}>
        ← Volver al ticket
      </button>
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
    if (endpoint === '/api/productos?catalogo=tienda') return Promise.resolve(validProducts);
    if (endpoint === '/api/clientes/tienda-fiado') return Promise.resolve(validClientes);
    return Promise.resolve([]);
  });
};

const renderVentas = () => {
  useAuthMock.mockReturnValue({ token: 'fake-token' });
  mockApiGet();
  return render(<Ventas />);
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
        '/api/productos?catalogo=tienda',
        expect.any(Object),
      );
      expect(apiGetMock).toHaveBeenCalledWith(
        '/api/clientes/tienda-fiado',
        expect.any(Object),
      );
    });
  });

  it('renders product selection view initially', async () => {
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });
    expect(screen.getByText('Products: 2')).toBeInTheDocument();
    expect(screen.getByText('Cart: 0')).toBeInTheDocument();
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

  it('navigates from products to ticket view', async () => {
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    await waitFor(() => {
      expect(screen.getByText('Cart: 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('go-to-ticket'));
    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });
  });

  it('navigates from ticket to checkout', async () => {
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.click(screen.getByTestId('go-to-ticket'));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('go-to-checkout'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-view')).toBeInTheDocument();
    });
  });

  it('navigates back from ticket to products', async () => {
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.click(screen.getByTestId('go-to-ticket'));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('go-to-products'));
    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });
  });

  it('navigates back from checkout to ticket', async () => {
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.click(screen.getByTestId('go-to-ticket'));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('go-to-checkout'));

    await waitFor(() => {
      expect(screen.getByTestId('checkout-view')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('go-to-ticket-from-checkout'));
    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });
  });

  it('submits a contado sale successfully', async () => {
    apiPostMock.mockResolvedValue({ resumen_recibo: 'Venta registrada' });
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.click(screen.getByTestId('go-to-ticket'));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('go-to-checkout'));

    await waitFor(() => {
      expect(screen.getByTestId('checkout-view')).toBeInTheDocument();
    });

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
      expect(screen.getByText((text) => text.includes('Venta registrada'))).toBeInTheDocument();
    });
  });

  it('submits a fiado sale successfully', async () => {
    apiPostMock.mockResolvedValue({ resumen_recibo: 'Venta fiada registrada' });
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.click(screen.getByTestId('go-to-ticket'));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('go-to-checkout'));

    await waitFor(() => {
      expect(screen.getByTestId('checkout-view')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('set-fiado'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const clienteSelect = screen.getByTestId('cliente-select');
    fireEvent.change(clienteSelect, { target: { value: '10' } });
    await new Promise((resolve) => setTimeout(resolve, 0));

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
      expect(screen.getByText((text) => text.includes('Venta fiada registrada'))).toBeInTheDocument();
    });
  });

  it('creates a new store client from checkout', async () => {
    const newClient = { id: 20, nombre: 'Nuevo Cliente' };
    apiPostMock.mockResolvedValue(newClient);
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.click(screen.getByTestId('go-to-ticket'));
    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('go-to-checkout'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-view')).toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId('go-to-ticket'));
    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('go-to-checkout'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-view')).toBeInTheDocument();
    });

    const pagoInput = screen.getByTestId('monto-pago');
    fireEvent.change(pagoInput, { target: { value: '10000' } });
    fireEvent.click(screen.getByTestId('confirmar-venta'));

    await waitFor(() => {
      expect(screen.getByText('Stock insuficiente')).toBeInTheDocument();
    });
  });

  it('resets to products view after successful sale', async () => {
    apiPostMock.mockResolvedValue({ resumen_recibo: 'Venta OK' });
    render(<Ventas />);

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.click(screen.getByTestId('go-to-ticket'));
    await waitFor(() => {
      expect(screen.getByTestId('ticket-review')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('go-to-checkout'));
    await waitFor(() => {
      expect(screen.getByTestId('checkout-view')).toBeInTheDocument();
    });

    const pagoInput = screen.getByTestId('monto-pago');
    fireEvent.change(pagoInput, { target: { value: '10000' } });
    fireEvent.click(screen.getByTestId('confirmar-venta'));

    await waitFor(() => {
      expect(screen.getByTestId('product-selection')).toBeInTheDocument();
    });

    expect(screen.getByText('Cart: 0')).toBeInTheDocument();
  });
});
