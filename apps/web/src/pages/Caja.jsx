import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Lock, Unlock, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { abrirCaja, cerrarCaja, fetchCajaEstado } from '../api/cajaApi';
import ErrorMessage from '../components/ErrorMessage'
import SuccessMessage from '../components/SuccessMessage'
import { SkeletonCard } from '../components/Skeleton'

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Caja = () => {
  const { token, user } = useAuth();

  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [montoInicial, setMontoInicial] = useState('');
  const [montoCierre, setMontoCierre] = useState('');

  const loadEstado = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError('');

      const payload = await fetchCajaEstado();

      setEstado(payload);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el estado de caja');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadEstado();
  }, [loadEstado]);

  const cajaActual = estado?.caja_actual ?? null;
  const abierta = estado?.abierta ?? false;

  const saldoInicial = useMemo(() => {
    if (!cajaActual) return 0;
    return Number(cajaActual.monto_inicial || 0);
  }, [cajaActual]);

  const ventasEfectivo = useMemo(() => {
    if (!cajaActual) return 0;
    return Number(cajaActual.monto_ventas_efectivo || 0);
  }, [cajaActual]);

  const ventasTransferencia = useMemo(() => {
    if (!cajaActual) return 0;
    return Number(cajaActual.monto_ventas_transferencia || 0);
  }, [cajaActual]);

  const gastos = useMemo(() => {
    if (!cajaActual) return 0;
    return Number(cajaActual.monto_gastos || 0);
  }, [cajaActual]);

  const saldoEsperado = useMemo(() => {
    if (!cajaActual) return 0;
    return Number(cajaActual.saldo_esperado || 0);
  }, [cajaActual]);

  const handleAbrirCaja = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const raw = montoInicial.trim();
    if (!raw) {
      setError('Ingresa el monto inicial en efectivo');
      return;
    }

    const monto = Number(raw);
    if (!Number.isFinite(monto) || monto <= 0) {
      setError('El monto inicial debe ser un número válido mayor a cero');
      return;
    }

    try {
      setSubmitting(true);

      await abrirCaja({ monto_inicial: monto });

      setMontoInicial('');
      setSuccess('Caja abierta correctamente');
      await loadEstado();
    } catch (err) {
      setError(err.message || 'No se pudo abrir la caja');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCerrarCaja = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const raw = montoCierre.trim();
    if (!raw) {
      setError('Ingresa el monto de cierre');
      return;
    }

    const monto = Number(raw);
    if (!Number.isFinite(monto) || monto < 0) {
      setError('El monto de cierre debe ser un número válido mayor o igual a cero');
      return;
    }

    try {
      setSubmitting(true);

      await cerrarCaja({ monto_cierre: monto });

      setMontoCierre('');
      setSuccess('Caja cerrada correctamente');
      await loadEstado();
    } catch (err) {
      setError(err.message || 'No se pudo cerrar la caja');
    } finally {
      setSubmitting(false);
    }
  };

  const isSuperadmin = user?.role === 'superadmin';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Caja</h1>
          <p className="text-gray-600">Apertura y cierre de caja del turno</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      {/* Estado actual */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${abierta ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Estado</p>
          <p className={`mt-2 flex items-center gap-2 text-2xl font-bold sm:text-3xl ${abierta ? 'text-green-700' : 'text-gray-900'}`}>
            {abierta ? <><Unlock className="h-5 w-5 sm:h-6 sm:w-6" /> Abierta</> : <><Lock className="h-5 w-5 sm:h-6 sm:w-6" /> Cerrada</>}
          </p>
        </div>

        {abierta && cajaActual && (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Saldo esperado</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">{formatMoney(saldoEsperado)}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Abierta por</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">{cajaActual.abierto_por}</p>
              <p className="text-xs text-gray-500">{formatDateTime(cajaActual.fecha_apertura)}</p>
            </div>
          </>
        )}

        {!abierta && (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Último cierre</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
                {estado?.ultimo_cierre ? formatMoney(estado.ultimo_cierre.monto_cierre) : '-'}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Cerrado por</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
                {estado?.ultimo_cierre?.cerrado_por ?? '-'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Detalle de caja abierta */}
      {abierta && cajaActual && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Monto inicial</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatMoney(saldoInicial)}</p>
          </div>

          <div className="rounded-2xl border border-green-100 bg-green-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-green-600">Ventas efectivo</p>
            <p className="mt-2 text-2xl font-bold text-green-700">{formatMoney(ventasEfectivo)}</p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">Ventas transferencia</p>
            <p className="mt-2 text-2xl font-bold text-blue-700">{formatMoney(ventasTransferencia)}</p>
          </div>

          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-600">Gastos</p>
            <p className="mt-2 text-2xl font-bold text-red-700">{formatMoney(gastos)}</p>
          </div>
        </div>
      )}

      {/* Acciones */}
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Abrir caja */}
          {!abierta && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Unlock className="h-5 w-5 text-rosewood" />
                <h2 className="text-xl font-bold text-gray-900">Abrir caja</h2>
              </div>

              <form className="space-y-3" onSubmit={handleAbrirCaja}>
                <input
                  type="number"
                  min="1"
                  value={montoInicial}
                  onChange={(event) => setMontoInicial(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Monto inicial en efectivo"
                  required
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {submitting ? 'Abriendo caja...' : 'Abrir caja'}
                </button>
              </form>
            </section>
          )}

          {/* Cerrar caja */}
          {abierta && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-rosewood" />
                <h2 className="text-xl font-bold text-gray-900">Cerrar caja</h2>
              </div>

              <div className="mb-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                <p className="mb-1 flex justify-between">
                  <span>Monto inicial:</span>
                  <span className="font-semibold">{formatMoney(saldoInicial)}</span>
                </p>
                <p className="mb-1 flex justify-between">
                  <span>Ventas efectivo:</span>
                  <span className="font-semibold text-green-700">{formatMoney(ventasEfectivo)}</span>
                </p>
                <p className="mb-1 flex justify-between">
                  <span>Ventas transferencia:</span>
                  <span className="font-semibold text-blue-700">{formatMoney(ventasTransferencia)}</span>
                </p>
                <p className="mb-1 flex justify-between">
                  <span>Gastos:</span>
                  <span className="font-semibold text-red-700">{formatMoney(gastos)}</span>
                </p>
                <hr className="my-2 border-gray-200" />
                <p className="flex justify-between text-base">
                  <span className="font-bold">Saldo esperado:</span>
                  <span className="font-bold">{formatMoney(saldoEsperado)}</span>
                </p>
              </div>

              <form className="space-y-3" onSubmit={handleCerrarCaja}>
                <input
                  type="number"
                  min="0"
                  value={montoCierre}
                  onChange={(event) => setMontoCierre(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Monto final en caja"
                  required
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {submitting ? 'Cerrando caja...' : 'Cerrar caja'}
                </button>
              </form>
            </section>
          )}

          {/* Historial (solo superadmin) */}
          {isSuperadmin && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <History className="h-5 w-5 text-rosewood" />
                <h2 className="text-xl font-bold text-gray-900">Historial de cierres</h2>
              </div>

              {!estado?.ultimo_cierre ? (
                <p className="text-sm text-gray-500">No hay cierres previos.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                    <p className="mb-1 flex justify-between">
                      <span>Apertura:</span>
                      <span className="font-semibold">{formatDateTime(estado.ultimo_cierre.fecha_apertura)}</span>
                    </p>
                    <p className="mb-1 flex justify-between">
                      <span>Cierre:</span>
                      <span className="font-semibold">{formatDateTime(estado.ultimo_cierre.fecha_cierre)}</span>
                    </p>
                    <p className="mb-1 flex justify-between">
                      <span>Abierto por:</span>
                      <span className="font-semibold">{estado.ultimo_cierre.abierto_por}</span>
                    </p>
                    <p className="mb-1 flex justify-between">
                      <span>Cerrado por:</span>
                      <span className="font-semibold">{estado.ultimo_cierre.cerrado_por}</span>
                    </p>
                    <hr className="my-2 border-gray-200" />
                    <p className="flex justify-between text-base">
                      <span className="font-bold">Monto cierre:</span>
                      <span className="font-bold">{formatMoney(estado.ultimo_cierre.monto_cierre)}</span>
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default Caja;
