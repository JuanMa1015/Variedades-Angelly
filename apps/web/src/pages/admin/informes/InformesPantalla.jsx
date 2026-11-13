import { BarChart3 } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import ErrorMessage from '../../../components/ErrorMessage';
import Skeleton from '../../../components/Skeleton';
import { formatMoney } from '../../../utils/format';
import { PERIODOS } from './periodos';
import { useInformes } from './useInformes';

const campo = 'rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-rosewood focus:outline-none';

const Tarjeta = ({ titulo, valor, nota, tono = 'text-gray-900' }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{titulo}</p>
    <p className={`mt-2 text-2xl font-bold ${tono}`}>{valor}</p>
    {nota && <p className="mt-1 text-xs text-gray-500">{nota}</p>}
  </div>
);

// Tabla de ranking con la misma forma para vendedores y productos.
const Ranking = ({ titulo, columnas, filas, vacio = 'No hay datos en este periodo' }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
    <h3 className="mb-3 text-base font-bold text-gray-900">{titulo}</h3>
    {filas.length === 0 ? (
      <p className="py-6 text-center text-sm text-gray-500">{vacio}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.1em] text-gray-500">
              {columnas.map((c) => <th key={c.clave} className={`px-2 py-2 ${c.derecha ? 'text-right' : ''}`}>{c.texto}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.id} className="border-b border-gray-100 text-gray-800">
                {columnas.map((c) => <td key={c.clave} className={`px-2 py-2 ${c.derecha ? 'text-right' : ''}`}>{c.valor(fila)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const COLUMNAS_PRODUCTO = [
  { clave: 'producto', texto: 'Producto', valor: (f) => f.producto },
  { clave: 'unidades', texto: 'Unidades', derecha: true, valor: (f) => f.unidades_vendidas },
  { clave: 'total', texto: 'Total', derecha: true, valor: (f) => formatMoney(f.total_vendido) },
];
const COLUMNAS_VENDEDOR = [
  { clave: 'vendedor', texto: 'Vendedor', valor: (f) => f.vendedor },
  { clave: 'ventas', texto: 'Ventas', derecha: true, valor: (f) => f.ventas },
  { clave: 'total', texto: 'Total', derecha: true, valor: (f) => formatMoney(f.total_vendido) },
];
const conId = (lista, clave) => lista.map((fila) => ({ ...fila, id: fila[clave] }));

const ventasTexto = (v) => `${v.transacciones} ${v.transacciones === 1 ? 'venta' : 'ventas'} · a crédito ${formatMoney(v.a_credito)}`;

const detalleCobrado = (c) => `Efectivo ${formatMoney(c.efectivo)} · Transferencia ${formatMoney(c.transferencia)} · Tarjeta ${formatMoney(c.tarjeta)}`;

const Seccion = ({ titulo, descripcion, children }) => (
  <section aria-label={titulo} className="space-y-4">
    <div>
      <h2 className="text-xl font-bold text-gray-900">{titulo}</h2>
      <p className="text-sm text-gray-500">{descripcion}</p>
    </div>
    {children}
  </section>
);

const InformesPantalla = () => {
  const { token } = useAuth();
  const { periodo, elegirPeriodo, rango, setRango, rangoValido, informe, loading, error, cargar } = useInformes(token);
  const tienda = informe?.tienda;
  const cartera = informe?.cartera;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><BarChart3 className="h-6 w-6 text-rosewood" /> Informes</h1>
        <p className="text-sm text-gray-600">
          «Vendido» es lo facturado; «Cobrado» es el dinero que de verdad entró. Una venta a crédito cuenta como vendida y solo como cobrada cuando se abona.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={periodo === p.id}
              onClick={() => elegirPeriodo(p.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${periodo === p.id ? 'bg-rosewood text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              {p.texto}
            </button>
          ))}
        </div>
        {periodo === 'personalizado' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
              Desde
              <input aria-label="Desde" type="date" value={rango.desde} max={rango.hasta || undefined} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
              Hasta
              <input aria-label="Hasta" type="date" value={rango.hasta} min={rango.desde || undefined} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} className={campo} />
            </label>
            {!rangoValido && <p className="text-sm text-amber-700">Elige una fecha inicial y una final (la inicial no puede ser posterior).</p>}
          </div>
        )}
        {informe && <p className="text-xs text-gray-500">Del {informe.periodo.desde} al {informe.periodo.hasta}</p>}
      </div>

      {error ? (
        <div className="space-y-3">
          <ErrorMessage message={error} />
          <button type="button" onClick={() => cargar()} className="rounded-full bg-rosewood px-4 py-2 text-sm font-semibold text-white">Reintentar</button>
        </div>
      ) : !informe ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className={`space-y-8 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <Seccion titulo="Tienda" descripcion="Ventas del punto de venta, con la caja del vendedor.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tarjeta titulo="Vendido" valor={formatMoney(tienda.ventas.total)} nota={ventasTexto(tienda.ventas)} />
              <Tarjeta titulo="Cobrado" valor={formatMoney(tienda.cobrado.total)} nota={detalleCobrado(tienda.cobrado)} tono="text-emerald-700" />
              <Tarjeta titulo="Gastos" valor={formatMoney(tienda.gastos)} tono="text-red-700" />
              <Tarjeta titulo="Cobrado menos gastos" valor={formatMoney(tienda.cobrado_menos_gastos)} tono={tienda.cobrado_menos_gastos < 0 ? 'text-red-700' : 'text-gray-900'} nota={`Fiado por cobrar hoy: ${formatMoney(tienda.por_cobrar)}`} />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Ranking titulo="Vendedores con más ventas" columnas={COLUMNAS_VENDEDOR} filas={conId(tienda.vendedores, 'vendedor')} />
              <Ranking titulo="Productos más vendidos" columnas={COLUMNAS_PRODUCTO} filas={conId(tienda.mas_vendidos, 'producto_id')} />
              <Ranking titulo="Productos menos vendidos" columnas={COLUMNAS_PRODUCTO} filas={conId(tienda.menos_vendidos, 'producto_id')} vacio="No hay productos activos" />
            </div>
          </Seccion>

          <Seccion titulo="Cartera" descripcion="Ventas y cobros del módulo de cartera, con su propia cuenta.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tarjeta titulo="Vendido" valor={formatMoney(cartera.ventas.total)} nota={ventasTexto(cartera.ventas)} />
              <Tarjeta titulo="Cobrado" valor={formatMoney(cartera.cobrado.total)} nota={detalleCobrado(cartera.cobrado)} tono="text-emerald-700" />
              <Tarjeta titulo="Por cobrar" valor={formatMoney(cartera.por_cobrar)} nota="Deuda total de los clientes hoy" tono="text-amber-700" />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Ranking titulo="Productos más vendidos" columnas={COLUMNAS_PRODUCTO} filas={conId(cartera.mas_vendidos, 'producto_id')} />
              <Ranking titulo="Productos menos vendidos" columnas={COLUMNAS_PRODUCTO} filas={conId(cartera.menos_vendidos, 'producto_id')} vacio="No hay productos activos" />
            </div>
          </Seccion>
        </div>
      )}
    </div>
  );
};

export default InformesPantalla;
