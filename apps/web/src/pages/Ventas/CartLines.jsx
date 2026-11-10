import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';

const EmptyTicket = () => (
  <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center text-gray-400">
    <ShoppingCart className="h-10 w-10" aria-hidden="true" />
    <p className="text-sm font-semibold text-gray-500">El ticket está vacío</p>
    <p className="text-xs">Toca un producto o escanea un código para empezar.</p>
  </div>
);

const QuantityStepper = ({ nombre, cantidad, onDecrease, onIncrease }) => (
  <div className="inline-flex shrink-0 items-center rounded-full border border-gray-300 bg-white">
    <button
      type="button"
      onClick={onDecrease}
      aria-label={`Quitar una unidad de ${nombre}`}
      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100"
    >
      <Minus className="h-3.5 w-3.5" />
    </button>
    <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums text-gray-900" aria-label={`Cantidad: ${cantidad}`}>
      {cantidad}
    </span>
    <button
      type="button"
      onClick={onIncrease}
      aria-label={`Agregar una unidad de ${nombre}`}
      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  </div>
);

const CartLine = ({ item, index, producto, onChangeQty, onRemoveItem, formatMoney }) => {
  const cantidad = Number(item.cantidad || 0);
  const precio = Number(producto?.precio_venta || 0);
  const nombre = producto?.nombre || `Producto #${item.producto_id}`;

  return (
    <li className="flex items-center gap-2 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">{nombre}</p>
        <p className="text-xs text-gray-500">{formatMoney(precio)} c/u</p>
      </div>
      <QuantityStepper
        nombre={nombre}
        cantidad={cantidad}
        onDecrease={() => onChangeQty(index, -1)}
        onIncrease={() => onChangeQty(index, 1)}
      />
      <span className="w-[4.5rem] shrink-0 text-right text-sm font-bold tabular-nums text-gray-900">
        {formatMoney(precio * cantidad)}
      </span>
      <button
        type="button"
        onClick={() => onRemoveItem(item.producto_id)}
        aria-label={`Quitar ${nombre} del ticket`}
        className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
};

const CartLines = ({ cart, productosById, onChangeQty, onRemoveItem, formatMoney }) => {
  if (cart.length === 0) return <EmptyTicket />;

  return (
    <ul className="divide-y divide-gray-100">
      {cart.map((item, index) => (
        <CartLine
          key={item.producto_id}
          item={item}
          index={index}
          producto={productosById.get(Number(item.producto_id))}
          onChangeQty={onChangeQty}
          onRemoveItem={onRemoveItem}
          formatMoney={formatMoney}
        />
      ))}
    </ul>
  );
};

export default CartLines;
