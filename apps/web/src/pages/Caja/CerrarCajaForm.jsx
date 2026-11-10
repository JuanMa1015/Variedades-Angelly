import { useState } from 'react';
import { Lock } from 'lucide-react';
import { cerrarCaja } from '../../api/cajaApi';
import { formatMoney } from '../../utils/format';
import MoneyInput from '../Ventas/MoneyInput';
import { describirCierre, etiquetaDescuadre } from './cajaHelpers';

const TONOS = {
  ok: 'border-green-200 bg-green-50 text-green-800',
  sobra: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  falta: 'border-red-200 bg-red-50 text-red-800',
};

// Si el sistema ya muestra el esperado se compara en vivo; si no (cierre ciego) solo se cuenta.
const Comparacion = ({ contado, esperado }) => {
  const etiqueta = etiquetaDescuadre(contado - esperado);
  return (
    <div className={`rounded-lg border p-3 text-sm ${TONOS[etiqueta.tono]}`}>
      <p className="flex justify-between">
        <span className="font-semibold">Descuadre:</span>
        <span className="font-bold">{etiqueta.texto}</span>
      </p>
    </div>
  );
};

const CerrarCajaForm = ({ saldoEsperado, confirmar, onClosed, onError }) => {
  const [contado, setContado] = useState(0);
  const [escrito, setEscrito] = useState(false);
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    onError('');
    if (!escrito) {
      onError('Cuenta el efectivo del cajón y escribe el total (si no hay nada, escribe 0)');
      return;
    }
    // Un cero de más o de menos cambia todo el cuadre: se confirma lo escrito antes de cerrar.
    const seguro = await confirmar({
      title: 'Cerrar la caja',
      variant: 'primary',
      message: `Vas a cerrar el turno con ${formatMoney(contado)} contados en el cajón. Después no se puede reabrir.`,
    });
    if (!seguro) return;

    setSaving(true);
    try {
      const cierre = await cerrarCaja({ monto_cierre: contado, observaciones: nota.trim() });
      setContado(0);
      setEscrito(false);
      setNota('');
      await onClosed(describirCierre(cierre));
    } catch (err) {
      onError(err.message || 'No se pudo cerrar la caja');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Lock className="h-5 w-5 text-rosewood" aria-hidden="true" />
        <h2 className="text-xl font-bold text-gray-900">Cerrar caja</h2>
      </div>
      {saldoEsperado == null && (
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          Cuenta el efectivo del cajón y escribe el total. El sistema comparará al cerrar.
        </p>
      )}
      <form className="space-y-3" onSubmit={handleSubmit}>
        <MoneyInput
          id="caja-cierre"
          label="Efectivo contado en el cajón"
          value={contado}
          onChange={(valor) => { setContado(valor); setEscrito(true); }}
          placeholder="Monto final en caja"
          large
        />
        {escrito && saldoEsperado != null && <Comparacion contado={contado} esperado={saldoEsperado} />}
        <textarea
          value={nota}
          onChange={(event) => setNota(event.target.value)}
          rows={2}
          maxLength={500}
          aria-label="Nota del cierre"
          placeholder="Nota (opcional): explica un faltante o sobrante"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20"
        />
        <button
          type="submit"
          disabled={saving}
          className="h-11 w-full rounded-xl bg-red-600 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? 'Cerrando caja...' : 'Cerrar caja'}
        </button>
      </form>
    </section>
  );
};

export default CerrarCajaForm;
