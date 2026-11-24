import { useEffect } from 'react';
import { X } from 'lucide-react';

// Cuadro de dialogo. En el celular es una hoja que sube desde abajo y nunca pasa de la pantalla: la cabecera queda fija
// y el contenido se desplaza por dentro (antes, un formulario alto se salia por arriba y por abajo y no se podia guardar).
const Modal = ({ isOpen, onClose, title, subtitle, maxWidth = 'max-w-lg', variant = 'default', children }) => {
  // Con el cuadro abierto la pagina de atras no se mueve.
  useEffect(() => {
    if (!isOpen) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, [isOpen]);

  if (!isOpen) return null;

  const admin = variant === 'admin';
  const backdropClass = admin ? 'bg-black/45' : 'bg-black/50';
  const containerClass = admin
    ? `w-full ${maxWidth} rounded-[28px] bg-white shadow-2xl`
    : `w-full ${maxWidth} rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`;
  const closeBtnClass = admin
    ? 'rounded-full border border-blush-300 p-2 text-rosewood transition hover:bg-blush-50'
    : 'rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700';
  const tituloClass = `text-xl font-bold ${admin ? 'text-rosewood' : 'text-gray-900'}`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center ${backdropClass} sm:items-center sm:px-4 sm:py-6`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${containerClass} flex max-h-[92dvh] flex-col sm:max-h-[calc(100dvh-3rem)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
          {subtitle ? (
            <div>
              <h3 className={tituloClass}>{title}</h3>
              <p className={`text-sm ${admin ? 'text-rosewood/70' : 'text-gray-500'}`}>{subtitle}</p>
            </div>
          ) : (
            <h3 className={tituloClass}>{title}</h3>
          )}
          <button type="button" onClick={onClose} className={closeBtnClass} aria-label="Cerrar modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
