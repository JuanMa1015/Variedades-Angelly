import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const apiPatchMock = vi.hoisted(() => vi.fn());
const apiDeleteMock = vi.hoisted(() => vi.fn());
const apiUploadMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('../../auth/AuthContext', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../../api/httpClient', () => ({
  apiDelete: apiDeleteMock,
  apiGet: apiGetMock,
  apiPatch: apiPatchMock,
  apiPost: apiPostMock,
  apiUpload: apiUploadMock,
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
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

vi.mock('../../components/useConfirm', () => ({
  default: () => ({
    confirm: confirmMock,
    ConfirmModal: <div data-testid="confirm-modal" />,
  }),
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, title, children, onClose }) =>
    isOpen ? (
      <div data-testid="modal">
        <span data-testid="modal-title">{title}</span>
        {children}
        <button data-testid="modal-close" onClick={onClose}>Cerrar</button>
      </div>
    ) : null,
}));

const mockProductos = [
  { id: 1, nombre: 'Arroz Diana', codigo_barras: '7701234567890', precio_costo: 2000, precio_venta: 2800, stock_actual: 50, stock_minimo: 10, catalogo: 'tienda', activo: true, imagen_url: null, proveedor_id: null },
  { id: 2, nombre: 'Aceite Gourmet', codigo_barras: null, precio_costo: 8000, precio_venta: 11000, stock_actual: 3, stock_minimo: 5, catalogo: 'tienda', activo: true, imagen_url: '/uploads/aceite.jpg', proveedor_id: 1 },
];

const mockProveedores = [
  { id: 1, nombre: 'Distribuidora XYZ', activo: true },
];

describe('Inventario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ token: 'test-token', user: { username: 'admin', role: 'admin' } });
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.includes('productos/paginados')) {
        return Promise.resolve({ data: mockProductos, total: 2 });
      }
      if (endpoint.includes('proveedores')) {
        return Promise.resolve(mockProveedores);
      }
      return Promise.resolve([]);
    });
    apiPostMock.mockResolvedValue({ id: 3 });
    apiPatchMock.mockResolvedValue({});
    apiDeleteMock.mockResolvedValue(undefined);
  });

  it('renderiza y carga productos al montarse', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    expect(screen.getByText('Inventario')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
      expect(screen.getAllByText('Aceite Gourmet').length).toBeGreaterThan(0);
    });
  });

  it('abre modal de creacion al hacer clic en Agregar producto', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Agregar producto'));
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Agregar producto al inventario');
  });

  it('abre modal de edicion al hacer clic en editar', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
    });

    const editButtons = screen.getAllByTitle('Editar producto');
    fireEvent.click(editButtons[0]);

    expect(screen.getByTestId('modal-title')).toHaveTextContent('Editar producto');
  });

  it('confirma desactivacion al hacer clic en desactivar', async () => {
    confirmMock.mockResolvedValue(true);

    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
    });

    const deleteButtons = screen.getAllByTitle('Desactivar producto');
    fireEvent.click(deleteButtons[0]);

    expect(confirmMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(apiDeleteMock).toHaveBeenCalled();
    });
  });

  it('oculta el boton de desactivar para el vendedor (el backend lo prohibe)', async () => {
    useAuthMock.mockReturnValue({ token: 'test-token', user: { username: 'vendedor1', role: 'vendedor' } });

    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
    });
    expect(screen.queryAllByTitle('Desactivar producto')).toHaveLength(0);
  });

  it('muestra skeletons mientras carga', async () => {
    apiGetMock.mockImplementation(() => new Promise(() => {}));
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  const crearProductoConImagen = async (direccion) => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);
    await waitFor(() => expect(screen.getByText('Arroz Diana')).toBeTruthy());

    fireEvent.click(screen.getByText('Agregar producto'));
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Producto Nuevo' } });
    fireEvent.change(screen.getByPlaceholderText('Precio costo (ej: 3500)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByPlaceholderText('Precio venta (ej: 5000)'), { target: { value: '1500' } });
    fireEvent.click(screen.getAllByText('Pegar URL')[0]);
    fireEvent.change(screen.getByPlaceholderText('Pega la dirección de la imagen: se guarda una copia'), { target: { value: direccion } });
    fireEvent.click(screen.getAllByRole('button', { name: /Agregar producto/ }).pop());
  };

  it('una imagen pegada por URL se importa al almacenamiento propio antes de guardar el producto', async () => {
    apiPostMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/upload-imagen-url') {
        return Promise.resolve({ url: 'https://abc.public.blob.vercel-storage.com/productos/copia.jpg' });
      }
      return Promise.resolve({ id: 3 });
    });

    await crearProductoConImagen('https://sitio-externo.com/foto.jpg');

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/upload-imagen-url', { url: 'https://sitio-externo.com/foto.jpg' });
      expect(apiPostMock).toHaveBeenCalledWith('/api/productos', expect.objectContaining({
        nombre: 'Producto Nuevo',
        imagen_url: 'https://abc.public.blob.vercel-storage.com/productos/copia.jpg',
      }));
    });
  });

  it('si ya es del almacenamiento propio no se vuelve a importar', async () => {
    const propia = 'https://abc.public.blob.vercel-storage.com/productos/ya-estaba.jpg';

    await crearProductoConImagen(propia);

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/productos', expect.objectContaining({ imagen_url: propia }));
    });
    expect(apiPostMock).not.toHaveBeenCalledWith('/api/upload-imagen-url', expect.anything());
  });

  it('si el servidor rechaza la direccion no crea el producto y explica el motivo', async () => {
    apiPostMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/upload-imagen-url') {
        return Promise.reject(new Error('Esa direccion no esta permitida. Descarga la imagen y subela desde tu computador.'));
      }
      return Promise.resolve({ id: 3 });
    });

    await crearProductoConImagen('http://127.0.0.1/a.png');

    expect(await screen.findByText(/no esta permitida/)).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalledWith('/api/productos', expect.anything());
  });
});
