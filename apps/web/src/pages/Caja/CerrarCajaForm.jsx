import { useState } from 'react';
import { Calculator, Lock } from 'lucide-react';
import { cerrarCaja } from '../../api/cajaApi';
import { formatMoney } from '../../utils/format';
import MoneyInput from '../Ventas/MoneyInput';
import { DENOMINACIONES, describirCierre, etiquetaDescuadre, totalPorDenominaciones } from './cajaHelpers';

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

// Cuenta el cajon por billetes y monedas: el total llena el efectivo contado.
const ContadorBilletes = ({ conteo, onChange }) => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3" aria-label="Contador de billetes y monedas">
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {DENOMINACIONES.map((valor) => (
        <label key={valor} className="flex items-center justify-between gap-2 text-sm text-gray-700">
          <span className="tabular-nums">{formatMoney(valor)}</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={conteo[valor] ?? ''}
            onChange={(event) => onChange(valor, event.target.value)}
            aria-label={`Cantidad de ${formatMoney(valor)}`}
            className="h-8 w-16 rounded-md border border-gray-300 px-2 text-right text-sm tabular-nums focus:border-rosewood focus:outline-none"
          />
        </label>
      ))}
    </div>
    <p className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-semibold text-gray-800">
      <span>Total contado</span>
      <span className="tabular-nums">{formatMoney(totalPorDenominaciones(conteo))}</span>
    </p>
  </div>
);

const CerrarCajaForm = ({ saldoEsperado, confirmar, onClosed, onError }) => {
  const [contando, setContando] = useState(false);
  const [conteo, setConteo] = useState({});
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
      setConteo({});
      setContando(false);
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
        <button
          type="button"
          onClick={() => setContando((actual) => !actual)}
          aria-expanded={contando}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-rosewood hover:underline"
        >
          <Calculator className="h-3.5 w-3.5" aria-hidden="true" /> {contando ? 'Ocultar el contador' : 'Contar por billetes y monedas'}
        </button>
        {contando && (
          <ContadorBilletes
            conteo={conteo}
            onChange={(valor, cantidad) => {
              const siguiente = { ...conteo, [valor]: cantidad };
              setConteo(siguiente);
              setContado(totalPorDenominaciones(siguiente));
              setEscrito(true);
            }}
          />
        )}
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
