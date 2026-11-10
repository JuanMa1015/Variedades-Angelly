import { Banknote, CreditCard, Smartphone } from 'lucide-react';

const METHODS = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote },
  { id: 'nequi', label: 'Nequi', icon: Smartphone },
  { id: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
];

const MethodSelector = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Método de pago">
    {METHODS.map((method) => (
      <button
        key={method.id}
        type="button"
        role="radio"
        aria-checked={value === method.id}
        onClick={() => onChange(method.id)}
        className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition ${
          value === method.id
            ? 'border-rosewood bg-rosewood text-white shadow-sm'
            : 'border-gray-300 bg-white text-gray-700 hover:border-rosewood/50'
        }`}
      >
        <method.icon className="h-4 w-4" aria-hidden="true" />
        {method.label}
      </button>
    ))}
  </div>
);

export default MethodSelector;
