import { useCallback } from 'react';
import { useStoredState } from './useStoredState';

const STORAGE_KEY = 'angelly.pos.tickets.v1';
const MAX_HELD_TICKETS = 10;

const normalize = (raw) => ({
  counter: Number.isInteger(raw?.counter) ? raw.counter : 0,
  tickets: Array.isArray(raw?.tickets) ? raw.tickets : [],
});

// Tickets en espera: la venta queda guardada en este equipo para atender a otro cliente.
export const useHeldTickets = () => {
  const [stored, setStored] = useStoredState(STORAGE_KEY, { counter: 0, tickets: [] });
  const { counter, tickets } = normalize(stored);

  // Retorna el numero asignado al ticket para poder avisarlo en pantalla.
  const hold = useCallback((snapshot) => {
    const numero = counter + 1;
    setStored((current) => {
      const base = normalize(current);
      const ticket = { ...snapshot, id: `t${Date.now()}-${numero}`, numero, creado: new Date().toISOString() };
      return { counter: Math.max(base.counter, numero), tickets: [...base.tickets, ticket].slice(-MAX_HELD_TICKETS) };
    });
    return numero;
  }, [counter, setStored]);

  const discard = useCallback((id) => {
    setStored((current) => {
      const base = normalize(current);
      return { ...base, tickets: base.tickets.filter((ticket) => ticket.id !== id) };
    });
  }, [setStored]);

  // Recupera un ticket en espera (y lo quita de la lista).
  const take = useCallback((id) => {
    const found = tickets.find((ticket) => ticket.id === id);
    if (found) discard(id);
    return found;
  }, [tickets, discard]);

  return { tickets, hold, take, discard };
};
