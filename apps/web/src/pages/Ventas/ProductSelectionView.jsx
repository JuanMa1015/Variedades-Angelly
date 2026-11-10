import { forwardRef, useMemo, useState } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { ScanBarcode, Search, X } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import ProductCard from './ProductCard';
import QuickPickRow from './QuickPickRow';
import { formatThousands } from './posHelpers';

const EMPTY_SET = new Set();
const GRID_CLASS = 'grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

const GridList = forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={className} {...props}>
    {children}
  </div>
));
GridList.displayName = 'GridList';

const getCategoryName = (producto) => {
  const raw = producto.categoria || producto.tipo || 'General';
  return String(raw).trim() || 'General';
};

const SearchBar = ({ value, onChange, onSubmit, inputRef }) => (
  <div className="relative">
    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onSubmit(value);
      }}
      placeholder="Buscar producto o escanear código de barras"
      aria-label="Buscar producto o escanear código de barras"
      autoComplete="off"
      className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-12 pr-24 text-base text-gray-900 shadow-inner transition focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20"
    />
    <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <ScanBarcode className="h-5 w-5 text-gray-300" aria-hidden="true" />
      )}
      <kbd className="hidden rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 sm:inline">F2</kbd>
    </div>
  </div>
);

const CategoryChips = ({ categories, active, onChange }) => (
  <div className="overflow-x-auto px-5 pt-3">
    <div className="flex gap-2">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onChange(category)}
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
            active === category
              ? 'border-rosewood bg-rosewood text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-rosewood/50'
          }`}
        >
          {category}
        </button>
      ))}
    </div>
  </div>
);

// Si la tienda tiene mas productos de los que se cargan de una vez, lo dice y manda al buscador.
const catalogSummary = (shown, total) => (total && total > shown
  ? `Mostrando ${formatThousands(shown)} de ${formatThousands(total)} productos · usa el buscador para encontrar el resto`
  : `${formatThousands(shown) || 0} productos · toca una tarjeta para agregarla al ticket`);

const ProductSelectionView = ({
  productos,
  searchTerm,
  onSearchChange,
  onAddItem,
  onScanCode,
  cart,
  formatMoney,
  loading,
  totalCatalogo = null,
  searchInputRef,
  favorites = EMPTY_SET,
  onToggleFavorite,
  quickPickProductos = [],
}) => {
  const [activeCategory, setActiveCategory] = useState('Todas');
  const isSearching = searchTerm.trim().length > 0;

  const categories = useMemo(() => {
    const names = new Set(productos.map(getCategoryName));
    return names.size > 1 ? [...names] : [];
  }, [productos]);

  const visibleProducts = useMemo(() => {
    if (activeCategory === 'Todas' || categories.length === 0) return productos;
    return productos.filter((producto) => getCategoryName(producto) === activeCategory);
  }, [activeCategory, categories, productos]);

  const cartMap = useMemo(
    () => new Map(cart.map((item) => [Number(item.producto_id), Number(item.cantidad || 0)])),
    [cart],
  );

  const handleSubmit = async (value) => {
    const added = await onScanCode?.(value);
    if (added) onSearchChange('');
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="Catálogo de productos">
      <div className="border-b border-gray-100 p-4 pb-3">
        <SearchBar value={searchTerm} onChange={onSearchChange} onSubmit={handleSubmit} inputRef={searchInputRef} />
        <p className="mt-2 text-xs text-gray-500">
          {isSearching
            ? `${visibleProducts.length} resultado${visibleProducts.length === 1 ? '' : 's'} · Enter agrega el producto o el código escaneado`
            : catalogSummary(productos.length, totalCatalogo)}
        </p>
      </div>

      {!isSearching && <QuickPickRow productos={quickPickProductos} onAdd={onAddItem} formatMoney={formatMoney} />}
      {!isSearching && categories.length > 0 && (
        <CategoryChips categories={['Todas', ...categories]} active={activeCategory} onChange={setActiveCategory} />
      )}

      <div className="min-h-0 flex-1 p-5 pt-4">
        {loading && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <Skeleton lines={3} />
          </div>
        )}

        {!loading && visibleProducts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="text-sm font-semibold text-gray-700">Sin resultados</p>
            <p className="text-xs text-gray-500">Prueba con otro nombre o escanea el código de barras.</p>
          </div>
        )}

        {!loading && visibleProducts.length > 0 && (
          <VirtuosoGrid
            style={{ height: '100%' }}
            totalCount={visibleProducts.length}
            overscan={200}
            components={{ List: GridList }}
            listClassName={GRID_CLASS}
            itemContent={(index) => {
              const producto = visibleProducts[index];
              return (
                <ProductCard
                  producto={producto}
                  qtyInCart={cartMap.get(Number(producto.id)) || 0}
                  onAdd={onAddItem}
                  formatMoney={formatMoney}
                  isFavorite={favorites.has(Number(producto.id))}
                  onToggleFavorite={onToggleFavorite}
                />
              );
            }}
          />
        )}
      </div>
    </section>
  );
};

export default ProductSelectionView;
