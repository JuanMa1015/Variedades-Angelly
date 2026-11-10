import { useState } from 'react';
import { Lock } from 'lucide-react';
import { abrirCaja } from '../../api/cajaApi';
import MoneyInput from './MoneyInput';

// Sin turno abierto el dinero no entra a ningun cuadre: el POS pide abrir la caja antes de vender.
const CajaGate = ({ onOpened }) => {
  const [monto, setMonto] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await abrirCaja({ monto_inicial: monto });
      await onOpened();
    } catch (err) {
      setError(err.message || 'No fue posible abrir la caja');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-10 w-full max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-amber-50 p-3 text-amber-600"><Lock className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h2 className="text-lg font-bold text-gray-900">La caja está cerrada</h2>
          <p className="text-sm text-gray-500">Abre la caja para empezar a vender.</p>
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold text-gray-700">Efectivo inicial en el cajón</p>
        <MoneyInput id="caja-monto-inicial" label="Efectivo inicial" value={monto} onChange={setMonto} placeholder="0" large />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="h-11 w-full rounded-xl bg-rosewood text-sm font-bold text-white transition hover:bg-rosewood/90 disabled:opacity-50"
      >
        {saving ? 'Abriendo…' : 'Abrir caja y vender'}
      </button>
    </form>
  );
};

export default CajaGate;
