import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CartPanel from '../CartPanel';
import HeldTicketsBar from '../HeldTicketsBar';
import MobileCartBar from '../MobileCartBar';
import ProductCard from '../ProductCard';
import ProductImage from '../ProductImage';
import { getInitials, getProductVisual, resolveImageUrl } from '../productVisuals';

const formatMoney = (value) => `$${Number(value || 0)}`;
const producto = { id: 1, nombre: 'Agua Pool 300ml', precio_venta: 800, stock_actual: 10, imagen_url: '/uploads/perdida.png' };

describe('productVisuals', () => {
  it('iniciales y reglas por nombre', () => {
    expect(getInitials('Abbott Sevedol Extra')).toBe('AS');
    expect(getInitials('  ')).toBe('?');
    expect(getProductVisual('Leche Alqueria 1L').icon).toBe('🥛');
    expect(getProductVisual('Tornillo')).toBeNull();
  });

  it('arma la URL de la imagen (relativa o absoluta)', () => {
    expect(resolveImageUrl(null)).toBeNull();
    expect(resolveImageUrl('https://cdn.test/a.png')).toBe('https://cdn.test/a.png');
    expect(resolveImageUrl('/uploads/a.png')).toMatch(/\/uploads\/a\.png$/);
  });
});

describe('ProductImage', () => {
  it('si la foto no carga muestra el icono en vez de una imagen rota', () => {
    const { container } = render(<div className="relative"><ProductImage producto={producto} /></div>);

    fireEvent.error(container.querySelector('img'));

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('🥤')).toBeInTheDocument();
  });

  it('sin foto ni icono por nombre usa las iniciales', () => {
    render(<div className="relative"><ProductImage producto={{ id: 2, nombre: 'Tornillo Grande' }} /></div>);

    expect(screen.getByText('TG')).toBeInTheDocument();
  });
});

