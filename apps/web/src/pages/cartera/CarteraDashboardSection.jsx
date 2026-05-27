import { CalendarDays, CircleDollarSign, Wallet } from 'lucide-react';

const NIVEL_DEUDA = {
  verde: { max: 200000, label: 'Al día', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  amarillo: { max: 400000, label: 'Alerta', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' },
  rojo: { max: Infinity, label: 'Moroso', dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500' },
};

const nivelDeuda = (deuda) => {
  const monto = Number(deuda || 0);
  if (monto <= NIVEL_DEUDA.verde.max) return NIVEL_DEUDA.verde;
  if (monto <= NIVEL_DEUDA.amarillo.max) return NIVEL_DEUDA.amarillo;
  return NIVEL_DEUDA.rojo;
};

const DEUDA_MAX_REF = 400000;

const CarteraDashboardSection = ({
  resumenCartera,
  dashboardVentas,
  clientesRanking,
  clientesMasCompras,
  clientesAccesoRapido,
  navigate,
  formatMoney,
}) => {
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Clientes totales</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{resumenCartera.clientes_totales}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Clientes con deuda</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{resumenCartera.clientes_con_deuda}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Deuda total</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumenCartera.deuda_total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Ventas del negocio</p>
              <h2 className="mt-2 text-xl font-bold text-gray-900">Resumen operativo</h2>
            </div>
            <CalendarDays className="h-5 w-5 text-rosewood" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Ventas diarias</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{formatMoney(dashboardVentas.ventas_diarias)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Ventas semanales</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{formatMoney(dashboardVentas.ventas_semanales)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Ventas mensuales</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{formatMoney(dashboardVentas.ventas_mensuales)}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Transacciones diarias</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{dashboardVentas.transacciones_diarias}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Transacciones semanales</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{dashboardVentas.transacciones_semanales}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Transacciones mensuales</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{dashboardVentas.transacciones_mensuales}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Riesgo de cartera</p>
              <h2 className="mt-2 text-xl font-bold text-gray-900">Alertas clave</h2>
            </div>
            <Wallet className="h-5 w-5 text-rosewood" />
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-red-50 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-red-700">Clientes morosos</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{resumenCartera.clientes_alto_riesgo}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-amber-700">Clientes en alerta</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{resumenCartera.clientes_riesgo_medio || 0}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-emerald-700">Saldo promedio con deuda</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(resumenCartera.saldo_promedio)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Ranking visual</p>
              <h2 className="mt-2 text-xl font-bold text-gray-900">Clientes con mayor deuda</h2>
            </div>
            <Wallet className="h-5 w-5 text-rosewood" />
          </div>

          <div className="mt-4 space-y-3">
            {clientesRanking.map((cliente, index) => {
              const deuda = Number(cliente.deuda_total || 0);
              const nivel = nivelDeuda(deuda);
              const porcentaje = Math.min(100, (deuda / DEUDA_MAX_REF) * 100);

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
                        <p className="text-xs text-gray-500">Deuda: {formatMoney(deuda)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full ${nivel.bar}`}
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {clientesRanking.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-500">
                No hay clientes con deuda para mostrar el ranking.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Accesos rápidos</p>
            <h2 className="mt-2 text-xl font-bold text-gray-900">Cobrar y vender</h2>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate('/cartera/cobrar')}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-rosewood hover:bg-white"
            >
              <p className="text-sm font-bold text-gray-900">Cobrar cartera</p>
              <p className="mt-1 text-xs text-gray-500">Ver tarjetas rápidas de clientes con deuda.</p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/cartera/venta')}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-rosewood hover:bg-white"
            >
              <p className="text-sm font-bold text-gray-900">Registrar venta</p>
              <p className="mt-1 text-xs text-gray-500">Abrir flujo de venta con fiado o contado.</p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/cartera/clientes')}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-rosewood hover:bg-white"
            >
              <p className="text-sm font-bold text-gray-900">Registrar cliente</p>
              <p className="mt-1 text-xs text-gray-500">Alta rápida desde modal.</p>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Actividad comercial</p>
              <h2 className="mt-2 text-xl font-bold text-gray-900">Clientes con más compras</h2>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {clientesMasCompras.map((cliente, index) => {
              const comprasCantidad = Number(cliente.compras_cantidad || 0);
              const comprasTotal = Number(cliente.compras_total || 0);
              const maxCompras = Math.max(1, Number(clientesMasCompras[0]?.compras_cantidad || 1));
              const ancho = Math.max(8, Math.min(100, (comprasCantidad / maxCompras) * 100));

              return (
                <div key={`compras-${cliente.id}`} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{cliente.nombre}</p>
                      <p className="text-xs text-gray-500">Compras: {comprasCantidad} · Total: {formatMoney(comprasTotal)}</p>
                    </div>
                    <span className="rounded-full bg-rosewood/10 px-2.5 py-1 text-xs font-semibold text-rosewood">
                      #{index + 1}
                    </span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-rosewood"
                      style={{ width: `${ancho}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {clientesMasCompras.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-500 md:col-span-2">
                Aún no hay compras registradas para mostrar este ranking.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Cobro rápido</p>
              <h2 className="mt-2 text-xl font-bold text-gray-900">Clientes con deuda</h2>
            </div>
            <CircleDollarSign className="h-5 w-5 text-rosewood" />
          </div>

          <div className="mt-4 space-y-3">
            {clientesAccesoRapido.slice(0, 3).map((cliente) => (
              <div key={`quick-${cliente.id}`} className="rounded-2xl border border-gray-200 p-4">
                <p className="text-sm font-bold text-gray-900">{cliente.nombre}</p>
                <p className="mt-1 text-xs text-gray-500">Deuda: {formatMoney(cliente.deuda_total || 0)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/cartera/cobrar')}
                    className="rounded-lg bg-rosewood px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                  >
                    Cobrar
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/cartera/venta')}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                  >
                    Vender
                  </button>
                </div>
              </div>
            ))}

            {clientesAccesoRapido.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-500">
                No hay clientes para cobro rápido.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CarteraDashboardSection;
