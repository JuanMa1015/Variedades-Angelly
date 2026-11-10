import { memo } from 'react';
import { Plus, Star } from 'lucide-react';
import ProductImage from './ProductImage';

const LOW_STOCK_LIMIT = 5;

const StockPill = ({ stock }) => {
  if (stock === 0) {
    return <span className="rounded-full bg-gray-800/85 px-2 py-0.5 text-[11px] font-bold text-white">Agotado</span>;
  }
  if (stock <= LOW_STOCK_LIMIT) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Quedan {stock}</span>;
  }
  return null;
};

const ProductCard = ({ producto, qtyInCart, onAdd, formatMoney, isFavorite, onToggleFavorite }) => {
  const stock = Number(producto.stock_actual || 0);
  const outOfStock = stock === 0;
  const atMax = !outOfStock && qtyInCart >= stock;
  const selected = qtyInCart > 0;

  let stateClass = 'border-gray-200 hover:-translate-y-0.5 hover:border-blush-300 hover:shadow-md';
  if (outOfStock) stateClass = 'cursor-not-allowed border-gray-200 opacity-60';
  else if (selected) stateClass = 'border-rosewood ring-1 ring-rosewood/40 shadow-md';

  return (
    <div className="group relative">
      <button
        type="button"
        disabled={outOfStock}
        onClick={() => { if (!atMax) onAdd(producto.id); }}
        aria-label={`Agregar ${producto.nombre}`}
        className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition active:scale-[0.98] ${stateClass}`}
      >
        <div className={`relative aspect-[16/10] w-full overflow-hidden ${outOfStock ? 'grayscale' : ''}`}>
          <ProductImage producto={producto} />
          <div className="absolute bottom-2 left-2"><StockPill stock={stock} /></div>
          {selected && (
            <span className="absolute right-2 top-2 flex h-7 min-w-[28px] items-center justify-center rounded-full bg-rosewood px-2 text-xs font-bold text-white shadow">
              {qtyInCart}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-between gap-2 p-3">
          <span className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-gray-900">
            {producto.nombre}
          </span>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-rosewood">{formatMoney(producto.precio_venta)}</span>
            {!outOfStock && (
              <span className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                atMax ? 'bg-gray-100 text-gray-400' : 'bg-blush-100 text-rosewood group-hover:bg-rosewood group-hover:text-white'
              }`}
              >
                <Plus className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>
      </button>

      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(producto.id)}
          aria-label={isFavorite ? `Quitar ${producto.nombre} de favoritos` : `Marcar ${producto.nombre} como favorito`}
          aria-pressed={isFavorite}
          className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow transition ${
            isFavorite ? 'text-amber-500' : 'text-gray-400 opacity-0 hover:text-amber-500 focus:opacity-100 group-hover:opacity-100'
          }`}
        >
          <Star className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
};

export default memo(ProductCard);
