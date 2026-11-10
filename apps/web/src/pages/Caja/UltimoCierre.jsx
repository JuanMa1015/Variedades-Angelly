import { Printer } from 'lucide-react';
import { formatDateTime, formatMoney } from '../../utils/format';
import { etiquetaDescuadre } from './cajaHelpers';

const TONOS = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  sobra: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  falta: 'border-red-200 bg-red-50 text-red-800',
};

// Resultado del ultimo turno: queda a la vista mientras la caja esta cerrada, con su reporte imprimible.
const UltimoCierre = ({ cierre, onPrint }) => {
  const etiqueta = etiquetaDescuadre(cierre.descuadre);
  return (
    <section className="mx-auto w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Último cierre · Turno {cierre.id}</p>
          <p className="text-sm text-gray-600">{cierre.cerrado_por} · {formatDateTime(cierre.fecha_cierre)}</p>
        </div>
        {etiqueta && <span className={`rounded-full border px-3 py-1 text-sm font-bold ${TONOS[etiqueta.tono]}`}>{etiqueta.texto}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-gray-500">Efectivo contado</dt>
        <dd className="text-right font-bold tabular-nums">{formatMoney(cierre.monto_cierre)}</dd>
        {cierre.saldo_esperado != null && (
          <>
            <dt className="text-gray-500">Efectivo esperado</dt>
            <dd className="text-right font-bold tabular-nums">{formatMoney(cierre.saldo_esperado)}</dd>
          </>
        )}
      </dl>
      {cierre.observaciones && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">Nota: {cierre.observaciones}</p>}
      <button
        type="button"
        onClick={() => onPrint(cierre)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
      >
        <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Imprimir cierre
      </button>
    </section>
  );
};

export default UltimoCierre;
