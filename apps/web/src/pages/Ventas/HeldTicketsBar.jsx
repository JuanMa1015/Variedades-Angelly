import { PlayCircle, Trash2 } from 'lucide-react';

const countUnits = (items = []) => items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);

const resumenDe = (ticket, formatMoney) => {
  const unidades = countUnits(ticket.items);
  const texto = `${unidades} ${unidades === 1 ? 'producto' : 'productos'}`;
  return Number.isFinite(ticket.total) ? `${texto} · ${formatMoney(ticket.total)}` : texto;
};

// Tickets guardados para atender a otro cliente: cada uno con su boton «Abrir» bien a la vista.
const HeldTicketsBar = ({ tickets, onResume, onDiscard, formatMoney = (valor) => String(valor) }) => {
  if (tickets.length === 0) return null;
  const titulo = tickets.length === 1 ? '1 ticket en espera' : `${tickets.length} tickets en espera`;

  return (
    <div className="border-b border-gold-200 bg-gold-50 px-4 py-3" aria-label="Tickets en espera">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">{titulo}</p>
      <ul className="max-h-40 space-y-2 overflow-y-auto">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="flex items-center gap-2 rounded-xl border border-gold-200 bg-white py-1.5 pl-3 pr-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900">Ticket {ticket.numero}</p>
              <p className="truncate text-xs text-gray-500">{resumenDe(ticket, formatMoney)}</p>
            </div>
            <button
              type="button"
              onClick={() => onResume(ticket.id)}
              aria-label={`Recuperar ticket ${ticket.numero}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rosewood px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" /> Abrir
            </button>
            <button
              type="button"
              onClick={() => onDiscard(ticket.id)}
              aria-label={`Descartar ticket ${ticket.numero}`}
              className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HeldTicketsBar;
