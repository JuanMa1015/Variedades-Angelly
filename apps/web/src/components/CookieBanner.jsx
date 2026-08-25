import { useState } from 'react';
import { Cookie } from 'lucide-react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'angelly.cookies.consent';

const CookieBanner = () => {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(CONSENT_KEY);
    } catch {
      return true;
    }
  });

  if (!visible) return null;

  const accept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'accepted');
    } catch {
      // Sin localStorage (modo privado estricto): solo ocultar en esta sesion.
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-blush-300 bg-white/95 p-4 shadow-lg backdrop-blur sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-md"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-[#a9646a]" aria-hidden="true" />
        <div className="text-sm text-rosewood">
          <p className="font-semibold">Uso de cookies</p>
          <p className="mt-1 text-rosewood/80">
            Este panel usa unicamente cookies esenciales de sesion para mantener tu
            autenticacion. No usamos cookies publicitarias ni de rastreo. Mas detalle en
            nuestra{' '}
            <Link to="/privacidad" className="font-semibold underline hover:text-[#7c3f44]">
              Politica de Privacidad
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={accept}
            className="mt-3 w-full rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300/90 sm:w-auto"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
