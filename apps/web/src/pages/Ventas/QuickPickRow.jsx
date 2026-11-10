import { Star } from 'lucide-react';

// Acceso rapido a favoritos y productos mas vendidos en este equipo.
const QuickPickRow = ({ productos, onAdd, formatMoney }) => {
  if (productos.length === 0) return null;

  return (
    <div className="px-5 pt-3">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <Star className="h-3 w-3 text-amber-500" fill="currentColor" /> Favoritos y frecuentes
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {productos.map((producto) => {
          const agotado = Number(producto.stock_actual || 0) === 0;
          return (
            <button
              key={producto.id}
              type="button"
              disabled={agotado}
              onClick={() => onAdd(producto.id)}
              className="flex shrink-0 items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-3 py-1.5 text-xs font-semibold text-gray-800 transition hover:border-rosewood hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="max-w-[9rem] truncate">{producto.nombre}</span>
              <span className="text-rosewood">{formatMoney(producto.precio_venta)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickPickRow;
