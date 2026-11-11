import { ListChecks } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { formatMoney } from '../../utils/format';
import { describirVariacion, etiquetaCategoria, mesActual, nombreMes } from './gastosHelpers';

const Tarjeta = ({ titulo, valor, children }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{titulo}</p>
    <p className="mt-2 text-3xl font-bold text-gray-900">{valor}</p>
    {children}
  </div>
);

// Selector de mes + las tres cifras del mes elegido (todas calculadas por el servidor sobre ese mes completo).
export const ResumenTarjetas = ({ resumen, loading, mes, onMes }) => (
  <section aria-label="Resumen del mes" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-bold text-gray-900 first-letter:uppercase">{nombreMes(mes)}</h2>
      <div className="flex items-center gap-2">
        <label htmlFor="gastos-mes" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mes</label>
        <input id="gastos-mes" type="month" value={mes} max={mesActual()} onChange={(e) => onMes(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-rosewood focus:outline-none" />
        {mes !== mesActual() && (
          <button type="button" onClick={() => onMes(mesActual())} className="rounded-lg border border-rosewood px-3 py-1.5 text-xs font-semibold text-rosewood transition hover:bg-rosewood/5">Mes actual</button>
        )}
      </div>
    </div>

    {loading && !resumen ? (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((n) => <div key={n} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>)}
      </div>
    ) : resumen && (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Tarjeta titulo="Total del mes" valor={formatMoney(resumen.total)}>
          <p className={`mt-1 text-xs font-semibold ${describirVariacion(resumen).tono}`}>{describirVariacion(resumen).texto}</p>
        </Tarjeta>
        <Tarjeta titulo="Registros del mes" valor={resumen.registros}>
          {resumen.anulados > 0 && <p className="mt-1 text-xs text-gray-500">{resumen.anulados} anulado{resumen.anulados === 1 ? '' : 's'} no cuentan</p>}
        </Tarjeta>
        <Tarjeta titulo="Pagado en efectivo" valor={formatMoney(resumen.total_efectivo)}>
          <p className="mt-1 text-xs text-gray-500">Salió del cajón · otros medios: {formatMoney(resumen.total_otros_medios)}</p>
        </Tarjeta>
      </div>
    )}
  </section>
);

export const TopCategorias = ({ resumen }) => {
  const categorias = (resumen?.por_categoria ?? []).slice(0, 5);
  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-rosewood" />
        <h3 className="text-lg font-bold text-gray-900">Top categorías del mes</h3>
      </div>
      {categorias.length === 0 ? (
        <p className="text-sm text-gray-500">No hay gastos en este mes.</p>
      ) : (
        <div className="space-y-3">
          {categorias.map((item) => (
            <div key={item.categoria}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{etiquetaCategoria(item.categoria)} <span className="text-xs text-gray-400">({item.registros})</span></span>
                <span className="font-semibold text-gray-900">{formatMoney(item.total)}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-rosewood" style={{ width: `${resumen.total > 0 ? Math.min(100, (item.total / resumen.total) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
