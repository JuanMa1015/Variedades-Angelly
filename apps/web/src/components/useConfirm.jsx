import { useCallback, useState } from 'react';

const useConfirm = () => {
  const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', variant: 'danger', resolve: null });

  const confirm = useCallback(({ title = 'Confirmar', message = '¿Estás seguro?', variant = 'danger' } = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ isOpen: true, title, message, variant, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    confirmState.resolve?.(true);
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, [confirmState]);

  const handleCancel = useCallback(() => {
    confirmState.resolve?.(false);
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, [confirmState]);

  const ConfirmModal = confirmState.isOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-gray-900">{confirmState.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{confirmState.message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${confirmState.variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-rosewood hover:opacity-90'}`}
          >
            {confirmState.variant === 'danger' ? 'Eliminar' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmModal };
};

export default useConfirm;
