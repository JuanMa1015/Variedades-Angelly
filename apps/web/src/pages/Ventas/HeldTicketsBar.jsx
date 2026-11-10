import { X } from 'lucide-react';

const countUnits = (items = []) => items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);

// Tickets guardados para atender a otro cliente; se recuperan con un toque.
const HeldTicketsBar = ({ tickets, onResume, onDiscard }) => {
  if (tickets.length === 0) return null;

  return (
    <div className="border-b border-gray-100 bg-gold-50/60 px-4 py-2" aria-label="Tickets en espera">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">En espera</p>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="flex shrink-0 items-center overflow-hidden rounded-full border border-gold-200 bg-white text-xs font-semibold">
            <button
              type="button"
              onClick={() => onResume(ticket.id)}
              className="px-3 py-1.5 text-gray-800 transition hover:bg-gold-50"
              aria-label={`Recuperar ticket ${ticket.numero}`}
            >
              Ticket {ticket.numero} · {countUnits(ticket.items)} uds
            </button>
            <button
              type="button"
              onClick={() => onDiscard(ticket.id)}
              aria-label={`Descartar ticket ${ticket.numero}`}
              className="border-l border-gold-200 px-2 py-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeldTicketsBar;
