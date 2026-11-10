import { useCallback } from 'react';
import Modal from '../../components/Modal';

const INPUT_CLASS = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20';

// Inscribe a un cliente en el programa de puntos desde el mostrador. El cliente debe autorizar el uso de sus datos.
const NewLoyaltyClientModal = ({ isOpen, onClose, form, onChange, onSubmit, saving }) => {
  const focusOnMount = useCallback((node) => node?.focus(), []);
  const listo = form.nombre.trim().length >= 3 && form.telefono.replace(/\D/g, '').length >= 7 && form.aceptaDatos;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Inscribir cliente en puntos" subtitle="Gana puntos en cada compra">
      <form className="space-y-4" onSubmit={onSubmit}>
        <input
          type="text"
          value={form.nombre}
          onChange={(event) => onChange({ nombre: event.target.value })}
          className={INPUT_CLASS}
          placeholder="Nombre del cliente"
          aria-label="Nombre del cliente de fidelización"
          maxLength={120}
          ref={focusOnMount}
        />
        <input
          type="tel"
          value={form.telefono}
          onChange={(event) => onChange({ telefono: event.target.value })}
          className={INPUT_CLASS}
          placeholder="WhatsApp del cliente"
          aria-label="WhatsApp del cliente de fidelización"
          maxLength={25}
        />
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.aceptaDatos}
            onChange={(event) => onChange({ aceptaDatos: event.target.checked })}
            className="mt-0.5"
          />
          El cliente autoriza el tratamiento de sus datos (nombre y WhatsApp) para el programa de puntos.
        </label>
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
            disabled={saving || !listo}
            className="flex-1 rounded-xl bg-rosewood px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {saving ? 'Guardando...' : 'Inscribir cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default NewLoyaltyClientModal;
