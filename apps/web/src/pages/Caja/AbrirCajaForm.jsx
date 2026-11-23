import { useState } from 'react';
import { Unlock } from 'lucide-react';
import { abrirCaja } from '../../api/cajaApi';
import MontoInicialCampo from './MontoInicialCampo';
import { montoInicialListo } from './cajaHelpers';

// Abrir el turno: el efectivo con el que arranca el cajon (se declara; puede ser cero marcandolo).
const AbrirCajaForm = ({ onOpened, onError }) => {
  const [monto, setMonto] = useState(0);
  const [sinEfectivo, setSinEfectivo] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    onError('');
    try {
      await abrirCaja({ monto_inicial: monto });
      setMonto(0);
      setSinEfectivo(false);
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
        <MontoInicialCampo id="caja-apertura" label="Efectivo inicial en el cajón" monto={monto} onMonto={setMonto} sinEfectivo={sinEfectivo} onSinEfectivo={setSinEfectivo} />
        <button
          type="submit"
          disabled={saving || !montoInicialListo(monto, sinEfectivo)}
          className="h-11 w-full rounded-xl bg-rosewood text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? 'Abriendo caja...' : 'Abrir caja'}
        </button>
      </form>
    </section>
  );
};

export default AbrirCajaForm;