describe('ProductCard', () => {
  const baseProps = { producto, qtyInCart: 0, onAdd: vi.fn(), formatMoney, isFavorite: false, onToggleFavorite: vi.fn() };

  it('agrega al tocar la tarjeta y marca favorito sin agregar', () => {
    const onAdd = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<ProductCard {...baseProps} onAdd={onAdd} onToggleFavorite={onToggleFavorite} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Agua Pool 300ml' }));
    fireEvent.click(screen.getByRole('button', { name: /Marcar Agua Pool 300ml como favorito/ }));

    expect(onAdd).toHaveBeenCalledWith(1);
    expect(onToggleFavorite).toHaveBeenCalledWith(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('agotado: deshabilitado y con etiqueta', () => {
    render(<ProductCard {...baseProps} producto={{ ...producto, stock_actual: 0 }} />);

    expect(screen.getByRole('button', { name: 'Agregar Agua Pool 300ml' })).toBeDisabled();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
  });

  it('stock bajo: avisa cuantas quedan y no agrega mas de las que hay', () => {
    const onAdd = vi.fn();
    render(<ProductCard {...baseProps} producto={{ ...producto, stock_actual: 3 }} qtyInCart={3} onAdd={onAdd} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Agua Pool 300ml' }));

    expect(screen.getByText('Quedan 3')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('CartPanel', () => {
  const productosById = new Map([[1, producto]]);
  const baseProps = {
    cart: [{ producto_id: '1', cantidad: 2 }],
    productosById,
    totalEstimado: 1600,
    onChangeQty: vi.fn(),
    onRemoveItem: vi.fn(),
    formatMoney,
    esFiado: false,
    onSetEsFiado: vi.fn(),
    montoPago: '0',
    onSetMontoPago: vi.fn(),
    metodoPago: 'efectivo',
    onSetMetodoPago: vi.fn(),
    cambioContado: 0,
    clientesTiendaFiado: [{ id: 10, nombre: 'Marta', deuda_total: 5000 }],
    clienteTiendaId: '',
    onSetClienteTiendaId: vi.fn(),
    abonoInicialFiado: '0',
    onSetAbonoInicialFiado: vi.fn(),
    onCrearCliente: vi.fn(),
    onConfirmar: vi.fn((e) => e.preventDefault()),
    submittingVenta: false,
  };

  it('muestra las lineas, el total y los controles de cantidad', () => {
    const onChangeQty = vi.fn();
    const onRemoveItem = vi.fn();
    render(<CartPanel {...baseProps} onChangeQty={onChangeQty} onRemoveItem={onRemoveItem} />);

    expect(screen.getByText('Agua Pool 300ml')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cobrar .1600/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar una unidad de Agua Pool 300ml' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar una unidad de Agua Pool 300ml' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Agua Pool 300ml del ticket' }));

    expect(onChangeQty).toHaveBeenNthCalledWith(1, 0, 1);
    expect(onChangeQty).toHaveBeenNthCalledWith(2, 0, -1);
    expect(onRemoveItem).toHaveBeenCalledWith('1');
  });

  it('ticket vacio: invita a agregar productos y no deja cobrar', () => {
    render(<CartPanel {...baseProps} cart={[]} totalEstimado={0} />);

    expect(screen.getByText('El ticket está vacío')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cobrar/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vaciar ticket' })).toBeDisabled();
  });

  it('efectivo: muestra faltante o cambio segun lo recibido', () => {
    const { rerender } = render(<CartPanel {...baseProps} montoPago={1000} />);
    expect(screen.getByText('Faltan $600')).toBeInTheDocument();

    rerender(<CartPanel {...baseProps} montoPago={2000} cambioContado={400} />);
    expect(screen.getByText('Cambio: $400')).toBeInTheDocument();
  });

  it('los montos rapidos rellenan lo recibido', () => {
    const onSetMontoPago = vi.fn();
    render(<CartPanel {...baseProps} onSetMontoPago={onSetMontoPago} />);

    fireEvent.click(screen.getByRole('button', { name: 'Exacto' }));
    fireEvent.click(screen.getByRole('button', { name: '$5000' }));

    expect(onSetMontoPago).toHaveBeenNthCalledWith(1, 1600);
    expect(onSetMontoPago).toHaveBeenNthCalledWith(2, 5000);
  });

  it('Nequi/tarjeta no piden monto recibido', () => {
    render(<CartPanel {...baseProps} metodoPago="nequi" />);

    expect(screen.queryByLabelText('Monto recibido')).not.toBeInTheDocument();
    expect(screen.getByText(/Se cobra el total exacto por Nequi/)).toBeInTheDocument();
  });

  it('fiado: cliente, abono y cuanto queda fiado', () => {
    const onSetAbonoInicialFiado = vi.fn();
    render(
      <CartPanel
        {...baseProps}
        esFiado
        clienteTiendaId="10"
        abonoInicialFiado={600}
        onSetAbonoInicialFiado={onSetAbonoInicialFiado}
      />,
    );

    expect(screen.getByText(/Deuda actual de Marta/)).toBeInTheDocument();
    expect(screen.getByText('$1000')).toBeInTheDocument(); // queda fiado = 1600 - 600
    fireEvent.change(screen.getByLabelText('Abono inicial'), { target: { value: '800' } });
    expect(onSetAbonoInicialFiado).toHaveBeenCalledWith(800);
  });

  it('cliente de fidelizacion con puntos estimados', () => {
    const onSetClienteFidelizacionId = vi.fn();
    render(
      <CartPanel
        {...baseProps}
        clientesFidelizacion={[{ id: 4, nombre: 'Ana', puntos_acumulados: 95 }]}
        clienteFidelizacionId="4"
        onSetClienteFidelizacionId={onSetClienteFidelizacionId}
        puntosEstimados={3}
      />,
    );

    expect(screen.getByText('+3 pts')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Cliente de fidelización' })).toHaveValue('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Ana' }));
    expect(onSetClienteFidelizacionId).toHaveBeenCalledWith('');
  });

  it('pone en espera y vacia el ticket', () => {
    const onHold = vi.fn();
    const onClear = vi.fn();
    render(<CartPanel {...baseProps} onHold={onHold} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: /En espera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vaciar ticket' }));

    expect(onHold).toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });
});

describe('HeldTicketsBar', () => {
  const tickets = [{ id: 'a', numero: 3, items: [{ cantidad: 2 }, { cantidad: 1 }] }];

  it('no se muestra sin tickets', () => {
    const { container } = render(<HeldTicketsBar tickets={[]} onResume={vi.fn()} onDiscard={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('recupera y descarta', () => {
    const onResume = vi.fn();
    const onDiscard = vi.fn();
    render(<HeldTicketsBar tickets={tickets} onResume={onResume} onDiscard={onDiscard} />);

    expect(screen.getByText('Ticket 3 · 3 uds')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar ticket 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar ticket 3' }));

    expect(onResume).toHaveBeenCalledWith('a');
    expect(onDiscard).toHaveBeenCalledWith('a');
  });
});

describe('MobileCartBar', () => {
  it('muestra total y desplaza al ticket', () => {
    const scrollIntoView = vi.fn();
    document.body.innerHTML = '<div id="destino"></div>';
    document.getElementById('destino').scrollIntoView = scrollIntoView;
    render(<MobileCartBar unidades={3} total={4500} formatMoney={formatMoney} targetId="destino" />);

    fireEvent.click(screen.getByRole('button', { name: /Ver ticket · 3 ítems/ }));

    expect(screen.getByText('$4500')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('no aparece con el ticket vacio', () => {
    const { container } = render(<MobileCartBar unidades={0} total={0} formatMoney={formatMoney} targetId="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});
