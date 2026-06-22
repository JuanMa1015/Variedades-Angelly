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
    useAuthMock.mockReturnValue({ token: 'test-token' });
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

  it('muestra skeletons mientras carga', async () => {
    apiGetMock.mockImplementation(() => new Promise(() => {}));
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });
});
