import { CircleDollarSign, RotateCcw, Wallet } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import TramosDeuda from './dashboard/TramosDeuda';
import { useCarteraDashboard } from './dashboard/useCarteraDashboard';
import { nivelDeudaCartera, textoAntiguedad } from './nivelDeudaCartera';

const Tarjeta = ({ titulo, valor, tono = 'text-gray-900', children }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{titulo}</p>
    <p className={`mt-2 text-3xl font-bold ${tono}`}>{valor}</p>
    {children}
  </div>
);

const Panel = ({ etiqueta, titulo, icono: Icono, className = '', children }) => (
  <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{etiqueta}</p>
        <h2 className="mt-2 text-xl font-bold text-gray-900">{titulo}</h2>
      </div>
      {Icono && <Icono className="h-5 w-5 text-rosewood" aria-hidden="true" />}
    </div>
    <div className="mt-4">{children}</div>
  </div>
);

const BOTON = 'rounded-lg px-3 py-2 text-xs font-semibold transition';

// Ventas y cobrado de cartera por periodo: lo vendido (a credito y de contado) frente a lo que de verdad entro.
const TablaPeriodos = ({ ventas, cobrado, formatMoney }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[520px] text-left text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
          <th className="py-2 pr-3 font-semibold">Periodo</th>
          <th className="px-3 py-2 text-right font-semibold">Vendido</th>
          <th className="px-3 py-2 text-right font-semibold">A crédito</th>
          <th className="px-3 py-2 text-right font-semibold">De contado</th>
          <th className="py-2 pl-3 text-right font-semibold">Cobrado</th>
        </tr>
      </thead>
      <tbody>
        {[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']].map(([id, etiqueta]) => (
          <tr key={id} className="border-b border-gray-100">
            <td className="py-3 pr-3 font-semibold text-gray-900">{etiqueta}</td>
            <td className="px-3 py-3 text-right tabular-nums">
              {formatMoney(ventas[id].total)}
              <span className="block text-xs text-gray-500">{ventas[id].transacciones} venta{ventas[id].transacciones === 1 ? '' : 's'}</span>
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-amber-700">{formatMoney(ventas[id].a_credito)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatMoney(ventas[id].de_contado)}</td>
            <td className="py-3 pl-3 text-right font-semibold tabular-nums text-emerald-700">
              {formatMoney(cobrado[id].total)}
              <span className="block text-xs font-normal text-gray-500">{cobrado[id].abonos} cobro{cobrado[id].abonos === 1 ? '' : 's'}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Vacio = ({ children }) => (
  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-500">{children}</div>
);

// Dashboard de cartera: una sola peticion al servidor, con las cifras de cartera (no las de la tienda).
// `onCobrar` y `onVender` abren el cobro o la venta del cliente elegido.
const CarteraDashboardSection = ({ navigate, formatMoney, recargar, onCobrar, onVender }) => {
  const { datos, loading, error, reintentar } = useCarteraDashboard(recargar);

  if (loading && !datos) {
    return (
      <section className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((n) => <div key={n} className="rounded-2xl border border-gray-200 bg-white p-5"><Skeleton lines={2} /></div>)}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5"><Skeleton lines={4} /></div>
      </section>
    );
  }

  if (!datos) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p role="alert" className="text-sm font-semibold text-red-700">{error || 'No fue posible cargar el dashboard de cartera'}</p>
        <button type="button" onClick={reintentar} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reintentar
        </button>
      </section>
    );
  }

  const { ventas, cobrado, por_cobrar: porCobrar, mayores_deudores: deudores, mejores_clientes: mejores } = datos;
  const mayorDeuda = Math.max(1, Number(deudores[0]?.deuda_total || 1));
  const mayorCompra = Math.max(1, Number(mejores[0]?.compras_total || 1));

  return (
    <section className="space-y-6">
      {error && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No se pudo actualizar: {error}. Se muestran los últimos datos.</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tarjeta titulo="Por cobrar" valor={formatMoney(porCobrar.deuda_total)}>
          <p className="mt-1 text-xs text-gray-500">{porCobrar.clientes_con_deuda} cliente{porCobrar.clientes_con_deuda === 1 ? '' : 's'} con deuda · promedio {formatMoney(porCobrar.saldo_promedio)}</p>
        </Tarjeta>
        <Tarjeta titulo="Cobrado hoy" valor={formatMoney(cobrado.hoy.total)} tono="text-emerald-700">
          <p className="mt-1 text-xs text-gray-500">Semana {formatMoney(cobrado.semana.total)} · Mes {formatMoney(cobrado.mes.total)}</p>
        </Tarjeta>
        <Tarjeta titulo="Vendido hoy" valor={formatMoney(ventas.hoy.total)}>
          <p className="mt-1 text-xs text-gray-500">{ventas.hoy.transacciones} venta{ventas.hoy.transacciones === 1 ? '' : 's'} · {formatMoney(ventas.hoy.a_credito)} a crédito</p>
        </Tarjeta>
        <Tarjeta titulo="Clientes activos" valor={datos.clientes_activos}>
          <p className="mt-1 text-xs text-gray-500">{porCobrar.moroso.clientes} morosos · {porCobrar.alerta.clientes} en alerta</p>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel etiqueta="Ventas de cartera" titulo="Vendido y cobrado" className="xl:col-span-2">
          <TablaPeriodos ventas={ventas} cobrado={cobrado} formatMoney={formatMoney} />
        </Panel>
        <Panel etiqueta="Riesgo de cartera" titulo="Deuda por antigüedad" icono={Wallet}>
          <TramosDeuda porCobrar={porCobrar} formatMoney={formatMoney} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel etiqueta="Cobro rápido" titulo="Clientes con mayor deuda" icono={CircleDollarSign} className="xl:col-span-2">
          <div className="space-y-3">
            {deudores.map((cliente) => {
              const nivel = nivelDeudaCartera(cliente);
              const antiguedad = textoAntiguedad(cliente);
              return (
                <div key={cliente.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${nivel.bg} ${nivel.text}`}>
                        <span className={`h-2 w-2 rounded-full ${nivel.dot}`} />
                        {nivel.label}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{cliente.nombre}</p>
                        <p className="text-xs text-gray-500">Deuda: {formatMoney(cliente.deuda_total)}{antiguedad ? ` · ${antiguedad}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onCobrar(cliente)} aria-label={`Cobrar a ${cliente.nombre}`} className={`${BOTON} bg-rosewood text-white hover:opacity-90`}>Cobrar</button>
                      <button type="button" onClick={() => onVender(cliente)} aria-label={`Vender a ${cliente.nombre}`} className={`${BOTON} border border-gray-300 text-gray-700 hover:bg-gray-100`}>Vender</button>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-gray-200">
                    <div className={`h-full rounded-full ${nivel.bar}`} style={{ width: `${Math.max(2, (Number(cliente.deuda_total) / mayorDeuda) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {deudores.length === 0 && <Vacio>No hay clientes con deuda.</Vacio>}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel etiqueta="Actividad comercial" titulo="Mejores clientes">
            <div className="space-y-3">
              {mejores.map((cliente, indice) => (
                <div key={cliente.id} className="rounded-2xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{cliente.nombre}</p>
                      <p className="text-xs text-gray-500">{formatMoney(cliente.compras_total)} · {cliente.compras_cantidad} compra{cliente.compras_cantidad === 1 ? '' : 's'}</p>
                    </div>
                    <span className="rounded-full bg-rosewood/10 px-2.5 py-1 text-xs font-semibold text-rosewood">#{indice + 1}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-gray-200">
                    <div className="h-full rounded-full bg-rosewood" style={{ width: `${Math.max(4, (Number(cliente.compras_total) / mayorCompra) * 100)}%` }} />
                  </div>
                </div>
              ))}
              {mejores.length === 0 && <Vacio>Aún no hay compras registradas.</Vacio>}
            </div>
          </Panel>

          <Panel etiqueta="Accesos rápidos" titulo="Ir a">
            <div className="space-y-2">
              {[
                ['/cartera/cobrar', 'Cobrar cartera', 'Clientes con deuda y abonos.'],
                ['/cartera/venta', 'Registrar venta', 'Fiado o de contado.'],
                ['/cartera/clientes', 'Clientes', 'Registrar o editar clientes.'],
              ].map(([ruta, titulo, detalle]) => (
                <button key={ruta} type="button" onClick={() => navigate(ruta)} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-rosewood hover:bg-white">
                  <p className="text-sm font-bold text-gray-900">{titulo}</p>
                  <p className="text-xs text-gray-500">{detalle}</p>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
};

export default CarteraDashboardSection;
