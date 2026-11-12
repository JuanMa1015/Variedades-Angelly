import { SkeletonCard } from '../../components/Skeleton';

const TarjetaResumen = ({ titulo, valor, tono = 'text-gray-900', activa = false, onClick, children }) => {
  const contenido = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{titulo}</p>
      <p className={`mt-2 text-2xl font-bold sm:text-3xl ${tono}`}>{valor}</p>
      {children}
    </>
  );
  const base = 'rounded-2xl border bg-white p-4 text-left shadow-sm sm:p-5';
  if (!onClick) return <div className={`${base} border-gray-200`}>{contenido}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`${base} transition hover:shadow-md ${activa ? 'border-rosewood ring-2 ring-rosewood/20' : 'border-gray-200'}`}>
      {contenido}
    </button>
  );
};

// Productos, stock total, agotados y bajo stock de TODO el catalogo; agotados y bajo stock filtran la lista.
const ResumenInventario = ({ resumen, loading, estado, onEstado }) => {
  if (loading && !resumen) {
    return <>{[1, 2, 3, 4].map((n) => <SkeletonCard key={n} />)}</>;
  }
  if (!resumen) return null;
  const alternar = (nuevo) => onEstado(estado === nuevo ? 'todos' : nuevo);
  return (
    <>
      <TarjetaResumen titulo="Productos" valor={resumen.total} />
      <TarjetaResumen titulo="Stock total" valor={`${resumen.stock_total} u`} />
      <TarjetaResumen titulo="Agotados" valor={resumen.agotados} tono="text-red-700" activa={estado === 'agotado'} onClick={() => alternar('agotado')} />
      <TarjetaResumen titulo="Bajo stock" valor={resumen.bajo_stock} tono="text-orange-600" activa={estado === 'bajo'} onClick={() => alternar('bajo')}>
        {resumen.urgentes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {resumen.urgentes.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-gray-700">{p.nombre}</span>
                <span className="ml-2 shrink-0 font-semibold text-orange-600">{p.stock_actual} u</span>
              </li>
            ))}
          </ul>
        )}
      </TarjetaResumen>
    </>
  );
};

export default ResumenInventario;
