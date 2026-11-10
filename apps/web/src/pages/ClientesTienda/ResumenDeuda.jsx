import { formatMoney } from '../../utils/format';

const Dato = ({ titulo, valor, detalle, tono = 'text-gray-900' }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
    <p className={`truncate text-xl font-black tabular-nums sm:text-2xl ${tono}`}>{valor}</p>
    {detalle && <p className="truncate text-xs text-gray-500">{detalle}</p>}
  </div>
);

// Cuatro cifras en una franja: lo que se debe, quien debe y a quien hay que perseguir primero.
const ResumenDeuda = ({ resumen }) => {
  if (!resumen) return null;
  return (
    <section aria-label="Resumen de la deuda" className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 lg:grid-cols-4">
      <Dato titulo="Deuda total" valor={formatMoney(resumen.deuda_total)} detalle={`${resumen.clientes_con_deuda} de ${resumen.clientes_totales} clientes deben`} />
      <Dato titulo="Saldo promedio" valor={formatMoney(resumen.saldo_promedio)} detalle="Por cliente con deuda" />
      <Dato titulo="En alerta" valor={resumen.clientes_riesgo_medio} detalle="Deben hace 31 a 60 días" tono="text-amber-700" />
      <Dato
        titulo="Morosos"
        valor={resumen.clientes_alto_riesgo}
        detalle={resumen.clientes_alto_riesgo > 0 ? `${formatMoney(resumen.deuda_morosa)} · más de 60 días` : 'Más de 60 días sin pagar'}
        tono="text-red-700"
      />
    </section>
  );
};

export default ResumenDeuda;
