import { useState } from 'react';
import { apiPatch, apiPost } from '../../api/httpClient';
import ErrorMessage from '../../components/ErrorMessage';
import Modal from '../../components/Modal';
import { telefonoLegible } from '../../utils/whatsapp';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

const Campo = ({ id, etiqueta, ayuda, ...props }) => (
  <div>
    <label htmlFor={id} className={LABEL}>{etiqueta}</label>
    <input id={id} type="text" className={INPUT} {...props} />
    {ayuda && <p className="mt-1 text-xs text-gray-500">{ayuda}</p>}
  </div>
);

// Los errores se muestran dentro del cuadro: detras de el no se verian.
const Formulario = ({ proveedor, onSaved }) => {
  const [form, setForm] = useState({
    nombre: proveedor?.nombre ?? '',
    contacto: proveedor?.contacto ?? '',
    telefono: telefonoLegible(proveedor?.telefono),
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const cambiar = (campo) => (event) => setForm((actual) => ({ ...actual, [campo]: event.target.value }));

  const guardar = async (event) => {
    event.preventDefault();
    setError('');
    const nombre = form.nombre.trim();
    if (nombre.length < 3) {
      setError('El nombre debe tener al menos 3 caracteres');
      return;
    }
    const cuerpo = { nombre, contacto: form.contacto.trim() || null, telefono: form.telefono.trim() || null };
    try {
      setGuardando(true);
      const guardado = proveedor
        ? await apiPatch(`/api/proveedores/${proveedor.id}`, cuerpo)
        : await apiPost('/api/proveedores', cuerpo);
      onSaved(guardado, proveedor ? 'Proveedor actualizado correctamente' : 'Proveedor creado correctamente');
    } catch (err) {
      setError(err.message || 'No se pudo guardar el proveedor');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={guardar} noValidate>
      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <Campo id="prov-nombre" etiqueta="Nombre" value={form.nombre} onChange={cambiar('nombre')} placeholder="Ej: Distribuidora XYZ" maxLength={120} autoFocus />
      <Campo id="prov-contacto" etiqueta="Contacto" value={form.contacto} onChange={cambiar('contacto')} placeholder="Persona con quien se habla (opcional)" maxLength={120} />
      <Campo id="prov-telefono" etiqueta="WhatsApp" value={form.telefono} onChange={cambiar('telefono')} placeholder="Ej: 300 111 2233" maxLength={25} inputMode="tel" ayuda="Celular de 10 dígitos o fijo de Bogotá de 7. Con él se envían los pedidos por WhatsApp." />
      <button type="submit" disabled={guardando} className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
        {guardando ? 'Guardando...' : proveedor ? 'Guardar cambios' : 'Guardar proveedor'}
      </button>
    </form>
  );
};

// `abierto`: false cerrado, true para uno nuevo; `proveedor` para editar. El formulario se monta solo al abrir.
const ProveedorFormModal = ({ abierto, proveedor = null, onSaved, onClose }) => (
  <Modal isOpen={abierto} onClose={onClose} title={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}>
    {abierto && <Formulario key={proveedor?.id ?? 'nuevo'} proveedor={proveedor} onSaved={onSaved} />}
  </Modal>
);

export default ProveedorFormModal;
