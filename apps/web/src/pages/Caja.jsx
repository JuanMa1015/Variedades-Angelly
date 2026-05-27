import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit, History, Lock, Trash2, Unlock, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { abrirCaja, cerrarCaja, deleteCaja, fetchCajaEstado, fetchCajaHistorial, fetchVentasPorRango, updateCaja } from '../api/cajaApi';
import ErrorMessage from '../components/ErrorMessage'
import SuccessMessage from '../components/SuccessMessage'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import useConfirm from '../components/useConfirm'

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

const formatDateTime = (value) => {
  if (value == null) return '-';
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

const Caja = () => {
  const { token, user } = useAuth();
  const { confirm, ConfirmModal } = useConfirm();

  const [estado, setEstado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [montoInicial, setMontoInicial] = useState('');
  const [montoCierre, setMontoCierre] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCaja, setEditingCaja] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [expandedCajaId, setExpandedCajaId] = useState(null);
  const [ventasPorCaja, setVentasPorCaja] = useState({});
  const [loadingVentas, setLoadingVentas] = useState({});

  const isSuperadmin = user?.role === 'superadmin';

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

  const loadHistorial = useCallback(async () => {
    if (!token) return;

    try {
      setLoadingHistorial(true);

      const payload = await fetchCajaHistorial();

      setHistorial(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial de caja');
    } finally {
      setLoadingHistorial(false);
    }
  }, [token]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadEstado(), loadHistorial()]);
  }, [loadEstado, loadHistorial]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const cajaActual = estado?.caja_actual ?? null;
  const abierta = estado?.abierta ?? false;

  useEffect(() => {
    if (!abierta || !cajaActual) return;
    if (ventasPorCaja[cajaActual.id]) return;

    const load = async () => {
      setLoadingVentas((prev) => ({ ...prev, [cajaActual.id]: true }));
      try {
        const ventas = await fetchVentasPorRango({
          fecha_desde: cajaActual.fecha_apertura,
          fecha_hasta: new Date().toISOString(),
        });
        setVentasPorCaja((prev) => ({ ...prev, [cajaActual.id]: Array.isArray(ventas) ? ventas : [] }));
      } catch {
        setVentasPorCaja((prev) => ({ ...prev, [cajaActual.id]: [] }));
      } finally {
        setLoadingVentas((prev) => ({ ...prev, [cajaActual.id]: false }));
      }
    };
    load();
  }, [abierta, cajaActual]);

  const saldoEsperado = useMemo(() => {
    if (!cajaActual) return 0;
    return Number(cajaActual.saldo_esperado || 0);
  }, [cajaActual]);

  const loadVentasForCaja = async (caja) => {
    const cajaId = caja.id;
    if (ventasPorCaja[cajaId]) return;

    setLoadingVentas((prev) => ({ ...prev, [cajaId]: true }));

    try {
      const hasta = caja.fecha_cierre || new Date().toISOString();
      const ventas = await fetchVentasPorRango({
        fecha_desde: caja.fecha_apertura,
        fecha_hasta: hasta,
      });
      setVentasPorCaja((prev) => ({ ...prev, [cajaId]: Array.isArray(ventas) ? ventas : [] }));
    } catch {
      setVentasPorCaja((prev) => ({ ...prev, [cajaId]: [] }));
    } finally {
      setLoadingVentas((prev) => ({ ...prev, [cajaId]: false }));
    }
  };

  const toggleExpand = (caja) => {
    if (expandedCajaId === caja.id) {
      setExpandedCajaId(null);
    } else {
      setExpandedCajaId(caja.id);
      loadVentasForCaja(caja);
    }
  };

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
      await loadAll();
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
      await loadAll();
    } catch (err) {
      setError(err.message || 'No se pudo cerrar la caja');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (caja) => {
    setEditingCaja(caja);
    setEditForm({
      monto_inicial: String(Number(caja.monto_inicial) || ''),
      monto_cierre: caja.monto_cierre != null ? String(Number(caja.monto_cierre)) : '',
      observaciones: caja.observaciones || '',
      estado: caja.esta_abierta ? 'abierta' : 'cerrada',
    });
    setError('');
    setSuccess('');
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingCaja(null);
    setEditForm({});
  };

  const handleEditChange = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!editingCaja) return;

    setSavingEdit(true);
    setError('');
    setSuccess('');

    try {
      const payload = {};

      if (editForm.monto_inicial !== '') {
        const val = Number(editForm.monto_inicial);
        if (!Number.isFinite(val) || val <= 0) {
          setError('El monto inicial debe ser mayor a cero');
          setSavingEdit(false);
          return;
        }
        payload.monto_inicial = val;
      }

      if (editForm.monto_cierre !== '') {
        const val = Number(editForm.monto_cierre);
        if (!Number.isFinite(val) || val < 0) {
          setError('El monto de cierre no puede ser negativo');
          setSavingEdit(false);
          return;
        }
        payload.monto_cierre = val;
      }

      if (editForm.observaciones !== (editingCaja.observaciones || '')) {
        payload.observaciones = editForm.observaciones || null;
      }

      if (editForm.estado !== (editingCaja.esta_abierta ? 'abierta' : 'cerrada')) {
        payload.estado = editForm.estado;
      }

      if (Object.keys(payload).length === 0) {
        setError('No hay cambios para guardar');
        setSavingEdit(false);
        return;
      }

      await updateCaja(editingCaja.id, payload);

      setSuccess('Registro de caja actualizado correctamente');
      closeEditModal();
      await loadAll();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el registro');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (caja) => {
    const confirmed = await confirm({ title: 'Eliminar registro', message: `¿Eliminar registro de caja #${caja.id} del ${formatDateTime(caja.fecha_apertura)}?` });
    if (!confirmed) return;

    try {
      setError('');
      setSuccess('');

      await deleteCaja(caja.id);

      setSuccess('Registro de caja eliminado correctamente');
      await loadAll();
    } catch (err) {
      setError(err.message || 'No fue posible eliminar el registro');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Caja</h1>
          <p className="text-gray-600">Apertura, cierre y gestión de caja del turno</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      {/* Barra de estado compacta */}
      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm sm:p-5 ${abierta ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className={`flex items-center gap-2 text-lg font-bold sm:text-xl ${abierta ? 'text-green-700' : 'text-gray-900'}`}>
          {abierta ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          Caja {abierta ? 'Abierta' : 'Cerrada'}
        </div>

        {abierta && cajaActual && (
          <>
            <span className="hidden text-gray-300 sm:inline">|</span>
            <span className="text-sm text-gray-600">
              {cajaActual.abierto_por} — {formatDateTime(cajaActual.fecha_apertura)}
            </span>
            <span className="hidden text-gray-300 sm:inline">|</span>
            <span className="text-sm font-semibold text-gray-900">
              Saldo esperado: {formatMoney(saldoEsperado)}
            </span>
          </>
        )}

        {!abierta && estado?.ultimo_cierre && (
          <>
            <span className="hidden text-gray-300 sm:inline">|</span>
            <span className="text-sm text-gray-600">
              Último cierre: {formatMoney(estado.ultimo_cierre.monto_cierre)} por {estado.ultimo_cierre.cerrado_por}
            </span>
          </>
        )}
      </div>

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
                  <span className="font-semibold">{formatMoney(cajaActual?.monto_inicial)}</span>
                </p>
                <p className="mb-1 flex justify-between">
                  <span>Ventas efectivo:</span>
                  <span className="font-semibold text-green-700">{formatMoney(cajaActual?.monto_ventas_efectivo)}</span>
                </p>
                <p className="mb-1 flex justify-between">
                  <span>Ventas transferencia:</span>
                  <span className="font-semibold text-blue-700">{formatMoney(cajaActual?.monto_ventas_transferencia)}</span>
                </p>
                <p className="mb-1 flex justify-between">
                  <span>Gastos:</span>
                  <span className="font-semibold text-red-700">{formatMoney(cajaActual?.monto_gastos)}</span>
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
                  step="any"
                  value={montoCierre}
                  onChange={(event) => setMontoCierre(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Monto final en caja"
                  required
                />

                {montoCierre.trim() && (
                  (() => {
                    const cierre = Number(montoCierre);
                    const diff = cierre - saldoEsperado;
                    const isCuadrado = Math.abs(diff) < 0.01;
                    return (
                      <div className={`rounded-lg border p-3 text-sm ${isCuadrado ? 'border-green-200 bg-green-50' : diff > 0 ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}`}>
                        <p className="flex justify-between">
                          <span className="font-semibold">Descuadre:</span>
                          <span className={`font-bold ${isCuadrado ? 'text-green-700' : diff > 0 ? 'text-yellow-700' : 'text-red-700'}`}>
                            {isCuadrado ? '✓ Cuadrado' : `${diff > 0 ? '+' : ''}${formatMoney(diff)}`}
                          </span>
                        </p>
                        {!isCuadrado && (
                          <p className="mt-1 text-xs text-gray-600">
                            {diff > 0 ? 'Sobra dinero en caja' : 'Falta dinero en caja'}
                          </p>
                        )}
                      </div>
                    );
                  })()
                )}

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
        </div>
      )}

      {/* Ventas del turno actual */}
      {abierta && cajaActual && (
        <section className="rounded-2xl border border-blush-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-rosewood" />
            <h2 className="text-xl font-bold text-gray-900">Ventas del turno</h2>
          </div>

          {loadingVentas[cajaActual.id] ? (
            <Skeleton lines={2} />
          ) : !ventasPorCaja[cajaActual.id] || ventasPorCaja[cajaActual.id].length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">No hay ventas registradas en este turno.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-blush-100 text-rosewood">
                    <th className="rounded-tl-2xl px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Método</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="rounded-tr-2xl px-4 py-3 font-semibold">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasPorCaja[cajaActual.id].map((venta, index) => (
                    <tr key={venta.venta_id} className={`border-b border-blush-100 transition hover:bg-blush-100/30 ${index % 2 === 0 ? 'bg-white' : 'bg-blush-100/10'}`}>
                      <td className="px-4 py-3 font-medium text-rosewood">{venta.venta_id}</td>
                      <td className="px-4 py-3 text-gray-700">{venta.cliente_nombre || 'Mostrador'}</td>
                      <td className="px-4 py-3">
                        {venta.metodo_pago === 'efectivo' ? (
                          <span className="rounded-full bg-rosewood/10 px-2.5 py-0.5 text-xs font-semibold text-rosewood">Efectivo</span>
                        ) : venta.metodo_pago === 'transferencia' ? (
                          <span className="rounded-full bg-gold-50 px-2.5 py-0.5 text-xs font-semibold text-gold-200">Transferencia</span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">{venta.metodo_pago || '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-rosewood">{formatMoney(venta.total)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDateTime(venta.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tabla de historial */}
      <section className="rounded-2xl border border-blush-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-rosewood" />
            <h2 className="text-xl font-bold text-gray-900">Historial de caja</h2>
          </div>
        </div>

        {loadingHistorial ? (
          <Skeleton lines={3} />
        ) : historial.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No hay registros de caja.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-blush-100 text-rosewood">
                  <th className="w-10 rounded-tl-2xl px-2 py-3"></th>
                  <th className="px-3 py-3 font-semibold">#</th>
                  <th className="px-3 py-3 font-semibold">Abrió</th>
                  <th className="px-3 py-3 font-semibold">Apertura</th>
                  <th className="px-3 py-3 font-semibold">Cierre</th>
                  <th className="px-3 py-3 font-semibold">Inicial</th>
                  <th className="px-3 py-3 font-semibold">V. efectivo</th>
                  <th className="px-3 py-3 font-semibold">V. transf.</th>
                  <th className="px-3 py-3 font-semibold">Gastos</th>
                  <th className="px-3 py-3 font-semibold">Esperado</th>
                  <th className="px-3 py-3 font-semibold">Cierre</th>
                  <th className="px-3 py-3 font-semibold">Descuadre</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="rounded-tr-2xl px-3 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((caja, index) => (
                  <Fragment key={caja.id}>
                    <tr className={`border-b border-blush-100 transition hover:bg-blush-100/30 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-blush-100/10'
                    } ${caja.esta_abierta ? 'border-l-2 border-l-rosewood' : ''}`}>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpand(caja)}
                          className="rounded-md p-1 text-rosewood/50 transition hover:bg-blush-100 hover:text-rosewood"
                          aria-label="Ver ventas"
                        >
                          {expandedCajaId === caja.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-bold text-rosewood">{caja.id}</td>
                      <td className="px-3 py-3 text-gray-700">{caja.abierto_por}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDateTime(caja.fecha_apertura)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDateTime(caja.fecha_cierre)}</td>
                      <td className="px-3 py-3 font-semibold text-rosewood">{formatMoney(caja.monto_inicial)}</td>
                      <td className="px-3 py-3 font-semibold text-rosewood">{formatMoney(caja.monto_ventas_efectivo)}</td>
                      <td className="px-3 py-3 font-semibold text-gold-200">{formatMoney(caja.monto_ventas_transferencia)}</td>
                      <td className="px-3 py-3 font-semibold text-gold-200">{formatMoney(caja.monto_gastos)}</td>
                      <td className="px-3 py-3 font-bold text-rosewood">{formatMoney(caja.saldo_esperado)}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900">{caja.monto_cierre != null ? formatMoney(caja.monto_cierre) : '-'}</td>
                      <td className="px-3 py-3">
                        {caja.descuadre != null ? (
                          <span className={`font-semibold ${Math.abs(caja.descuadre) < 0.01 ? 'text-gold-200' : 'text-rosewood'}`}>
                            {Math.abs(caja.descuadre) < 0.01 ? '✓' : `${caja.descuadre > 0 ? '+' : ''}${formatMoney(caja.descuadre)}`}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3">
                        {caja.esta_abierta ? (
                          <span className="rounded-full bg-rosewood/10 px-2 py-0.5 text-xs font-semibold text-rosewood">Abierta</span>
                        ) : (
                          <span className="rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-200">Cerrada</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleExpand(caja)}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-rosewood transition hover:bg-blush-100"
                          >
                            Ventas
                          </button>
                          {isSuperadmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(caja)}
                                className="rounded-md px-2 py-1 text-xs font-semibold text-rosewood transition hover:bg-blush-100"
                              >
                                <Edit className="mr-0.5 inline h-3 w-3" />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(caja)}
                                className="rounded-md px-2 py-1 text-xs font-semibold text-rosewood transition hover:bg-blush-100"
                              >
                                <Trash2 className="mr-0.5 inline h-3 w-3" />
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedCajaId === caja.id && (
                      <tr className="border-b border-blush-200 bg-blush-100/20">
                        <td colSpan={14} className="px-6 py-4">
                          {loadingVentas[caja.id] ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-rosewood border-t-transparent" />
                              <span className="ml-2 text-sm text-gray-500">Cargando ventas...</span>
                            </div>
                          ) : ventasPorCaja[caja.id]?.length === 0 ? (
                            <p className="py-2 text-center text-sm text-gray-500">No hay ventas en este turno.</p>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-blush-200 text-rosewood">
                                  <th className="px-2 py-2 font-semibold">#</th>
                                  <th className="px-2 py-2 font-semibold">Cliente</th>
                                  <th className="px-2 py-2 font-semibold">Método</th>
                                  <th className="px-2 py-2 font-semibold">Total</th>
                                  <th className="px-2 py-2 font-semibold">Fecha</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ventasPorCaja[caja.id].map((venta) => (
                                  <tr key={venta.venta_id} className="border-b border-blush-100 hover:bg-white/60">
                                    <td className="px-2 py-2 text-gray-700">{venta.venta_id}</td>
                                    <td className="px-2 py-2 text-gray-700">{venta.cliente_nombre || 'Mostrador'}</td>
                                    <td className="px-2 py-2">
                                      {venta.metodo_pago === 'efectivo' ? (
                                        <span className="rounded-full bg-rosewood/10 px-2 py-0.5 font-semibold text-rosewood">Efectivo</span>
                                      ) : venta.metodo_pago === 'transferencia' ? (
                                        <span className="rounded-full bg-gold-50 px-2 py-0.5 font-semibold text-gold-200">Transferencia</span>
                                      ) : (
                                        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">{venta.metodo_pago || '-'}</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-2 font-semibold text-rosewood">{formatMoney(venta.total)}</td>
                                    <td className="whitespace-nowrap px-2 py-2 text-gray-500">{formatDateTime(venta.fecha)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal de edición */}
      {editModalOpen && editingCaja && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6" onClick={closeEditModal}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-gray-900">Editar registro #{editingCaja.id}</h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                aria-label="Cerrar modal"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSaveEdit}>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Monto inicial</label>
                <input
                  type="number"
                  min="1"
                  value={editForm.monto_inicial}
                  onChange={(e) => handleEditChange('monto_inicial', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Monto cierre</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.monto_cierre}
                  onChange={(e) => handleEditChange('monto_cierre', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Estado</label>
                <select
                  value={editForm.estado}
                  onChange={(e) => handleEditChange('estado', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                >
                  <option value="abierta">Abierta</option>
                  <option value="cerrada">Cerrada</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Observaciones</label>
                <textarea
                  value={editForm.observaciones}
                  onChange={(e) => handleEditChange('observaciones', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                  rows={3}
                  maxLength={500}
                />
              </div>

              <button
                type="submit"
                disabled={savingEdit}
                className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {savingEdit ? 'Guardando cambios...' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}

      {ConfirmModal}
    </div>
  );
};

export default Caja;
