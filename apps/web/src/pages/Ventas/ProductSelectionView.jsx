import { useMemo, useRef, useState } from 'react';
import { Barcode, Search, ShoppingCart, Minus, Trash2 } from 'lucide-react';
import Skeleton from '../../components/Skeleton';

const PRODUCT_ICON_RULES = [
  { match: /arroz|grano|lenteja/i, icon: '🍚' },
  { match: /pan|galleta|torta|ponque/i, icon: '🥖' },
  { match: /leche|queso|yogurt|mantequilla/i, icon: '🥛' },
  { match: /coca|gaseosa|jugo|agua|bebida/i, icon: '🥤' },
  { match: /huevo/i, icon: '🥚' },
  { match: /pollo|carne|atun|salchicha/i, icon: '🍗' },
  { match: /aseo|jabon|detergente|cloro/i, icon: '🧼' },
  { match: /shampoo|crema|higiene/i, icon: '🧴' },
];

const getProductIcon = (nombre = '') => {
  const rule = PRODUCT_ICON_RULES.find((entry) => entry.match.test(nombre));
  return rule?.icon || '🛒';
};

const getCategoryName = (producto) => {
  const raw = producto.categoria || producto.catalogo || producto.tipo || 'General';
  return String(raw).trim() || 'General';
};

const ProductSelectionView = ({
  productos,
  searchTerm,
  onSearchChange,
  onAddItem,
  cart,
  onGoToTicket,
  formatMoney,
  loading,
  onRemoveItem,
  onDecreaseItem,
}) => {
  const [activeCategory, setActiveCategory] = useState('Todas');
  const barcodeRef = useRef(null);

  const categories = useMemo(() => {
    const categorySet = new Set(productos.map(getCategoryName));
    return ['Todas', ...Array.from(categorySet)];
  }, [productos]);

  const visibleProducts = useMemo(() => {
    if (activeCategory === 'Todas') return productos;
    return productos.filter((producto) => getCategoryName(producto) === activeCategory);
  }, [activeCategory, productos]);

  const totalItems = useMemo(
    () => cart.reduce((acc, item) => acc + Number(item.cantidad || 0), 0),
    [cart],
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 pb-24 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="text-xl font-black text-gray-900">Ventas POS</h2>
        <p className="text-sm text-gray-500">Selecciona productos para construir el ticket.</p>
      </div>

      <label className="relative mb-2 block">
        <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={barcodeRef}
          type="text"
          placeholder="Escanear código de barras..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const code = e.target.value.trim();
              if (!code) return;
              const product = productos.find((p) => p.codigo_barras === code);
              if (product) {
                onAddItem(product);
                e.target.value = '';
              }
            }
          }}
          className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm focus:border-rosewood focus:outline-none"
        />
      </label>
      <label className="relative mb-4 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm focus:border-rosewood focus:outline-none"
          placeholder="Buscar por nombre"
        />
      </label>

      {categories.length > 2 && (
        <div className="mb-4 -mx-1 overflow-x-auto pb-2">
          <div className="flex w-max gap-2 px-1">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeCategory === category
                    ? 'border-rosewood bg-rosewood text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <Skeleton lines={3} />
        </div>
      )}

      {!loading && visibleProducts.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          No hay productos para ese filtro.
        </div>
      )}

      {!loading && visibleProducts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleProducts.map((producto) => {
            const stock = Number(producto.stock_actual || 0);
            const lowStock = stock < 5;
            const outOfStock = stock === 0;
            const qtyInCart = cart.find(
              (item) => Number(item.producto_id) === Number(producto.id),
            )?.cantidad || 0;

            return (
              <div
                key={producto.id}
                role="button"
                tabIndex={outOfStock ? -1 : 0}
                onClick={() => { if (!outOfStock) onAddItem(producto.id); }}
                onKeyDown={(event) => {
                  if (outOfStock) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onAddItem(producto.id);
                  }
                }}
                className={`relative rounded-2xl border pt-10 p-3 text-left shadow-sm transition sm:pt-4 sm:p-4 ${
                  qtyInCart > 0
                    ? 'border-rosewood bg-blush-50'
                    : outOfStock
                      ? 'cursor-not-allowed border-gray-200 bg-gray-100 opacity-50'
                      : lowStock
                        ? 'cursor-pointer border-amber-300 bg-amber-50 active:scale-[0.99] hover:border-rosewood'
                        : 'cursor-pointer border-gray-200 bg-white active:scale-[0.99] hover:border-rosewood hover:bg-blush-100'
                }`}
              >
                {/* Top-left trash and top-right red counter */}
                {qtyInCart > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (typeof onRemoveItem === 'function') onRemoveItem(producto.id); }}
                    className="absolute left-1 top-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
                    aria-label={`Eliminar ${producto.nombre}`}
                    title="Descartar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}

                {qtyInCart > 0 && (
                  <div className="absolute right-1 top-1 z-10 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (qtyInCart > 1) {
                          if (typeof onDecreaseItem === 'function') onDecreaseItem(producto.id);
                        } else {
                          if (typeof onRemoveItem === 'function') onRemoveItem(producto.id);
                        }
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-rosewood shadow-sm hover:bg-gray-50"
                      aria-label={`Disminuir ${producto.nombre}`}
                      title="Disminuir"
                    >
                      <Minus className="h-4 w-4" />
                    </button>

                    <div className="inline-flex h-6 min-w-[26px] items-center justify-center rounded-full bg-rosewood px-2 text-[11px] font-semibold text-white shadow">
                      x {qtyInCart}
                    </div>
                  </div>
                )}
                <div className="mb-2 flex items-start gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-2xl">{getProductIcon(producto.nombre)}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900">{producto.nombre}</p>
                      <p className="mt-1 text-xs text-gray-500">{formatMoney(producto.precio_venta)}</p>
                    </div>
                  </div>

                    <div className="w-6 flex-shrink-0" />
                </div>
                <p className={`mt-1 text-xs font-medium ${outOfStock ? 'text-red-600' : lowStock ? 'text-amber-800' : 'text-gray-500'}`}>
                  {outOfStock ? 'Sin stock' : `Stock: ${stock}${lowStock ? ' · Bajo' : ''}`}
                </p>
                {/* fallback controls (previously duplicated) removed to simplify mobile layout */}
              </div>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:left-auto sm:right-auto sm:w-full">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2">
            <ShoppingCart className="h-5 w-5 text-rosewood" />
            <span className="text-sm font-semibold text-gray-700">{totalItems} items</span>
          </div>

          <button
            type="button"
            onClick={onGoToTicket}
            disabled={totalItems === 0}
            className="rounded-xl bg-rosewood px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Ver ticket
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProductSelectionView;
