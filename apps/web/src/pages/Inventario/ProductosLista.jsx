import { History, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { formatMoney } from '../../utils/format';
import { ESTADOS_STOCK, estadoStock } from './inventarioHelpers';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const urlImagen = (url) => (url.startsWith('http') ? url : `${API_URL}${url}`);

// El stock se lee de un vistazo: agotado en rojo, bajo en ambar, el resto normal.
export const StockCelda = ({ producto }) => {
  const estado = estadoStock(producto);
  const { etiqueta, clase } = ESTADOS_STOCK[estado];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={estado === 'ok' ? clase : `font-bold ${estado === 'agotado' ? 'text-red-700' : 'text-amber-700'}`}>{producto.stock_actual}</span>
      {etiqueta && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${clase}`}>{etiqueta}</span>}
    </span>
  );
};

const Miniatura = ({ producto, tamano = 'h-10 w-10' }) => (
  producto.imagen_url
    ? <img src={urlImagen(producto.imagen_url)} alt={producto.nombre || 'Imagen del producto'} className={`${tamano} shrink-0 rounded-lg border border-gray-200 object-cover`} />
    : <span className={`${tamano} flex shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-300`} aria-hidden="true">—</span>
);

const BOTON = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition';

const Acciones = ({ producto, canDeactivate, onEditar, onHistorial, onEliminar, onReactivar }) => {
  if (!producto.activo) {
    return canDeactivate && (
      <button type="button" onClick={() => onReactivar(producto)} className={`${BOTON} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reactivar
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onEditar(producto)} title="Editar producto" className={`${BOTON} border-gray-300 text-gray-700 hover:bg-gray-50`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
      </button>
      <button type="button" onClick={() => onHistorial(producto)} title="Historial de stock" className={`${BOTON} border-gray-300 text-gray-700 hover:bg-gray-50`}>
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Historial
      </button>
      {canDeactivate && (
        <button type="button" onClick={() => onEliminar(producto)} title="Desactivar producto" className={`${BOTON} border-red-200 text-red-600 hover:bg-red-50`}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Desactivar
        </button>
      )}
    </div>
  );
};

// Escritorio: tabla. Celular: tarjetas (la tabla obligaba a deslizar de lado y dejaba los botones fuera de la pantalla).
const Tabla = ({ productos, ...acciones }) => (
  <div className="hidden overflow-x-auto md:block">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left">
          <th className="px-4 py-3 font-semibold text-gray-700">Producto</th>
          <th className="px-4 py-3 font-semibold text-gray-700">Código</th>
          <th className="px-4 py-3 font-semibold text-gray-700">Stock</th>
          <th className="px-4 py-3 font-semibold text-gray-700">Mín</th>
          <th className="px-4 py-3 font-semibold text-gray-700">Proveedor</th>
          <th className="px-4 py-3 font-semibold text-gray-700">Precio venta</th>
          <th className="px-4 py-3 text-right font-semibold text-gray-700">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {productos.map((producto) => (
          <tr key={producto.id} className={`border-b border-gray-100 hover:bg-gray-50 ${producto.activo ? '' : 'opacity-60'}`}>
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Miniatura producto={producto} />
                <span className="font-medium text-gray-900">{producto.nombre}</span>
              </div>
            </td>
            <td className="px-4 py-3 text-gray-700">{producto.codigo_barras || '-'}</td>
            <td className="px-4 py-3"><StockCelda producto={producto} /></td>
            <td className="px-4 py-3 text-gray-700">{producto.stock_minimo}</td>
            <td className="px-4 py-3 text-gray-700">{producto.proveedor_nombre || '-'}</td>
            <td className="px-4 py-3 text-gray-700">{formatMoney(producto.precio_venta)}</td>
            <td className="px-4 py-3"><div className="flex justify-end"><Acciones producto={producto} {...acciones} /></div></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Tarjetas = ({ productos, ...acciones }) => (
  <ul className="space-y-3 md:hidden">
    {productos.map((producto) => (
      <li key={producto.id} className={`rounded-xl border border-gray-200 p-3 ${producto.activo ? '' : 'opacity-60'}`}>
        <div className="flex items-start gap-3">
          <Miniatura producto={producto} tamano="h-14 w-14" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{producto.nombre}</p>
            <p className="text-xs text-gray-500">{producto.codigo_barras || 'Sin código'}{producto.proveedor_nombre ? ` · ${producto.proveedor_nombre}` : ''}</p>
          </div>
          <p className="shrink-0 text-right font-bold tabular-nums text-gray-900">{formatMoney(producto.precio_venta)}</p>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Stock: <StockCelda producto={producto} /> <span className="text-xs text-gray-400">(mínimo {producto.stock_minimo})</span>
        </p>
        <div className="mt-2"><Acciones producto={producto} {...acciones} /></div>
      </li>
    ))}
  </ul>
);

const ProductosLista = ({ productos, loading, vacio, ...acciones }) => {
  if (loading) return <div className="py-6"><Skeleton lines={4} /></div>;
  if (productos.length === 0) return <p className="py-8 text-center text-gray-500">{vacio}</p>;
  return (
    <>
      <Tabla productos={productos} {...acciones} />
      <Tarjetas productos={productos} {...acciones} />
    </>
  );
};

export default ProductosLista;
