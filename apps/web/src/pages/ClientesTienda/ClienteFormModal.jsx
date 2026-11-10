import { useState } from 'react';
import Modal from '../../components/Modal';
import MoneyInput from '../Ventas/MoneyInput';
import { formatPhone, isValidPhone } from './tiendaHelpers';

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none';

// El WhatsApp se escribe como cada quien quiera; el servidor lo guarda siempre como 57 + 10 digitos.
const PistaTelefono = ({ valor }) => {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return <p className="mt-1 text-xs text-gray-500">Opcional. Sirve para recordar cobros por WhatsApp.</p>;
  if (!isValidPhone(valor)) return <p role="alert" className="mt-1 text-xs text-red-600">Debe tener 7 (fijo de Bogotá), 10 (celular) o 12 dígitos (con 57).</p>;
  return <p className="mt-1 text-xs text-gray-500">Se guardará como {formatPhone(valor)}.</p>;
};

// Formulario con su propio estado: se monta al abrir el cuadro y siempre parte del cliente elegido.
const Formulario = ({ cliente, onSubmit, onClose }) => {
  const editando = cliente !== null;
  const deudaOriginal = Number(cliente?.deuda_total || 0);
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono_whatsapp ?? '');
  const [deuda, setDeuda] = useState(deudaOriginal);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // La deuda solo cambia con motivo: queda registrada con quien la ajusto, el valor anterior y el nuevo.
  const deudaAjustada = editando && deuda !== deudaOriginal;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nombreLimpio = nombre.trim().replace(/\s+/g, ' ');
    if (nombreLimpio.length < 3) { setError('Escribe el nombre del cliente (mínimo 3 letras)'); return; }
    if (!isValidPhone(telefono)) { setError('El WhatsApp no tiene un formato válido'); return; }
    if (deudaAjustada && motivo.trim().length < 3) { setError('Escribe el motivo del ajuste de la deuda (mínimo 3 letras)'); return; }

    const payload = { nombre: nombreLimpio, telefono_whatsapp: telefono.replace(/\D/g, '') || null };
    if (deudaAjustada) {
      payload.deuda_total = deuda;
      payload.motivo_ajuste = motivo.trim();
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit(payload, cliente?.id ?? null);
    } catch (err) {
      setError(err.message || 'No fue posible guardar el cliente');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div>
        <label htmlFor="cliente-nombre" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Nombre</label>
        <input id="cliente-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Nombre del cliente" className={`${INPUT} border-gray-300 focus:border-rosewood`} />
      </div>
      <div>
        <label htmlFor="cliente-telefono" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">WhatsApp</label>
        <input id="cliente-telefono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={25} placeholder="300 111 2233" className={`${INPUT} ${telefono && !isValidPhone(telefono) ? 'border-red-400' : 'border-gray-300 focus:border-rosewood'}`} />
        <PistaTelefono valor={telefono} />
      </div>
      {editando && (
        <div className="space-y-2">
          <label htmlFor="cliente-deuda" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Deuda total</label>
          <MoneyInput id="cliente-deuda" label="Deuda total" value={deuda} onChange={setDeuda} placeholder="0" />
          <p className="text-xs text-gray-500">Si cambias la deuda queda registrado con tu usuario, el valor anterior y el motivo. Para cobrar usa «Abonar».</p>
          {deudaAjustada && (
            <input type="text" aria-label="Motivo del ajuste" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo del ajuste (obligatorio)" className={`${INPUT} border-amber-300 bg-amber-50 focus:border-amber-500`} />
          )}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
          {saving ? 'Guardando...' : editando ? 'Actualizar' : 'Guardar'}
        </button>
      </div>
    </form>
  );
};

// `abierto` muestra el cuadro; `cliente` null es un alta y un objeto es la edicion de ese cliente.
const ClienteFormModal = ({ abierto, cliente, onSubmit, onClose }) => (
  <Modal isOpen={abierto} onClose={onClose} title={cliente ? 'Editar cliente' : 'Nuevo cliente'}>
    {abierto && <Formulario key={cliente?.id ?? 'nuevo'} cliente={cliente} onSubmit={onSubmit} onClose={onClose} />}
  </Modal>
);

export default ClienteFormModal;
