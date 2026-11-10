import { useState } from 'react';
import { ChevronDown, ChevronRight, Edit, History, Printer, Trash2 } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { formatDateTime, formatMoney } from '../../utils/format';
import MovimientosTurno from './MovimientosTurno';
import { etiquetaDescuadre } from './cajaHelpers';

const TONOS = {
  ok: 'bg-emerald-50 text-emerald-700',
  sobra: 'bg-yellow-50 text-yellow-700',
  falta: 'bg-red-50 text-red-700',
};

const Resultado = ({ caja }) => {
  if (caja.esta_abierta) return <span className="rounded-full bg-rosewood/10 px-2.5 py-0.5 text-xs font-semibold text-rosewood">En curso</span>;
  const etiqueta = etiquetaDescuadre(caja.descuadre);
  if (!etiqueta) return <span className="text-gray-400">—</span>;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONOS[etiqueta.tono]}`}>{etiqueta.texto}</span>;
};

const totalVentas = (caja) => (
  Number(caja.monto_ventas_efectivo) + Number(caja.monto_ventas_transferencia) + Number(caja.monto_ventas_tarjeta)
);

const Dato = ({ titulo, valor }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
    <p className="font-bold tabular-nums text-gray-900">{valor}</p>
  </div>
);

const DetalleTurno = ({ caja, version, isSuperadmin, onPrint, onEdit, onDelete }) => (
  <div className="space-y-4 bg-gray-50/70 px-4 py-4 sm:px-6">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <Dato titulo="Inicial" valor={formatMoney(caja.monto_inicial)} />
      <Dato titulo="Efectivo" valor={formatMoney(caja.monto_ventas_efectivo)} />
      <Dato titulo="Transferencias" valor={formatMoney(caja.monto_ventas_transferencia)} />
      <Dato titulo="Tarjeta" valor={formatMoney(caja.monto_ventas_tarjeta)} />
      <Dato titulo="Gastos" valor={formatMoney(caja.monto_gastos)} />
      <Dato titulo="Esperado" valor={caja.saldo_esperado != null ? formatMoney(caja.saldo_esperado) : '—'} />
      <Dato titulo="Contado" valor={caja.monto_cierre != null ? formatMoney(caja.monto_cierre) : '—'} />
    </div>
    {caja.observaciones && (
      <p className="rounded-lg bg-white px-3 py-2 text-sm text-gray-700"><strong>Nota:</strong> {caja.observaciones}</p>
    )}
    <MovimientosTurno cajaId={caja.id} version={version} />
    <div className="flex flex-wrap gap-2">
      {!caja.esta_abierta && (
        <button type="button" onClick={() => onPrint(caja)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">
          <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Imprimir cierre
        </button>
      )}
      {isSuperadmin && (
        <>
          <button type="button" onClick={() => onEdit(caja)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">
            <Edit className="h-3.5 w-3.5" aria-hidden="true" /> Editar
          </button>
          <button type="button" onClick={() => onDelete(caja)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Eliminar
          </button>
        </>
      )}
    </div>
  </div>
);

const FilaTurno = ({ caja, abierto, onToggle, ...resto }) => (
  <li className={`overflow-hidden rounded-xl border ${caja.esta_abierta ? 'border-rosewood/30 bg-rosewood/5' : 'border-gray-200'}`}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={abierto}
      aria-label={`${abierto ? 'Ocultar' : 'Ver'} el detalle del turno ${caja.id}`}
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-3 text-left transition hover:bg-gray-50 sm:px-4"
    >
      {abierto ? <ChevronDown className="h-4 w-4 shrink-0 text-rosewood" /> : <ChevronRight className="h-4 w-4 shrink-0 text-rosewood/60" />}
      <span className="min-w-[7rem]">
        <span className="block font-bold text-gray-900">Turno {caja.id}</span>
        <span className="block text-xs text-gray-500">{caja.abierto_por}</span>
      </span>
      <span className="min-w-[10rem] flex-1 text-xs text-gray-600">
        <span className="block">{formatDateTime(caja.fecha_apertura)}</span>
        <span className="block text-gray-400">{caja.fecha_cierre ? `→ ${formatDateTime(caja.fecha_cierre)}` : 'Sigue abierto'}</span>
      </span>
      <span className="text-right">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Ventas</span>
        <span className="block font-semibold tabular-nums text-gray-900">{formatMoney(totalVentas(caja))}</span>
      </span>
      <span className="ml-auto"><Resultado caja={caja} /></span>
    </button>
    {abierto && <DetalleTurno caja={caja} {...resto} />}
  </li>
);

// Un turno por tarjeta, con lo esencial; el detalle (por medio de pago y movimientos) se abre al tocarla.
const HistorialCaja = ({ historial, loading, version, isSuperadmin, onPrint, onEdit, onDelete }) => {
  const [abiertoId, setAbiertoId] = useState(null);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-rosewood" aria-hidden="true" />
        <h2 className="text-xl font-bold text-gray-900">Historial de caja</h2>
      </div>
      {loading && <Skeleton lines={3} />}
      {!loading && historial.length === 0 && <p className="py-8 text-center text-sm text-gray-500">Todavía no hay turnos de caja.</p>}
      {!loading && historial.length > 0 && (
        <ul className="space-y-2">
          {historial.map((caja) => (
            <FilaTurno
              key={caja.id}
              caja={caja}
              abierto={abiertoId === caja.id}
              onToggle={() => setAbiertoId((actual) => (actual === caja.id ? null : caja.id))}
              version={version}
              isSuperadmin={isSuperadmin}
              onPrint={onPrint}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
};

export default HistorialCaja;
