import { useCallback } from 'react';
import Modal from '../../components/Modal';

const INPUT_CLASS = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20';

const NewClientModal = ({ isOpen, onClose, name, phone, onNameChange, onPhoneChange, onSubmit, saving }) => {
  // Enfoca el nombre al abrir el dialogo (ref estable: solo se ejecuta al montar el campo).
  const focusOnMount = useCallback((node) => node?.focus(), []);

  return (
  <Modal isOpen={isOpen} onClose={onClose} title="Nuevo cliente fiado tienda" subtitle="Tienda Angelly">
    <form className="space-y-4" onSubmit={onSubmit}>
      <input
        type="text"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        className={INPUT_CLASS}
        placeholder="Nombre del cliente"
        aria-label="Nombre del cliente"
        maxLength={120}
        ref={focusOnMount}
      />
      <input
        type="text"
        value={phone}
        onChange={(event) => onPhoneChange(event.target.value)}
        className={INPUT_CLASS}
        placeholder="WhatsApp (opcional)"
        aria-label="WhatsApp del cliente"
        maxLength={25}
      />
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-rosewood px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? 'Guardando...' : 'Guardar cliente'}
        </button>
      </div>
    </form>
  </Modal>
  );
};

export default NewClientModal;
