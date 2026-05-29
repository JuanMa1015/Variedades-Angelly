import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, subtitle, maxWidth = 'max-w-lg', variant = 'default', children }) => {
  if (!isOpen) return null;

  const backdropClass = variant === 'admin' ? 'bg-black/45' : 'bg-black/50';
  const containerClass = variant === 'admin'
    ? `w-full ${maxWidth} rounded-[28px] bg-white p-5 shadow-2xl sm:p-6`
    : `w-full ${maxWidth} rounded-2xl bg-white p-5 shadow-2xl sm:p-6`;
  const closeBtnClass = variant === 'admin'
    ? 'rounded-full border border-blush-300 p-2 text-rosewood transition hover:bg-blush-50'
    : 'rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${backdropClass} px-4 py-6`} onClick={onClose}>
      <div className={containerClass} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          {subtitle ? (
            <div>
              <h3 className={`text-xl font-bold ${variant === 'admin' ? 'text-rosewood' : 'text-gray-900'}`}>{title}</h3>
              <p className={`text-sm ${variant === 'admin' ? 'text-rosewood/70' : 'text-gray-500'}`}>{subtitle}</p>
            </div>
          ) : (
            <h3 className={`text-xl font-bold ${variant === 'admin' ? 'text-rosewood' : 'text-gray-900'}`}>{title}</h3>
          )}
          <button type="button" onClick={onClose} className={closeBtnClass} aria-label="Cerrar modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
