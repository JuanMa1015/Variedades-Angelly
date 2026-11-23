import MoneyInput from '../Ventas/MoneyInput';
import { montoInicialListo } from './cajaHelpers';

// Abrir la caja pide declarar el efectivo del cajón: un monto, o marcar que se empieza sin efectivo.

const MontoInicialCampo = ({ id, label, monto, onMonto, sinEfectivo, onSinEfectivo }) => (
  <div className="space-y-2">
    <MoneyInput
      id={id}
      label={label}
      value={monto}
      onChange={(valor) => {
        onMonto(valor);
        if (valor > 0) onSinEfectivo(false);
      }}
      placeholder="Cuenta el efectivo y escribe el total"
      large
    />
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={sinEfectivo}
        onChange={(event) => {
          onSinEfectivo(event.target.checked);
          if (event.target.checked) onMonto(0);
        }}
        className="h-4 w-4 rounded border-gray-300 text-rosewood focus:ring-rosewood"
      />
      Empiezo sin efectivo en el cajón ($ 0)
    </label>
    {!montoInicialListo(monto, sinEfectivo) && (
      <p className="text-xs text-gray-500">Escribe cuánto efectivo hay, o marca que empiezas sin efectivo.</p>
    )}
  </div>
);

export default MontoInicialCampo;
