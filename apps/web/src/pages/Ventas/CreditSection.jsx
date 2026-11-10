import { UserPlus } from 'lucide-react';
import MethodSelector from './MethodSelector';

const CreditSection = ({
  clientesTiendaFiado,
  clienteTiendaId,
  onSetClienteTiendaId,
  onCrearCliente,
  totalEstimado,
  abonoInicialFiado,
  onSetAbonoInicialFiado,
  metodoPago,
  onSetMetodoPago,
  formatMoney,
}) => {
  const cliente = clientesTiendaFiado.find((item) => String(item.id) === String(clienteTiendaId)) ?? null;
  const abono = Number(abonoInicialFiado || 0);
  const quedaFiado = Math.max(0, totalEstimado - abono);

  return (
    <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex gap-2">
        <label htmlFor="pos-cliente-fiado" className="sr-only">Cliente que fía</label>
        <select
          id="pos-cliente-fiado"
          value={clienteTiendaId}
          onChange={(event) => onSetClienteTiendaId(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-rosewood focus:outline-none"
        >
          <option value="">Selecciona el cliente</option>
          {clientesTiendaFiado.map((item) => (
            <option key={item.id} value={item.id}>{item.nombre}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCrearCliente}
          aria-label="Crear cliente nuevo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rosewood text-rosewood transition hover:bg-blush-100"
        >
          <UserPlus className="h-4 w-4" />
        </button>
      </div>

      <div className="relative">
        <label htmlFor="pos-abono" className="sr-only">Abono inicial</label>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
        <input
          id="pos-abono"
          type="text"
          inputMode="numeric"
          value={abono === 0 ? '' : String(abono)}
          onChange={(event) => onSetAbonoInicialFiado(Number.parseInt(event.target.value.replace(/\D/g, ''), 10) || 0)}
          placeholder="Abono inicial (opcional)"
          className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 text-sm font-semibold tabular-nums focus:border-rosewood focus:outline-none"
        />
      </div>

      {abono > 0 && <MethodSelector value={metodoPago} onChange={onSetMetodoPago} />}

      <div className="rounded-lg border border-amber-300 bg-white p-2 text-xs text-gray-600">
        {cliente && (
          <p>
            Deuda actual de {cliente.nombre}:{' '}
            <span className="font-bold text-amber-700">{formatMoney(Number(cliente.deuda_total || 0))}</span>
          </p>
        )}
        <p>
          Queda fiado: <span className="font-bold text-gray-900">{formatMoney(quedaFiado)}</span>
        </p>
      </div>
    </div>
  );
};

export default CreditSection;
