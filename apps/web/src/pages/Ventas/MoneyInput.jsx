import { formatThousands, parseMoney } from './posHelpers';

// Campo de dinero: el usuario teclea solo digitos y ve el monto con puntos en vivo.
const MoneyInput = ({ id, label, value, onChange, placeholder, large = false }) => (
  <div className="relative">
    <label htmlFor={id} className="sr-only">{label}</label>
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatThousands(value)}
      onChange={(event) => onChange(parseMoney(event.target.value))}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 font-semibold tabular-nums focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20 ${
        large ? 'h-10 text-base' : 'h-10 text-sm'
      }`}
    />
  </div>
);

export default MoneyInput;
