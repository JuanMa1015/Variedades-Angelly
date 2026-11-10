import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHeldTickets } from '../useHeldTickets';
import { usePosPreferences } from '../usePosPreferences';

describe('useHeldTickets', () => {
  const ticket = (id) => ({ items: [{ producto_id: String(id), cantidad: 2 }], esFiado: false });

  it('guarda tickets con numero consecutivo y los recupera', () => {
    const { result } = renderHook(() => useHeldTickets());

    let numero;
    act(() => { numero = result.current.hold(ticket(1)); });
    expect(numero).toBe(1);
    act(() => { result.current.hold(ticket(2)); });

    expect(result.current.tickets.map((t) => t.numero)).toEqual([1, 2]);

    let recuperado;
    act(() => { recuperado = result.current.take(result.current.tickets[0].id); });
    expect(recuperado.items[0].producto_id).toBe('1');
    expect(result.current.tickets).toHaveLength(1);
  });

  it('descarta un ticket y devuelve undefined si no existe', () => {
    const { result } = renderHook(() => useHeldTickets());
    act(() => { result.current.hold(ticket(1)); });

    act(() => { result.current.discard(result.current.tickets[0].id); });

    expect(result.current.tickets).toEqual([]);
    expect(result.current.take('no-existe')).toBeUndefined();
  });

  it('conserva como maximo 10 tickets', () => {
    const { result } = renderHook(() => useHeldTickets());
    for (let i = 1; i <= 12; i += 1) {
      act(() => { result.current.hold(ticket(i)); });
    }
    expect(result.current.tickets).toHaveLength(10);
    expect(result.current.tickets[0].numero).toBe(3);
  });
});

describe('usePosPreferences', () => {
  it('los favoritos van primero y luego los mas usados, sin repetir', () => {
    const { result } = renderHook(() => usePosPreferences());

    act(() => {
      [5, 5, 5, 7, 7, 9].forEach((id) => result.current.registerUse(id));
    });
    act(() => { result.current.toggleFavorite(9); });

    expect(result.current.quickPickIds).toEqual([9, 5, 7]);
    expect(result.current.favorites.has(9)).toBe(true);
  });

  it('quitar un favorito lo devuelve al orden por uso', () => {
    const { result } = renderHook(() => usePosPreferences());
    act(() => { result.current.registerUse(1); });
    act(() => { result.current.toggleFavorite(2); });
    act(() => { result.current.toggleFavorite(2); });

    expect(result.current.favorites.size).toBe(0);
    expect(result.current.quickPickIds).toEqual([1]);
  });

  it('limita el acceso rapido a 8 productos', () => {
    const { result } = renderHook(() => usePosPreferences());
    act(() => {
      for (let id = 1; id <= 12; id += 1) result.current.registerUse(id);
    });
    expect(result.current.quickPickIds).toHaveLength(8);
  });
});
