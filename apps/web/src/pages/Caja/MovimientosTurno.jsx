import { useEffect, useState } from 'react';
import { fetchCajaMovimientos } from '../../api/cajaApi';
import PaymentBadge from '../../components/PaymentBadge';
import Skeleton from '../../components/Skeleton';
import { formatDateTime, formatMoney } from '../../utils/format';
import { TIPOS_MOVIMIENTO } from './cajaHelpers';

const Monto = ({ movimiento }) => {
  if (movimiento.anulada) {
    return <span className="text-gray-400 line-through">{formatMoney(movimiento.total)}</span>;
  }
  if (movimiento.tipo === 'gasto') return <span className="font-bold text-red-700">−{formatMoney(movimiento.monto)}</span>;
  return (
    <span className="font-bold text-emerald-700">
      +{formatMoney(movimiento.monto)}
      {movimiento.es_fiado && <span className="block text-[11px] font-medium text-amber-700">Fiado de {formatMoney(movimiento.total)}</span>}
    </span>
  );
};

const FilaMovimiento = ({ movimiento }) => {
  const tipo = TIPOS_MOVIMIENTO[movimiento.tipo] ?? { etiqueta: movimiento.tipo, clase: 'bg-gray-100 text-gray-600' };
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatDateTime(movimiento.fecha)}</td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tipo.clase}`}>{tipo.etiqueta}</span>
      </td>
      <td className="px-3 py-2 text-gray-800">
        {movimiento.descripcion}
        {movimiento.anulada && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Anulada</span>}
      </td>
      <td className="px-3 py-2">{movimiento.metodo_pago ? <PaymentBadge method={movimiento.metodo_pago} compact /> : <span className="text-gray-300">—</span>}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums"><Monto movimiento={movimiento} /></td>
    </tr>
  );
};

// Todo lo que explica el efectivo del turno: ventas cobradas, abonos recibidos y gastos pagados.
const MovimientosTurno = ({ cajaId, version = 0 }) => {
  const [movimientos, setMovimientos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchCajaMovimientos(cajaId, { signal: controller.signal })
      .then((lista) => { setMovimientos(Array.isArray(lista) ? lista : []); setError(''); })
      .catch((err) => { if (err?.name !== 'AbortError') setError(err.message || 'No se pudieron cargar los movimientos'); });
    return () => controller.abort();
  }, [cajaId, version]);

  if (error) return <p role="alert" className="py-3 text-sm text-red-600">{error}</p>;
  if (movimientos === null) return <Skeleton lines={2} />;
  if (movimientos.length === 0) return <p className="py-4 text-center text-sm text-gray-500">Este turno no tiene movimientos.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-semibold">Hora</th>
            <th className="px-3 py-2 font-semibold">Tipo</th>
            <th className="px-3 py-2 font-semibold">Detalle</th>
            <th className="px-3 py-2 font-semibold">Medio</th>
            <th className="px-3 py-2 text-right font-semibold">Monto</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((movimiento) => <FilaMovimiento key={`${movimiento.tipo}-${movimiento.id}`} movimiento={movimiento} />)}
        </tbody>
      </table>
    </div>
  );
};

export default MovimientosTurno;
