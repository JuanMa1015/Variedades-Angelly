import { UserPlus } from 'lucide-react';
import ClientCombobox from './ClientCombobox';
import MethodSelector from './MethodSelector';
import MoneyInput from './MoneyInput';

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
        <div className="min-w-0 flex-1">
          <ClientCombobox
            id="pos-cliente-fiado"
            label="Cliente que fía"
            clientes={clientesTiendaFiado}
            value={clienteTiendaId}
            onChange={onSetClienteTiendaId}
            onCreate={onCrearCliente}
            placeholder="Buscar cliente por nombre o teléfono"
            getHint={(item) => (Number(item.deuda_total) > 0 ? `Debe ${formatMoney(Number(item.deuda_total))}` : '')}
          />
        </div>
        <button
          type="button"
          onClick={() => onCrearCliente()}
          aria-label="Crear cliente nuevo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rosewood text-rosewood transition hover:bg-blush-100"
        >
          <UserPlus className="h-4 w-4" />
        </button>
      </div>

      <MoneyInput
        id="pos-abono"
        label="Abono inicial"
        value={abono}
        onChange={onSetAbonoInicialFiado}
        placeholder="Abono inicial (opcional)"
      />

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
