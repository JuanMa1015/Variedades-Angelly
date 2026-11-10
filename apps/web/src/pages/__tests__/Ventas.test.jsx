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
  default: ({ productos, cart, onAddItem, onScanCode, searchTerm, onSearchChange, loading }) => (
    <div data-testid="product-selection">
      <h2>Product Selection</h2>
      <p>Products: {productos.length}</p>
      <p>Cart: {cart.length}</p>
      <p>Loading: {String(loading)}</p>
      <input data-testid="search" value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} />
      <button data-testid="scan-remoto" onClick={() => onScanCode('770999')}>scan remoto</button>
      <button data-testid="scan-inexistente" onClick={() => onScanCode('9990001')}>scan inexistente</button>
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
    clientesFidelizacion = [], onSetClienteFidelizacionId = () => {},
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
      <button data-testid="elegir-fidelizacion" onClick={() => onSetClienteFidelizacionId(String(clientesFidelizacion[0]?.id ?? ''))}>
        fidelizacion
      </button>
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
    if (endpoint === '/api/fidelizacion/clientes') return Promise.resolve([{ id: 77, nombre: 'Fiel', puntos_acumulados: 10 }]);
    if (endpoint === '/api/fidelizacion/config') return Promise.resolve({ umbral_bono: 100, pesos_por_punto: 1000 });
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
      expect(screen.getByTestId('add-product-1')).toBeInTheDocument();
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
      expect(screen.getByTestId('add-product-1')).toBeInTheDocument();
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
      expect(screen.getByTestId('add-product-1')).toBeInTheDocument();
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
        monto_recibido: 10000,
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
      expect(screen.getByTestId('add-product-1')).toBeInTheDocument();
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
      expect(screen.getByTestId('add-product-1')).toBeInTheDocument();
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
      expect(screen.getByTestId('add-product-1')).toBeInTheDocument();
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
      expect(screen.getByTestId('add-product-1')).toBeInTheDocument();
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

  it('busca en el servidor un codigo de barras que no esta en el catalogo cargado', async () => {
    const remoto = { id: 99, nombre: 'Producto 201', precio_venta: 1000, stock_actual: 5, codigo_barras: '770999' };
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.includes('q=770999')) return Promise.resolve({ data: [remoto] });
      if (endpoint.startsWith('/api/productos/paginados?catalogo=tienda')) return Promise.resolve({ data: validProducts });
      return Promise.resolve([]);
    });
    render(<Ventas />);
    await waitFor(() => expect(screen.getByTestId('add-product-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('scan-remoto'));

    await waitFor(() => expect(screen.getByText('Cart: 1')).toBeInTheDocument());
    expect(screen.getByText('Products: 3')).toBeInTheDocument();
  });

  it('avisa cuando el codigo escaneado no existe', async () => {
    render(<Ventas />);
    await waitFor(() => expect(screen.getByTestId('add-product-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('scan-inexistente'));

    await waitFor(() => expect(screen.getByText(/No existe un producto con el código 9990001/)).toBeInTheDocument());
    expect(screen.getByText('Cart: 0')).toBeInTheDocument();
  });

  it('consulta al servidor al buscar por nombre para no depender de los primeros 200 productos', async () => {
    render(<Ventas />);
    await waitFor(() => expect(screen.getByTestId('add-product-1')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('search'), { target: { value: 'arroz' } });

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith(
        '/api/productos/paginados?catalogo=tienda&limit=50&q=arroz',
        expect.any(Object),
      );
    });
  });

  it('envia el cliente de fidelizacion elegido al registrar la venta', async () => {
    apiPostMock.mockResolvedValue({ puntos_otorgados: 3 });
    render(<Ventas />);
    await waitFor(() => expect(screen.getByTestId('add-product-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.change(screen.getByTestId('monto-pago'), { target: { value: '10000' } });
    fireEvent.click(screen.getByTestId('elegir-fidelizacion'));
    fireEvent.click(screen.getByTestId('confirmar-venta'));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/ventas',
        expect.objectContaining({ cliente_fidelizacion_id: 77 }),
      );
    });
  });

  it('no reporta error de venta si la recarga posterior falla (la venta ya quedo registrada)', async () => {
    apiPostMock.mockResolvedValue({});
    render(<Ventas />);
    await waitFor(() => expect(screen.getByTestId('add-product-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-product-1'));
    fireEvent.change(screen.getByTestId('monto-pago'), { target: { value: '10000' } });
    apiGetMock.mockRejectedValue(new Error('sin red'));

    fireEvent.click(screen.getByTestId('confirmar-venta'));

    await waitFor(() => expect(screen.getByTestId('sale-receipt')).toBeInTheDocument());
    expect(screen.queryByText(/No fue posible registrar la venta/)).not.toBeInTheDocument();
  });
});
