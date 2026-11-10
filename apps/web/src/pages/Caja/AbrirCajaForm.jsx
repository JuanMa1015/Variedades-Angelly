import { useState } from 'react';
import { Unlock } from 'lucide-react';
import { abrirCaja } from '../../api/cajaApi';
import MoneyInput from '../Ventas/MoneyInput';

// Abrir el turno: el efectivo con el que arranca el cajon (puede ser cero).
const AbrirCajaForm = ({ onOpened, onError }) => {
  const [monto, setMonto] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    onError('');
    try {
      await abrirCaja({ monto_inicial: monto });
      setMonto(0);
      await onOpened();
    } catch (err) {
      onError(err.message || 'No se pudo abrir la caja');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Unlock className="h-5 w-5 text-rosewood" aria-hidden="true" />
        <h2 className="text-xl font-bold text-gray-900">Abrir caja</h2>
      </div>
      <p className="mb-4 text-sm text-gray-600">Cuenta el efectivo que hay en el cajón antes de empezar a vender.</p>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <MoneyInput id="caja-apertura" label="Efectivo inicial en el cajón" value={monto} onChange={setMonto} placeholder="Monto inicial en efectivo (puede ser 0)" large />
        <button
          type="submit"
          disabled={saving}
          className="h-11 w-full rounded-xl bg-rosewood text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? 'Abriendo caja...' : 'Abrir caja'}
        </button>
      </form>
    </section>
  );
};

export default AbrirCajaForm;
