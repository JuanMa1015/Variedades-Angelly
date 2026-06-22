import { forwardRef, useMemo, useRef, useState } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { Barcode, Search } from 'lucide-react';
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

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
};

const getCategoryName = (producto) => {
  const raw = producto.categoria || producto.catalogo || producto.tipo || 'General';
  return String(raw).trim() || 'General';
};

const ProductCard = ({ producto, cartMap, onAddItem, formatMoney, isLarge }) => {
  const stock = Number(producto.stock_actual || 0);
  const qtyInCart = cartMap.get(Number(producto.id)) || 0;
  const outOfStock = stock === 0;
  const atMax = !outOfStock && qtyInCart >= stock;

  return (
    <button
      type="button"
      disabled={outOfStock}
      onClick={() => { if (!atMax) onAddItem(producto.id); }}
      className={`group relative flex w-full flex-col overflow-hidden border text-left transition ${
        isLarge
          ? 'rounded-2xl active:scale-[0.98]'
          : 'rounded-xl active:scale-[0.97]'
      } ${
        outOfStock
          ? 'cursor-not-allowed border-gray-200 opacity-50'
          : qtyInCart > 0
            ? 'border-rosewood shadow-sm'
            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className={`relative w-full overflow-hidden bg-gray-50 ${
        isLarge ? 'aspect-[4/3]' : 'aspect-square'
      }`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={isLarge ? 'text-5xl' : 'text-3xl'}>
            {getProductIcon(producto.nombre)}
          </span>
        </div>
        {producto.imagen_url ? (
          <img
            src={getImageUrl(producto.imagen_url)}
            alt={producto.nombre}
            className="relative z-10 h-full w-full object-cover transition duration-200 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : null}

        {qtyInCart > 0 && (
          <span className={`absolute flex items-center justify-center rounded-full bg-rosewood px-1 font-bold text-white shadow ${
            isLarge
              ? 'right-2 top-2 h-7 min-w-[28px] px-2 text-xs'
              : 'right-1.5 top-1.5 h-5 min-w-[20px] text-[10px]'
          }`}>
            {qtyInCart}
          </span>
        )}

        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <span className={`rounded bg-red-600 font-bold text-white shadow ${
              isLarge ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[9px]'
            }`}>
              Sin stock
            </span>
          </div>
        )}
      </div>

      <div className={`flex flex-col ${isLarge ? 'gap-0.5 px-3 py-2.5' : 'gap-0 px-2 py-1.5'}`}>
        <span className={`truncate font-semibold leading-tight text-gray-900 ${
          isLarge ? 'text-sm' : 'text-[11px]'
        }`}>
          {producto.nombre}
        </span>
        <span className={`font-bold text-rosewood ${
          isLarge ? 'text-base' : 'text-xs'
        }`}>
          {formatMoney(producto.precio_venta)}
        </span>
        {!outOfStock && stock < 5 && (
          <span className={isLarge ? 'text-[10px] font-medium text-amber-700' : 'text-[9px] font-medium text-amber-700'}>
            {isLarge ? `Quedan ${stock} uds` : `${stock} uds`}
          </span>
        )}
      </div>
    </button>
  );
};

const GridList = forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={className} {...props}>
    {children}
  </div>
));
GridList.displayName = 'GridList';

const ProductSelectionView = ({
  productos,
  searchTerm,
  onSearchChange,
  onAddItem,
  cart,
  formatMoney,
  loading,
}) => {
  const [activeCategory, setActiveCategory] = useState('Todas');
  const barcodeRef = useRef(null);
  const isSearching = searchTerm.trim().length > 0;

  const categories = useMemo(() => {
    const categorySet = new Set(productos.map(getCategoryName));
    return ['Todas', ...Array.from(categorySet)];
  }, [productos]);

  const visibleProducts = useMemo(() => {
    if (activeCategory === 'Todas') return productos;
    return productos.filter((producto) => getCategoryName(producto) === activeCategory);
  }, [activeCategory, productos]);

  const cartMap = useMemo(
    () => new Map(cart.map((item) => [Number(item.producto_id), Number(item.cantidad || 0)])),
    [cart],
  );

  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-bold text-gray-900">Ventas POS</h2>
      </div>

      <div className="space-y-3 p-4 pb-0">
        <label className="relative block">
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
                  const stock = Number(product.stock_actual || 0);
                  if (stock === 0) return;
                  const qtyInCart = cartMap.get(Number(product.id)) || 0;
                  if (qtyInCart >= stock) return;
                  onAddItem(product.id);
                  e.target.value = '';
                }
              }
            }}
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-rosewood focus:outline-none"
          />
        </label>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-rosewood focus:outline-none"
            placeholder="Buscar por nombre"
          />
        </label>
      </div>

      {!isSearching && categories.length > 2 && (
        <div className="mt-3 overflow-x-auto pb-2">
          <div className="flex gap-2 px-4">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
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

      <div className="flex-1 overflow-hidden p-4 pt-3">
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
          <VirtuosoGrid
            style={{ height: '100%' }}
            totalCount={visibleProducts.length}
            overscan={200}
            components={{ List: GridList }}
            listClassName={
              isSearching
                ? 'grid grid-cols-3 gap-2 sm:grid-cols-4'
                : 'grid grid-cols-2 gap-4 sm:grid-cols-3'
            }
            itemContent={(index) => (
              <ProductCard
                producto={visibleProducts[index]}
                cartMap={cartMap}
                onAddItem={onAddItem}
                formatMoney={formatMoney}
                isLarge={!isSearching}
              />
            )}
          />
        )}
      </div>
    </section>
  );
};

export default ProductSelectionView;
