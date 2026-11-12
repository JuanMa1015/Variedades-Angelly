const TRAMOS = [
  { id: 'al_dia', etiqueta: 'Hasta 30 días', barra: 'bg-emerald-500', texto: 'text-emerald-700' },
  { id: 'alerta', etiqueta: '31 a 60 días', barra: 'bg-amber-500', texto: 'text-amber-700' },
  { id: 'moroso', etiqueta: 'Más de 60 días', barra: 'bg-red-500', texto: 'text-red-700' },
];

// Cuanto se debe segun cuanto lleva la deuda sin pagarse. Cada tramo mide su parte del total.
const TramosDeuda = ({ porCobrar, formatMoney }) => {
  const total = Number(porCobrar.deuda_total || 0);
  return (
    <div className="space-y-4">
      {total > 0 ? (
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200" role="img" aria-label="Deuda repartida por antigüedad">
          {TRAMOS.map(({ id, barra }) => {
            const monto = Number(porCobrar[id]?.monto || 0);
            return monto > 0 ? <div key={id} className={barra} style={{ width: `${(monto / total) * 100}%` }} /> : null;
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">Nadie le debe a la tienda por ahora.</p>
      )}
      <ul className="space-y-2">
        {TRAMOS.map(({ id, etiqueta, barra, texto }) => {
          const tramo = porCobrar[id] ?? { clientes: 0, monto: 0 };
          return (
            <li key={id} className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 text-gray-700">
                <span className={`h-2.5 w-2.5 rounded-full ${barra}`} aria-hidden="true" />
                {etiqueta}
                <span className="text-xs text-gray-500">· {tramo.clientes} cliente{tramo.clientes === 1 ? '' : 's'}</span>
              </span>
              <span className={`font-semibold tabular-nums ${texto}`}>{formatMoney(tramo.monto)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default TramosDeuda;
