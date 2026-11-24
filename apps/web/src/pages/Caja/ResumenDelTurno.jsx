import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { fetchCajaResumen } from '../../api/cajaApi';
import { lineasDelResumen } from './cajaHelpers';

// Las cifras del turno en palabras: cuantas ventas, cuanto se descontó, devolvió, abonó, gastó y compró.
const ResumenDelTurno = ({ cajaId, version = 0 }) => {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchCajaResumen(cajaId, { signal: controller.signal })
      .then((datos) => { setResumen(datos); setError(''); })
      .catch((err) => { if (err?.name !== 'AbortError') setError(err.message || 'No se pudo cargar el resumen del turno'); });
    return () => controller.abort();
  }, [cajaId, version]);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!resumen) return null;

  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3" aria-label="Resumen del turno">
      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <ListChecks className="h-4 w-4" aria-hidden="true" /> Resumen del turno
      </p>
      <ul className="grid gap-x-6 gap-y-1 text-sm text-gray-700 sm:grid-cols-2">
        {lineasDelResumen(resumen).map((linea) => <li key={linea.clave}>{linea.texto}</li>)}
      </ul>
    </div>
  );
};

export default ResumenDelTurno;
