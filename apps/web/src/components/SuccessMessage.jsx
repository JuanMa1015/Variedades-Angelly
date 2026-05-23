import { CheckCircle, X } from 'lucide-react';

const SuccessMessage = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 rounded p-0.5 text-emerald-400 hover:text-emerald-600">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export default SuccessMessage;
