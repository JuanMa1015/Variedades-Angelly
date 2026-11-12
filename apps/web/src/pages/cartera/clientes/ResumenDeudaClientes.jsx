import Skeleton from '../../../components/Skeleton';

const Tarjeta = ({ titulo, valor, tono = 'text-gray-900', children }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
    <p className={`mt-1 text-2xl font-bold ${tono}`}>{valor}</p>
    {children}
  </div>
);

// Cifras de toda la cartera, no solo de los clientes que se ven en la pagina.
const ResumenDeudaClientes = ({ resumen, loading, formatMoney }) => {
  if (loading && !resumen) {
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map((n) => <div key={n} className="rounded-xl border border-gray-200 bg-white p-4"><Skeleton lines={2} /></div>)}</div>;
  }
  if (!resumen) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tarjeta titulo="Clientes activos" valor={resumen.clientes_activos}>
        {resumen.desactivados > 0 && <p className="text-xs text-gray-500">{resumen.desactivados} desactivado{resumen.desactivados === 1 ? '' : 's'}</p>}
      </Tarjeta>
      <Tarjeta titulo="Deuda total" valor={formatMoney(resumen.deuda_total)}>
        <p className="text-xs text-gray-500">{resumen.con_deuda} cliente{resumen.con_deuda === 1 ? '' : 's'} con deuda</p>
      </Tarjeta>
      <Tarjeta titulo="En alerta" valor={resumen.en_alerta} tono="text-amber-700">
        <p className="text-xs text-gray-500">{formatMoney(resumen.deuda_en_alerta)} · 31 a 60 días</p>
      </Tarjeta>
      <Tarjeta titulo="Morosos" valor={resumen.morosos} tono="text-red-700">
        <p className="text-xs text-gray-500">{formatMoney(resumen.deuda_morosa)} · más de 60 días</p>
      </Tarjeta>
    </div>
  );
};

export default ResumenDeudaClientes;
