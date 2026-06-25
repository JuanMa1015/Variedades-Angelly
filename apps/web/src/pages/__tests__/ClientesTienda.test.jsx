import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const apiPatchMock = vi.hoisted(() => vi.fn());
const apiDeleteMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('../../auth/AuthContext', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../../api/httpClient', () => ({
  apiDelete: apiDeleteMock,
  apiGet: apiGetMock,
  apiPatch: apiPatchMock,
  apiPost: apiPostMock,
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

vi.mock('../../components/PaginationControls', () => ({
  default: ({ currentPage, totalPages, onPageChange }) =>
    totalPages > 1 ? (
      <div data-testid="pagination">
        <button data-testid="page-prev" onClick={() => onPageChange(currentPage - 1)}>Prev</button>
        <span data-testid="page-info">{currentPage} / {totalPages}</span>
        <button data-testid="page-next" onClick={() => onPageChange(currentPage + 1)}>Next</button>
      </div>
    ) : null,
}));

const mockResumen = {
  clientes_totales: 3,
  clientes_con_deuda: 1,
  deuda_total: 550000,
  clientes_alto_riesgo: 1,
  clientes_riesgo_medio: 0,
  saldo_promedio: 550000,
};

const mockClientes = [
  { id: 1, nombre: 'Juan Perez', telefono_whatsapp: '573001234567', deuda_total: 150000, activo: true },
  { id: 2, nombre: 'Maria Gomez', telefono_whatsapp: '573001234568', deuda_total: 0, activo: true },
  { id: 3, nombre: 'Carlos Lopez', telefono_whatsapp: null, deuda_total: 400000, activo: true },
];

describe('ClientesTienda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ token: 'test-token' });

    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.includes('resumen')) {
        return Promise.resolve(mockResumen);
      }
      if (endpoint.includes('cobro')) {
        return Promise.resolve({ data: mockClientes, total: 3 });
      }
      if (endpoint.includes('tienda-fiado')) {
        return Promise.resolve(mockClientes);
      }
      return Promise.resolve([]);
    });
    apiPostMock.mockResolvedValue({});
    apiPatchMock.mockResolvedValue({});
    apiDeleteMock.mockResolvedValue(undefined);
  });

  it('renderiza dashboard con resumen al montarse', async () => {
    const ClientesTienda = (await import('../ClientesTienda')).default;
    render(<ClientesTienda />);

    expect(screen.getByText('Clientes de Tienda')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Clientes totales')).toBeTruthy();
    });
  });

  it('cambia a pestana Cobrar y muestra clientes', async () => {
    const ClientesTienda = (await import('../ClientesTienda')).default;
    render(<ClientesTienda />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Cobrar'));

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeTruthy();
      expect(screen.getByText('Maria Gomez')).toBeTruthy();
    });
  });

  it('cambia a pestana Clientes y muestra lista de clientes', async () => {
    const ClientesTienda = (await import('../ClientesTienda')).default;
    render(<ClientesTienda />);

    await waitFor(() => {
      expect(screen.getByText('Clientes totales')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Clientes'));

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeTruthy();
      expect(screen.getByText('Maria Gomez')).toBeTruthy();
    });
  });

  it('abre modal de crear cliente', async () => {
    const ClientesTienda = (await import('../ClientesTienda')).default;
    render(<ClientesTienda />);

    await waitFor(() => {
      expect(screen.getByText('Clientes totales')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Nuevo Cliente'));
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Nuevo Cliente');
  });
});
