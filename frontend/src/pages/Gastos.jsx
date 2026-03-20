import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Receipt, WalletCards } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

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
  });
};

const isCurrentMonth = (value, referenceDate) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getMonth() === referenceDate.getMonth()
    && date.getFullYear() === referenceDate.getFullYear()
  );
};

const CATEGORIAS_BASE = [
  'arriendo',
  'servicios',
  'nomina',
  'pagos vendedores',
  'transporte',
  'otros',
];

const Gastos = () => {
  const { token } = useAuth();

  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    categoria: 'servicios',
    descripcion: '',
    monto: '',
  });

  useEffect(() => {
    if (!token) {
      setGastos([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadGastos = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(`${API_BASE_URL}/api/gastos`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json().catch(() => ([]));

        if (!response.ok) {
          throw new Error('No fue posible cargar los gastos');
        }

        if (controller.signal.aborted) return;
  setGastos(Array.isArray(payload) ? payload : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || 'No se pudo cargar gastos');
        setGastos([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadGastos();
    return () => controller.abort();
  }, [token]);

  const resumen = useMemo(() => {
    const now = new Date();
    const gastosMes = gastos.filter((item) => isCurrentMonth(item.fecha, now));

    const totalMes = gastosMes.reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const categorias = new Set(gastosMes.map((item) => String(item.categoria || '').toLowerCase()));

    const categoriaTotalsMap = gastosMes.reduce((acc, item) => {
      const categoria = String(item.categoria || 'sin categoría').toLowerCase();
      acc.set(categoria, (acc.get(categoria) || 0) + Number(item.monto || 0));
      return acc;
    }, new Map());

    const topCategorias = Array.from(categoriaTotalsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([categoria, total]) => ({ categoria, total }));

    return {
      totalMes,
      registrosMes: gastosMes.length,
      categoriasActivas: categorias.size,
      topCategorias,
    };
  }, [gastos]);

  const handleFormChange = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleCreateGasto = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const categoria = form.categoria.trim();
    const descripcion = form.descripcion.trim();
    const monto = Number(form.monto);

    if (!categoria) {
      setError('La categoría es obligatoria');
      return;
    }

    if (!descripcion) {
      setError('La descripción del gasto es obligatoria');
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(`${API_BASE_URL}/api/gastos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          categoria,
          descripcion,
          monto,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'No se pudo registrar el gasto');
      }

      setGastos((current) => [payload, ...current]);
      setForm((current) => ({
        ...current,
        descripcion: '',
        monto: '',
      }));
      setSuccess('Gasto registrado correctamente');
    } catch (err) {
      setError(err.message || 'No se pudo registrar el gasto');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <WalletCards className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gastos</h1>
          <p className="text-gray-600">Control de egresos operativos del negocio</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Total mes</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumen.totalMes)}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Registros mes</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{resumen.registrosMes}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Categorías activas</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{resumen.categoriasActivas}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Registrar gasto</h2>

          <form className="space-y-3" onSubmit={handleCreateGasto}>
            <select
              value={form.categoria}
              onChange={(event) => handleFormChange('categoria', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
            >
              {CATEGORIAS_BASE.map((categoria) => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </select>

            <textarea
              value={form.descripcion}
              onChange={(event) => handleFormChange('descripcion', event.target.value)}
              className="h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Detalle del gasto"
              maxLength={255}
            />

            <input
              type="number"
              min="1"
              value={form.monto}
              onChange={(event) => handleFormChange('monto', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Monto"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {submitting ? 'Guardando gasto...' : 'Guardar gasto'}
            </button>
          </form>
        </section>

        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-rosewood" />
            <h3 className="text-lg font-bold text-gray-900">Top categorías del mes</h3>
          </div>

          {resumen.topCategorias.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay gastos para este mes.</p>
          ) : (
            <div className="space-y-3">
              {resumen.topCategorias.map((item) => (
                <div key={item.categoria}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{item.categoria}</span>
                    <span className="font-semibold text-gray-900">{formatMoney(item.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-rosewood"
                      style={{
                        width: `${
                          resumen.totalMes > 0 ? Math.min(100, (item.total / resumen.totalMes) * 100) : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
          <Receipt className="h-5 w-5 text-rosewood" />
          Historial de gastos
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-3 font-semibold text-gray-700">Fecha</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Categoría</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Descripción</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Monto</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="5" className="px-3 py-8 text-center text-gray-500">
                    Cargando gastos...
                  </td>
                </tr>
              )}

              {!loading && gastos.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-3 py-8 text-center text-gray-500">
                    No hay gastos registrados.
                  </td>
                </tr>
              )}

              {!loading && gastos.map((gasto) => (
                <tr key={gasto.id} className="border-b border-gray-100">
                  <td className="px-3 py-3 text-gray-700">{formatDateTime(gasto.fecha)}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-blush-100 px-2 py-1 text-xs font-semibold text-rosewood">
                      {gasto.categoria}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{gasto.descripcion}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900">{formatMoney(gasto.monto)}</td>
                  <td className="px-3 py-3 text-gray-700">{gasto.registrado_por}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Gastos;
