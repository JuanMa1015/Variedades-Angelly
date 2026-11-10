import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductSelectionView from '../ProductSelectionView';
import { useAvailableHeight } from '../useAvailableHeight';

const Caja = () => {
  const ref = useRef(null);
  useAvailableHeight(ref, { bottomGap: 20, minHeight: 400 });
  return <div ref={ref} data-testid="raiz" />;
};

const simular = ({ ancho, alto, top }) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: ancho >= 1024 });
  Object.defineProperty(window, 'innerHeight', { value: alto, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top });
};

describe('useAvailableHeight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = undefined;
  });

  it('en escritorio ocupa el alto que queda bajo el encabezado', () => {
    simular({ ancho: 1440, alto: 900, top: 120 });
    render(<Caja />);

    expect(screen.getByTestId('raiz').style.height).toBe('760px'); // 900 - 120 - 20
  });

  it('nunca baja del alto minimo', () => {
    simular({ ancho: 1440, alto: 500, top: 300 });
    render(<Caja />);

    expect(screen.getByTestId('raiz').style.height).toBe('400px');
  });

  it('en pantallas pequenas no fija el alto', () => {
    simular({ ancho: 390, alto: 800, top: 100 });
    render(<Caja />);

    expect(screen.getByTestId('raiz').style.height).toBe('');
  });
});

describe('resumen del catalogo', () => {
  const base = {
    productos: [{ id: 1, nombre: 'A', stock_actual: 1, precio_venta: 1 }],
    searchTerm: '',
    onSearchChange: vi.fn(),
    onAddItem: vi.fn(),
    cart: [],
    formatMoney: (value) => `$${value}`,
    loading: true,
  };

  it('avisa cuando solo se muestran algunos de los productos', () => {
    render(<ProductSelectionView {...base} totalCatalogo={1245} />);

    expect(screen.getByText(/Mostrando 1 de 1\.245 productos/)).toBeInTheDocument();
  });

  it('sin recorte muestra el conteo simple', () => {
    render(<ProductSelectionView {...base} totalCatalogo={1} />);

    expect(screen.getByText(/1 productos · toca una tarjeta/)).toBeInTheDocument();
  });
});
