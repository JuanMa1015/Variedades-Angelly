import { AlertTriangle } from 'lucide-react';

const ConfirmDialog = ({ isOpen, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'danger', onConfirm, onCancel }) => {
  if (!isOpen) return null;

  const confirmColors = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-rosewood hover:opacity-90';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-600">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${confirmColors}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
