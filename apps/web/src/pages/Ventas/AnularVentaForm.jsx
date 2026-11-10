import { useState } from 'react';

const INPUT = 'h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20';

// Motivo obligatorio. Quien no es administrador debe ademas pedir la clave de uno.
const AnularVentaForm = ({ pideAutorizacion, saving, error, onSubmit, onCancel }) => {
  const [motivo, setMotivo] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  const listo = motivo.trim().length >= 3 && (!pideAutorizacion || (usuario.trim() && password));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!listo || saving) return;
    onSubmit({ motivo: motivo.trim(), autorizadorUsuario: usuario.trim(), autorizadorPassword: password });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-lg bg-red-50 p-3">
      <input
        className={INPUT}
        value={motivo}
        onChange={(event) => setMotivo(event.target.value)}
        placeholder="Motivo (ej: error al digitar)"
        aria-label="Motivo de la anulación"
        maxLength={200}
      />
      {pideAutorizacion && (
        <div className="grid grid-cols-2 gap-2">
          <input
            className={INPUT}
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            placeholder="Usuario del administrador"
            aria-label="Usuario del administrador"
            autoComplete="off"
          />
          <input
            className={INPUT}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Clave del administrador"
            aria-label="Clave del administrador"
            autoComplete="off"
          />
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-white">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!listo || saving}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? 'Anulando…' : 'Confirmar anulación'}
        </button>
      </div>
    </form>
  );
};

export default AnularVentaForm;
