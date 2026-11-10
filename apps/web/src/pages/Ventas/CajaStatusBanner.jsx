import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';

// Avisa que no hay turno abierto: las ventas de hoy no quedarian en ningun cierre de caja.
const CajaStatusBanner = ({ cajaAbierta }) => {
  const [dismissed, setDismissed] = useState(false);
  if (cajaAbierta !== false || dismissed) return null;

  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong>La caja está cerrada.</strong> Puedes vender, pero el dinero no quedará en ningún turno hasta que abras caja.
      </span>
      <Link to="/caja" className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700">
        Abrir caja
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Ocultar aviso de caja cerrada"
        className="shrink-0 rounded-full p-1 text-amber-700 transition hover:bg-amber-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default CajaStatusBanner;
