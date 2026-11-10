import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SaleReceiptPanel from '../SaleReceiptPanel';

const formatMoney = (value) => `$${value}`;
const base = {
  timestamp: '9/11/2026',
  metodoPago: 'efectivo',
  items: [{ nombre: 'Agua Pool', cantidad: 1, precio: 1800, subtotal: 1800 }],
  total: 1800,
  pago: 1800,
  cambio: 0,
  esFiado: false,
  abono: 0,
  puntos: 0,
  cliente: null,
};

const renderPanel = (receipt = {}, handlers = {}) => render(
  <SaleReceiptPanel receipt={{ ...base, ...receipt }} formatMoney={formatMoney} onPrint={vi.fn()} onNewSale={vi.fn()} {...handlers} />,
);

describe('SaleReceiptPanel', () => {
  it('muestra el cambio tambien cuando es cero', () => {
    renderPanel();

    expect(screen.getByText('Cambio')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  it('muestra el cambio cuando lo hay', () => {
    renderPanel({ pago: 2000, cambio: 200 });

    expect(screen.getByText('$200')).toBeInTheDocument();
  });

  it('en fiado muestra cliente y lo que queda fiado, sin cambio', () => {
    renderPanel({ esFiado: true, cliente: 'Marta', abono: 500, total: 1800 });

    expect(screen.getByText('Marta')).toBeInTheDocument();
    expect(screen.getByText('$1300')).toBeInTheDocument();
    expect(screen.queryByText('Cambio')).not.toBeInTheDocument();
  });

  it('muestra los puntos ganados', () => {
    renderPanel({ puntos: 3 });

    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('el boton de nueva venta recibe el foco y los botones llaman a sus acciones', () => {
    const onNewSale = vi.fn();
    const onPrint = vi.fn();
    renderPanel({}, { onNewSale, onPrint });

    expect(screen.getByRole('button', { name: /Nueva venta/ })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    fireEvent.click(screen.getByRole('button', { name: /Imprimir comprobante/ }));

    expect(onNewSale).toHaveBeenCalled();
    expect(onPrint).toHaveBeenCalled();
  });
});
