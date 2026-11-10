import { ShoppingCart } from 'lucide-react';

// Barra fija solo en pantallas pequenas: el ticket queda abajo y el total siempre a la vista.
const MobileCartBar = ({ unidades, total, formatMoney, targetId }) => {
  if (unidades === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        className="flex h-12 w-full items-center justify-between rounded-xl bg-rosewood px-4 text-white shadow-soft"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          Ver ticket · {unidades} {unidades === 1 ? 'ítem' : 'ítems'}
        </span>
        <span className="text-base font-black tabular-nums">{formatMoney(total)}</span>
      </button>
    </div>
  );
};

export default MobileCartBar;
