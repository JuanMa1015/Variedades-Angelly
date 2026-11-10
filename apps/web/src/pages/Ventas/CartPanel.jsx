import { Gift, Pause, ShoppingCart, Trash2 } from 'lucide-react';
import CartLines from './CartLines';
import ClientCombobox from './ClientCombobox';
import CreditSection from './CreditSection';
import HeldTicketsBar from './HeldTicketsBar';
import PaymentSection from './PaymentSection';

const Kbd = ({ children, light = false }) => (
  <kbd className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
    light ? 'border-white/40 bg-white/15 text-white' : 'border-gray-300 bg-gray-50 text-gray-500'
  }`}
  >
    {children}
  </kbd>
);

const PanelHeader = ({ cart, onHold, onClear }) => {
  const unidades = cart.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
  const empty = cart.length === 0;

  return (
    <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
      <ShoppingCart className="h-5 w-5 text-rosewood" aria-hidden="true" />
      <h2 className="text-lg font-bold text-gray-900">Ticket</h2>
      <span className="rounded-full bg-rosewood px-2.5 py-0.5 text-xs font-semibold text-white">
        {unidades} {unidades === 1 ? 'ítem' : 'ítems'}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onHold}
          disabled={empty}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pause className="h-3.5 w-3.5" /> En espera <Kbd>F4</Kbd>
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={empty}
          aria-label="Vaciar ticket"
          className="rounded-lg p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const ModeToggle = ({ esFiado, onSetEsFiado }) => (
  <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Tipo de venta">
    {[
      { value: false, label: 'Contado', hint: 'Pago inmediato' },
      { value: true, label: 'Fiado', hint: 'Paga después' },
    ].map((option) => (
      <button
        key={option.label}
        type="button"
        role="radio"
        aria-checked={esFiado === option.value}
        onClick={() => onSetEsFiado(option.value)}
        className={`rounded-lg px-3 py-2 transition ${
          esFiado === option.value ? 'bg-rosewood text-white shadow-sm' : 'text-gray-600 hover:bg-white'
        }`}
      >
        <span className="block text-center text-sm font-bold leading-tight" title={option.hint}>{option.label}</span>
      </button>
    ))}
  </div>
);

const RedeemRow = ({ redencion, valorPunto, usarPuntos, onToggle, formatMoney }) => {
  if (redencion.maxPuntos <= 0) return null;
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm text-violet-900">
      <input type="checkbox" checked={usarPuntos} onChange={(event) => onToggle(event.target.checked)} />
      <span>
        Usar {redencion.maxPuntos} puntos: <strong>−{formatMoney(redencion.maxPuntos * valorPunto)}</strong>
      </span>
    </label>
  );
};

const LoyaltyRow = ({ clientes, value, onChange, puntosEstimados, onCreate }) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5">
      <Gift className="ml-1 h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <ClientCombobox
          id="pos-fidelizacion"
          label="Cliente de fidelización"
          clientes={clientes}
          value={value}
          onChange={onChange}
          placeholder="Cliente de fidelización (opcional)"
          getHint={(cliente) => `${cliente.puntos_acumulados} pts`}
        />
      </div>
      {value && puntosEstimados > 0 && (
        <span className="shrink-0 pr-1 text-xs font-semibold text-violet-800">+{puntosEstimados} pts</span>
      )}
      <button
        type="button"
        onClick={onCreate}
        aria-label="Inscribir cliente de fidelización"
        className="shrink-0 rounded-md bg-violet-700 px-2 py-1 text-xs font-bold text-white transition hover:bg-violet-800"
      >
        + Nuevo
      </button>
    </div>
  );
};

const CartPanel = (props) => {
  const {
    cart,
    productosById,
    totalEstimado,
    onChangeQty,
    onRemoveItem,
    formatMoney,
    esFiado,
    onSetEsFiado,
    onConfirmar,
    submittingVenta,
    clientesFidelizacion = [],
    clienteFidelizacionId = '',
    onSetClienteFidelizacionId = () => {},
    puntosEstimados = 0,
    onCreateFidelizacion = () => {},
    redencion = { maxPuntos: 0, puntos: 0, descuento: 0 },
    valorPunto = 0,
    usarPuntos = false,
    onSetUsarPuntos = () => {},
    heldTickets = [],
    onHold = () => {},
    onClear = () => {},
    onResumeTicket = () => {},
    onDiscardTicket = () => {},
  } = props;
  const unidades = cart.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="Ticket de venta">
      <PanelHeader cart={cart} onHold={onHold} onClear={onClear} />
      <HeldTicketsBar tickets={heldTickets} onResume={onResumeTicket} onDiscard={onDiscardTicket} />

      <div className="min-h-[4.5rem] flex-[1_1_8rem] overflow-y-auto">
        <CartLines
          cart={cart}
          productosById={productosById}
          onChangeQty={onChangeQty}
          onRemoveItem={onRemoveItem}
          formatMoney={formatMoney}
        />
      </div>

      <form onSubmit={onConfirmar} className="flex min-h-0 shrink flex-col border-t border-gray-200 bg-gray-50/70">
        {/* Opciones de pago: si no caben, se desplazan; el total y el boton Cobrar siempre quedan a la vista. */}
        <div className="min-h-[5rem] flex-1 space-y-2.5 overflow-y-auto p-4 pb-2">
          <ModeToggle esFiado={esFiado} onSetEsFiado={onSetEsFiado} />
          {esFiado ? <CreditSection {...props} /> : <PaymentSection {...props} />}
          <LoyaltyRow
            clientes={clientesFidelizacion}
            value={clienteFidelizacionId}
            onChange={onSetClienteFidelizacionId}
            puntosEstimados={puntosEstimados}
            onCreate={onCreateFidelizacion}
          />
          <RedeemRow
            redencion={redencion}
            valorPunto={valorPunto}
            usarPuntos={usarPuntos}
            onToggle={onSetUsarPuntos}
            formatMoney={formatMoney}
          />
        </div>

        <div className="shrink-0 space-y-2 border-t border-gray-200 bg-white p-4 pt-3">
          {redencion.descuento > 0 && (
            <div className="flex justify-between text-sm font-semibold text-violet-700">
              <span>Descuento por {redencion.puntos} puntos</span>
              <span>−{formatMoney(redencion.descuento)}</span>
            </div>
          )}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total a cobrar</p>
              <p className="text-xs text-gray-500">{unidades} {unidades === 1 ? 'artículo' : 'artículos'}</p>
            </div>
            <p className="text-3xl font-black tabular-nums text-rosewood">{formatMoney(totalEstimado)}</p>
          </div>

          <button
            type="submit"
            disabled={submittingVenta || cart.length === 0}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-rosewood px-4 text-base font-bold text-white shadow-soft transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
          >
            {submittingVenta ? 'Confirmando...' : `Cobrar ${formatMoney(totalEstimado)}`}
            {!submittingVenta && <Kbd light>F9</Kbd>}
          </button>
        </div>
      </form>
    </section>
  );
};

export default CartPanel;
