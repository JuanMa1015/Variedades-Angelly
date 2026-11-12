import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CarteraClientesSection from '../CarteraClientesSection';

const formatMoney = (v) => `$ ${Number(v).toLocaleString('es-CO')}`;

const abrir = (clientes) => render(
  <CarteraClientesSection
    clientesCarteraFiltrados={clientes}
    formatMoney={formatMoney}
    searchTerm=""
    setSearchTerm={vi.fn()}
    startNewCliente={vi.fn()}
    startEditingCliente={vi.fn()}
    handleDeleteCliente={vi.fn()}
  />,
);

describe('CarteraClientesSection: semaforo y WhatsApp', () => {
  it('muestra el nivel que calcula el servidor y desde cuando se debe', () => {
    abrir([
      { id: 1, nombre: 'Danilo', documento: '1039', telefono_whatsapp: '573205603611', deuda_total: 522800, estado_deuda: 'al_dia', dias_deuda: 2 },
      { id: 2, nombre: 'Gilar', documento: '1234', telefono_whatsapp: null, deuda_total: 5000, estado_deuda: 'moroso', dias_deuda: 75 },
    ]);

    expect(screen.getAllByText('Al día').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Moroso').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Debe hace 75 días').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Debe hace 2 días').length).toBeGreaterThan(0);
  });

  it('el WhatsApp se ve legible', () => {
    abrir([{ id: 1, nombre: 'Danilo', documento: '1039', telefono_whatsapp: '573205603611', deuda_total: 0, estado_deuda: 'sin_deuda', dias_deuda: null }]);

    expect(screen.getAllByText(/320 560 3611/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin deuda').length).toBeGreaterThan(0);
  });
});
