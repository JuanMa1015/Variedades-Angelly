import Skeleton from '../../../components/Skeleton';

const Tarjeta = ({ titulo, valor, tono = 'text-gray-900', children }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
    <p className={`mt-1 text-2xl font-bold ${tono}`}>{valor}</p>
    {children}
  </div>
);

// Lo que falta por cobrar (toda la cartera) y lo que ya se cobro: hoy, semana y mes. Cartera no pasa por la caja del vendedor.
const ResumenCobros = ({ deuda, cobrado, loading, formatMoney }) => {
  if (loading && !deuda && !cobrado) {
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map((n) => <div key={n} className="rounded-xl border border-gray-200 bg-white p-4"><Skeleton lines={2} /></div>)}</div>;
  }
  if (!deuda && !cobrado) return null;
  const hoy = cobrado?.hoy;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {deuda && (
        <>
          <Tarjeta titulo="Por cobrar" valor={formatMoney(deuda.deuda_total)}>
            <p className="text-xs text-gray-500">{deuda.con_deuda} cliente{deuda.con_deuda === 1 ? '' : 's'} con deuda</p>
          </Tarjeta>
          <Tarjeta titulo="En alerta" valor={deuda.en_alerta} tono="text-amber-700">
            <p className="text-xs text-gray-500">{formatMoney(deuda.deuda_en_alerta)} · 31 a 60 días</p>
          </Tarjeta>
          <Tarjeta titulo="Morosos" valor={deuda.morosos} tono="text-red-700">
            <p className="text-xs text-gray-500">{formatMoney(deuda.deuda_morosa)} · más de 60 días</p>
          </Tarjeta>
        </>
      )}
      {hoy && (
        <Tarjeta titulo="Cobrado hoy" valor={formatMoney(hoy.total)} tono="text-emerald-700">
          <p className="text-xs text-gray-500">Semana {formatMoney(cobrado.semana.total)} · Mes {formatMoney(cobrado.mes.total)}</p>
          {hoy.total > 0 && (
            <p className="text-xs text-gray-500">Efectivo {formatMoney(hoy.efectivo)} · Transf. {formatMoney(hoy.transferencia)}{hoy.tarjeta > 0 ? ` · Tarjeta ${formatMoney(hoy.tarjeta)}` : ''}</p>
          )}
        </Tarjeta>
      )}
    </div>
  );
};

export default ResumenCobros;
