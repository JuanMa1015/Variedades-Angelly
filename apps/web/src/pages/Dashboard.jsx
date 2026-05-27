import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChartColumn, Clock3, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiGet } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage'
import Skeleton from '../components/Skeleton'

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const emptyResumen = {
  ventas_diarias: 0,
  ventas_semanales: 0,
  ventas_mensuales: 0,
  transacciones_diarias: 0,
  transacciones_semanales: 0,
  transacciones_mensuales: 0,
  pagos_efectivo: 0,
  pagos_transferencia: 0,
};

const emptyCarteraResumen = {
  clientes_totales: 0,
  clientes_con_deuda: 0,
  deuda_total: 0,
  clientes_alto_riesgo: 0,
  clientes_riesgo_medio: 0,
};

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
};

const Dashboard = () => {
  const { token, isAdmin } = useAuth();

  const [resumen, setResumen] = useState(emptyResumen);
  const [carteraResumen, setCarteraResumen] = useState(emptyCarteraResumen);
  const [ventasRecientes, setVentasRecientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setResumen(emptyResumen);
      setCarteraResumen(emptyCarteraResumen);
      setVentasRecientes([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError('');

        const [resumenPayload, ventasPayload, carteraPayload] = await Promise.all([
          apiGet('/api/dashboard/resumen', { signal: controller.signal }),
          apiGet('/api/ventas', { signal: controller.signal }),
          isAdmin ? apiGet('/api/clientes', { signal: controller.signal }) : Promise.resolve([]),
        ]);

        if (controller.signal.aborted) return;

        setResumen({
          ...emptyResumen,
          ...(typeof resumenPayload === 'object' && resumenPayload ? resumenPayload : {}),
        });

        setVentasRecientes(Array.isArray(ventasPayload) ? ventasPayload.slice(0, 8) : []);

        if (isAdmin) {
          const clientes = Array.isArray(carteraPayload) ? carteraPayload : [];
          const clientesConDeuda = clientes.filter(
            (cliente) => Number(cliente.deuda_total || 0) > 0,
          ).length;
          const deudaTotal = clientes.reduce(
            (acc, cliente) => acc + Number(cliente.deuda_total || 0),
            0,
          );

          setCarteraResumen({
            clientes_totales: clientes.length,
            clientes_con_deuda: clientesConDeuda,
            deuda_total: deudaTotal,
          });
        } else {
          setCarteraResumen(emptyCarteraResumen);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || 'No se pudo cargar el dashboard');
        setResumen(emptyResumen);
        setCarteraResumen(emptyCarteraResumen);
        setVentasRecientes([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadDashboard();
    return () => controller.abort();
  }, [token, isAdmin]);

  const metricasDerivadas = useMemo(() => {
    const promedioPorTransaccion = resumen.transacciones_mensuales > 0
      ? resumen.ventas_mensuales / resumen.transacciones_mensuales
      : 0;

    const participacionSemanal = resumen.ventas_mensuales > 0
      ? (resumen.ventas_semanales / resumen.ventas_mensuales) * 100
      : 0;

    const participacionDiaria = resumen.ventas_mensuales > 0
      ? (resumen.ventas_diarias / resumen.ventas_mensuales) * 100
      : 0;

    return {
      promedioPorTransaccion,
      participacionSemanal,
      participacionDiaria,
    };
  }, [resumen]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ChartColumn className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Resumen diario, semanal y mensual del negocio</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {isAdmin && (
        <section className="rounded-2xl border border-rosewood/20 bg-gradient-to-r from-blush-100 via-white to-gold-100 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rosewood">Inicio Admin</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">Accesos rápidos de administración</h2>
              <p className="mt-1 text-sm text-gray-600">Gestiona cartera y ventas desde un solo panel.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
              Acceso completo habilitado
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Módulo Cartera</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">Clientes y deuda pendiente</p>
                </div>
                <span className="rounded-full bg-blush-100 px-2.5 py-1 text-xs font-semibold text-rosewood">Admin</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Clientes</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{carteraResumen.clientes_totales}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Con deuda</p>
                  <p className="mt-1 text-lg font-bold text-amber-700">{carteraResumen.clientes_con_deuda}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Deuda total</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{formatMoney(carteraResumen.deuda_total)}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-emerald-50 p-2 text-center">
                  <p className="text-xs font-semibold text-emerald-700">Al día</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {Math.max(0, carteraResumen.clientes_con_deuda - (carteraResumen.clientes_alto_riesgo || 0) - (carteraResumen.clientes_riesgo_medio || 0))}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 p-2 text-center">
                  <p className="text-xs font-semibold text-amber-700">Alerta</p>
                  <p className="text-lg font-bold text-amber-700">{carteraResumen.clientes_riesgo_medio || 0}</p>
                </div>
                <div className="rounded-lg bg-red-50 p-2 text-center">
                  <p className="text-xs font-semibold text-red-700">Moroso</p>
                  <p className="text-lg font-bold text-red-700">{carteraResumen.clientes_alto_riesgo || 0}</p>
                </div>
              </div>

              <Link
                to="/cartera"
                className="mt-4 inline-flex items-center rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Abrir Cartera
              </Link>
            </article>

            <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Módulo Ventas</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">Punto de venta y movimiento diario</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Operativo</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Transacciones hoy</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{resumen.transacciones_diarias}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Ventas hoy</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{formatMoney(resumen.ventas_diarias)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Ventas mes</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{formatMoney(resumen.ventas_mensuales)}</p>
                </div>
              </div>

              <Link
                to="/ventas"
                className="mt-4 inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Abrir Ventas
              </Link>
            </article>
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Skeleton lines={2} /></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="kpi-glass rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Ventas diarias</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumen.ventas_diarias)}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Ventas semanales</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumen.ventas_semanales)}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Ventas mensuales</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumen.ventas_mensuales)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-gray-600">
                <ReceiptText className="h-4 w-4" />
                <p className="text-sm font-semibold">Transacciones del día</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{resumen.transacciones_diarias}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-gray-600">
                <CalendarDays className="h-4 w-4" />
                <p className="text-sm font-semibold">Transacciones de la semana</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{resumen.transacciones_semanales}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-gray-600">
                <Clock3 className="h-4 w-4" />
                <p className="text-sm font-semibold">Transacciones del mes</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{resumen.transacciones_mensuales}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Dinero en efectivo</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumen.pagos_efectivo)}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Dinero por transferencia</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumen.pagos_transferencia)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Promedio por transacción (mes)</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {formatMoney(metricasDerivadas.promedioPorTransaccion)}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Participación semanal en el mes</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {metricasDerivadas.participacionSemanal.toFixed(1)}%
              </p>
              <div className="mt-3 h-2 rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-rosewood"
                  style={{ width: `${Math.min(100, metricasDerivadas.participacionSemanal)}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Participación diaria en el mes</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {metricasDerivadas.participacionDiaria.toFixed(1)}%
              </p>
              <div className="mt-3 h-2 rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gold-200"
                  style={{ width: `${Math.min(100, metricasDerivadas.participacionDiaria)}%` }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Ventas recientes</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-3 font-semibold text-gray-700">Fecha</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Cliente</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Tipo</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Método</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Total</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6" className="px-3 py-8">
                     <Skeleton lines={1} />
                   </td>
                 </tr>
               )}

              {!loading && ventasRecientes.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-3 py-8 text-center text-gray-500">
                     No hay ventas recientes para mostrar.
                   </td>
                 </tr>
               )}

              {!loading && ventasRecientes.map((venta) => (
                <tr key={venta.venta_id} className="border-b border-gray-100">
                  <td className="px-3 py-3 text-gray-700">{formatDateTime(venta.fecha)}</td>
                  <td className="px-3 py-3 font-medium text-gray-900">{venta.cliente_nombre || 'Mostrador'}</td>
                  <td className="px-3 py-3 text-gray-700">
                    {venta.es_fiado ? `Fiado (${venta.fiado_origen || 'sin origen'})` : 'Contado'}
                  </td>
                  <td className="px-3 py-3 text-gray-700">{venta.metodo_pago || '-'}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(venta.total)}</td>
                  <td className="px-3 py-3 text-gray-700">{formatMoney(venta.saldo_pendiente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
