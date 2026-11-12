import { Link } from 'react-router-dom';
import { ChartColumn, RotateCcw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import Skeleton from '../components/Skeleton';
import { formatDateTime, formatMoney } from '../utils/format';
import { useDashboardVendedor } from './dashboard/useDashboardVendedor';

const Tarjeta = ({ titulo, valor, tono = 'text-gray-900', children }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{titulo}</p>
    <p className={`mt-2 text-3xl font-bold ${tono}`}>{valor}</p>
    {children}
  </div>
);

const Panel = ({ etiqueta, titulo, enlace, children }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{etiqueta}</p>
        <h2 className="mt-2 text-xl font-bold text-gray-900">{titulo}</h2>
      </div>
      {enlace && <Link to={enlace.a} className="text-xs font-semibold text-rosewood underline-offset-2 hover:underline">{enlace.texto}</Link>}
    </div>
    <div className="mt-4">{children}</div>
  </div>
);

const Pequeno = ({ children }) => <p className="mt-1 text-xs text-gray-500">{children}</p>;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Vendido y cobrado por periodo: lo vendido (de contado y a credito) frente a lo que de verdad entro.
const TablaPeriodos = ({ ventas, cobrado }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[520px] text-left text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
          <th className="py-2 pr-3 font-semibold">Periodo</th>
          <th className="px-3 py-2 text-right font-semibold">Vendido</th>
          <th className="px-3 py-2 text-right font-semibold">De contado</th>
          <th className="px-3 py-2 text-right font-semibold">A crédito</th>
          <th className="py-2 pl-3 text-right font-semibold">Cobrado</th>
        </tr>
      </thead>
      <tbody>
        {[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']].map(([id, etiqueta]) => (
          <tr key={id} className="border-b border-gray-100">
            <td className="py-3 pr-3 font-semibold text-gray-900">{etiqueta}</td>
            <td className="px-3 py-3 text-right tabular-nums">
              {formatMoney(ventas[id].total)}
              <span className="block text-xs text-gray-500">{plural(ventas[id].transacciones, 'venta', 'ventas')}</span>
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatMoney(ventas[id].de_contado)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-amber-700">{formatMoney(ventas[id].a_credito)}</td>
            <td className="py-3 pl-3 text-right font-semibold tabular-nums text-emerald-700">{formatMoney(cobrado[id].total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const TarjetaCaja = ({ caja }) => (
  caja.abierta ? (
    <Tarjeta titulo="Efectivo en caja" valor={formatMoney(caja.efectivo_esperado)} tono="text-emerald-700">
      <Pequeno>Turno de {caja.abierta_por} · base {formatMoney(caja.monto_inicial)}</Pequeno>
    </Tarjeta>
  ) : (
    <Tarjeta titulo="Caja" valor="Cerrada" tono="text-gray-500">
      <Pequeno><Link to="/caja" className="font-semibold text-rosewood underline-offset-2 hover:underline">Abrir la caja</Link> para empezar a vender.</Pequeno>
    </Tarjeta>
  )
);

const FiadoTienda = ({ fiado }) => (
  fiado.clientes_con_deuda === 0 ? (
    <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">Ningún cliente le debe a la tienda.</p>
  ) : (
    <div className="space-y-3">
      <p className="text-3xl font-bold text-gray-900">{formatMoney(fiado.deuda_total)}</p>
      <p className="text-sm text-gray-600">{plural(fiado.clientes_con_deuda, 'cliente con deuda', 'clientes con deuda')}</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-amber-50 p-2"><p className="text-xs font-semibold text-amber-700">En alerta</p><p className="text-lg font-bold text-amber-700">{fiado.en_alerta}</p></div>
        <div className="rounded-lg bg-red-50 p-2"><p className="text-xs font-semibold text-red-700">Morosos</p><p className="text-lg font-bold text-red-700">{fiado.morosos}</p></div>
      </div>
    </div>
  )
);

const StockTienda = ({ stock }) => (
  stock.urgentes.length === 0 ? (
    <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">Todo el inventario está por encima de su mínimo.</p>
  ) : (
    <div className="space-y-3">
      <p className="text-sm text-gray-600"><span className="font-bold text-red-700">{stock.agotados}</span> agotados · <span className="font-bold text-orange-600">{stock.bajo_stock}</span> con poco stock</p>
      <ul className="space-y-2">
        {stock.urgentes.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-gray-800">{p.nombre}</span>
            <span className={`shrink-0 font-semibold ${p.stock_actual === 0 ? 'text-red-700' : 'text-orange-600'}`}>{p.stock_actual === 0 ? 'Agotado' : `${p.stock_actual} u`}</span>
          </li>
        ))}
      </ul>
    </div>
  )
);

const MasVendidos = ({ productos }) => {
  if (productos.length === 0) return <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">Aún no hay ventas este mes.</p>;
  const mayor = Math.max(1, productos[0].unidades);
  return (
    <ul className="space-y-3">
      {productos.map((p, indice) => (
        <li key={p.nombre}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-semibold text-gray-900">{indice + 1}. {p.nombre}</span>
            <span className="shrink-0 text-gray-600">{plural(p.unidades, 'unidad', 'unidades')} · {formatMoney(p.total)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-rosewood" style={{ width: `${Math.max(4, (p.unidades / mayor) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

// Las anuladas se ven como anuladas: no son una venta mas.
const VentasRecientes = ({ ventas }) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-xl font-bold text-gray-900">Ventas recientes</h2>
      <Link to="/ventas" className="text-xs font-semibold text-rosewood underline-offset-2 hover:underline">Ir a Ventas</Link>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            {['Fecha', 'Cliente', 'Tipo', 'Método', 'Total', 'Saldo'].map((titulo) => <th key={titulo} className="px-3 py-3 font-semibold text-gray-700">{titulo}</th>)}
          </tr>
        </thead>
        <tbody>
          {ventas.length === 0 && (
            <tr><td colSpan="6" className="px-3 py-8 text-center text-gray-500">No hay ventas recientes para mostrar.</td></tr>
          )}
          {ventas.map((venta) => (
            <tr key={venta.venta_id} className={`border-b border-gray-100 ${venta.anulada ? 'bg-gray-50 text-gray-400' : ''}`}>
              <td className="px-3 py-3">{formatDateTime(venta.fecha)}</td>
              <td className="px-3 py-3 font-medium">{venta.cliente_nombre || 'Mostrador'}</td>
              <td className="px-3 py-3">
                {venta.anulada
                  ? <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">Anulada</span>
                  : (venta.es_fiado ? 'Fiado' : 'Contado')}
              </td>
              <td className="px-3 py-3">{venta.metodo_pago || '-'}</td>
              <td className={`px-3 py-3 font-semibold ${venta.anulada ? 'line-through' : 'text-gray-900'}`}>{formatMoney(venta.total)}</td>
              <td className="px-3 py-3">{venta.anulada ? '-' : formatMoney(venta.saldo_pendiente)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

// Dashboard del vendedor: solo la tienda. Las cifras salen del servidor; lo del modulo de cartera no aparece aqui.
const Dashboard = () => {
  const { token } = useAuth();
  const { datos, recientes, loading, error, reintentar } = useDashboardVendedor(token);

  const encabezado = (
    <div className="flex items-center gap-3">
      <ChartColumn className="h-8 w-8 text-rosewood" />
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Lo que pasa hoy en la tienda</p>
      </div>
    </div>
  );

  if (loading && !datos) {
    return (
      <div className="space-y-6" aria-busy="true">
        {encabezado}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((n) => <div key={n} className="rounded-2xl border border-gray-200 bg-white p-5"><Skeleton lines={2} /></div>)}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5"><Skeleton lines={4} /></div>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="space-y-6">
        {encabezado}
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p role="alert" className="text-sm font-semibold text-red-700">{error || 'No se pudo cargar el dashboard'}</p>
          <button type="button" onClick={reintentar} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reintentar
          </button>
        </section>
      </div>
    );
  }

  const { ventas, cobrado, gastos, caja, fiado_tienda: fiado, productos_mas_vendidos: vendidos, stock } = datos;
  const cobradoHoy = cobrado.hoy;

  return (
    <div className="space-y-6">
      {encabezado}
      {error && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No se pudo actualizar: {error}. Se muestran los últimos datos.</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tarjeta titulo="Vendido hoy" valor={formatMoney(ventas.hoy.total)}>
          <Pequeno>{plural(ventas.hoy.transacciones, 'venta', 'ventas')} · {formatMoney(ventas.hoy.a_credito)} a crédito</Pequeno>
        </Tarjeta>
        <Tarjeta titulo="Cobrado hoy" valor={formatMoney(cobradoHoy.total)} tono="text-emerald-700">
          <Pequeno>Efectivo {formatMoney(cobradoHoy.efectivo)} · Transf. {formatMoney(cobradoHoy.transferencia)}{cobradoHoy.tarjeta > 0 ? ` · Tarjeta ${formatMoney(cobradoHoy.tarjeta)}` : ''}</Pequeno>
        </Tarjeta>
        <TarjetaCaja caja={caja} />
        <Tarjeta titulo="Gastos hoy" valor={formatMoney(gastos.hoy)} tono="text-red-700">
          <Pequeno>Este mes {formatMoney(gastos.mes)}</Pequeno>
        </Tarjeta>
      </div>

      <Panel etiqueta="Ventas de la tienda" titulo="Vendido y cobrado">
        <TablaPeriodos ventas={ventas} cobrado={cobrado} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel etiqueta="Los que más salen" titulo="Más vendidos del mes"><MasVendidos productos={vendidos} /></Panel>
        <Panel etiqueta="Fiado de tienda" titulo="Clientes que deben" enlace={{ a: '/clientes', texto: 'Ver clientes' }}><FiadoTienda fiado={fiado} /></Panel>
        <Panel etiqueta="Inventario" titulo="Por agotarse" enlace={{ a: '/inventario', texto: 'Ver inventario' }}><StockTienda stock={stock} /></Panel>
      </div>

      <VentasRecientes ventas={recientes} />
    </div>
  );
};

export default Dashboard;
