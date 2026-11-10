import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PaymentBadge from '../PaymentBadge';

describe('PaymentBadge', () => {
  it.each([
    ['efectivo', 'Efectivo', 'text-rosewood'],
    ['transferencia', 'Transferencia', 'text-gold-200'],
    ['tarjeta', 'Tarjeta', 'text-sky-700'],
  ])('%s se muestra como %s con su color', (method, label, clase) => {
    render(<PaymentBadge method={method} />);

    expect(screen.getByText(label)).toHaveClass(clase);
  });

  it('un medio desconocido o vacio sale en gris', () => {
    const { rerender } = render(<PaymentBadge method="cheque" />);
    expect(screen.getByText('cheque')).toHaveClass('text-gray-600');

    rerender(<PaymentBadge method={null} />);
    expect(screen.getByText('-')).toHaveClass('bg-gray-100');
  });

  it('la version compacta usa menos relleno', () => {
    render(<PaymentBadge method="tarjeta" compact />);

    expect(screen.getByText('Tarjeta')).toHaveClass('px-2');
  });
});
