import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit, History, Lock, Plus, Trash2, Unlock, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { abrirCaja, cerrarCaja, deleteCaja, fetchCajaEstado, fetchCajaHistorial, updateCaja } from '../api/cajaApi';
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

      {/* Estado actual */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${abierta ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Estado</p>
          <p className={`mt-2 flex items-center gap-2 text-2xl font-bold sm:text-3xl ${abierta ? 'text-green-700' : 'text-gray-900'}`}>
            {abierta ? <><Unlock className="h-5 w-5 sm:h-6 sm:w-6" /> Abierta</> : <><Lock className="h-5 w-5 sm:h-6 sm:w-6" /> Cerrada</>}
          </p>
          {cajaActual && (
            <p className="mt-1 text-xs text-gray-500">por {cajaActual.abierto_por} — {formatDateTime(cajaActual.fecha_apertura)}</p>
          )}
        </div>

        {abierta && cajaActual && (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Saldo esperado</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">{formatMoney(saldoEsperado)}</p>
            </div>

            <div className="rounded-2xl border border-blush-100 bg-blush-100 p-4 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rosewood">Abierta por</p>
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
        </div>
      )}

      {/* Tabla de historial */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
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
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 font-semibold text-gray-700">#</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Fecha apertura</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Fecha cierre</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Abierto por</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Monto inicial</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Monto cierre</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Estado</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((caja) => (
                    <tr key={caja.id} className="border-b border-gray-100">
                      <td className="px-3 py-3 text-gray-700">{caja.id}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDateTime(caja.fecha_apertura)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDateTime(caja.fecha_cierre)}</td>
                      <td className="px-3 py-3 text-gray-700">{caja.abierto_por}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(caja.monto_inicial)}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900">{caja.monto_cierre != null ? formatMoney(caja.monto_cierre) : '-'}</td>
                      <td className="px-3 py-3">
                        {caja.esta_abierta ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Abierta</span>
                        ) : (
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">Cerrada</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(caja)}
                            className="rounded-md border border-gray-300 p-1.5 text-gray-600 transition hover:bg-gray-50 hover:text-rosewood"
                            aria-label="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {isSuperadmin && (
                            <button
                              type="button"
                              onClick={() => handleDelete(caja)}
                              className="rounded-md border border-gray-300 p-1.5 text-gray-600 transition hover:bg-red-50 hover:text-red-600"
                              aria-label="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {historial.map((caja) => (
                <div key={caja.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="font-semibold text-gray-900">#{caja.id} — {caja.abierto_por}</span>
                    {caja.esta_abierta ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Abierta</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">Cerrada</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">Apertura: {formatDateTime(caja.fecha_apertura)}</p>
                  <p className="text-sm text-gray-600">Cierre: {formatDateTime(caja.fecha_cierre)}</p>
                  <p className="text-sm text-gray-600">Inicial: {formatMoney(caja.monto_inicial)}</p>
                  <p className="text-sm text-gray-600">Cierre: {caja.monto_cierre != null ? formatMoney(caja.monto_cierre) : '-'}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(caja)}
                      className="inline-flex items-center gap-1 rounded-md bg-rosewood px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    {isSuperadmin && (
                      <button
                        type="button"
                        onClick={() => handleDelete(caja)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
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

      <ConfirmModal />
    </div>
  );
};

export default Caja;
