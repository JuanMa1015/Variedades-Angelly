import { Edit, History, MessageCircle, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { formatMoney } from '../../utils/format';
import { describirAntiguedad, estadoDe, formatPhone, whatsappNumber } from './tiendaHelpers';

const BOTON = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition';

// Por que no se puede eliminar (null si se puede).
const motivoSinEliminar = (cliente) => {
  if (cliente.deuda_total > 0) return 'Cobra o ajusta la deuda antes de eliminar';
  if (cliente.tiene_ventas) return 'Tiene historial de ventas: no se elimina';
  return null;
};

const Acciones = ({ cliente, onAbonar, onHistorial, onWhatsapp, onEditar, onEliminar }) => {
  const debe = cliente.deuda_total > 0;
  const sinEliminar = motivoSinEliminar(cliente);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onAbonar(cliente)}
        disabled={!debe}
        title={debe ? undefined : 'No tiene deuda para abonar'}
        className={`${BOTON} border-rosewood bg-rosewood text-white hover:opacity-90 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400`}
      >
        <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Abonar
      </button>
      <button type="button" onClick={() => onHistorial(cliente)} className={`${BOTON} border-gray-300 text-gray-700 hover:bg-gray-50`}>
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Historial
      </button>
      {debe && (
        <button
          type="button"
          onClick={() => onWhatsapp(cliente)}
          disabled={!whatsappNumber(cliente.telefono_whatsapp)}
          title={whatsappNumber(cliente.telefono_whatsapp) ? 'Enviar recordatorio de cobro' : 'Agrega un WhatsApp válido para cobrar por mensaje'}
          className={`${BOTON} border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent`}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Recordar
        </button>
      )}
      <button type="button" onClick={() => onEditar(cliente)} className={`${BOTON} border-blue-300 text-blue-700 hover:bg-blue-50`}>
        <Edit className="h-3.5 w-3.5" aria-hidden="true" /> Editar
      </button>
      <button
        type="button"
        onClick={() => onEliminar(cliente)}
        disabled={sinEliminar !== null}
        title={sinEliminar ?? undefined}
        className={`${BOTON} border-red-300 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Eliminar
      </button>
    </div>
  );
};

// Un cliente: el borde de color y la etiqueta dicen su estado, el monto y los dias dicen cuanto y desde cuando.
const ClienteFila = ({ cliente, onReactivar, ...acciones }) => {
  const estado = estadoDe(cliente);
  const telefono = formatPhone(cliente.telefono_whatsapp);
  const antiguedad = describirAntiguedad(cliente.dias_deuda);

  return (
    <li className={`rounded-2xl border border-gray-200 border-l-4 bg-white p-4 shadow-sm ${estado.borde}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-gray-900">{cliente.nombre}</p>
          <p className="text-sm text-gray-500">{telefono || 'Sin WhatsApp'}</p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-black tabular-nums ${cliente.deuda_total > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{formatMoney(cliente.deuda_total)}</p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.chip}`}>
            <span className={`h-2 w-2 rounded-full ${estado.punto}`} aria-hidden="true" />
            {estado.etiqueta}
          </span>
          {cliente.deuda_total > 0 && <p className="mt-0.5 text-xs text-gray-500">{antiguedad || 'Sin fecha de la deuda'}</p>}
        </div>
      </div>
      <div className="mt-3">
        {cliente.activo ? (
          <Acciones cliente={cliente} {...acciones} />
        ) : (
          <button type="button" onClick={() => onReactivar(cliente)} className={`${BOTON} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reactivar
          </button>
        )}
      </div>
    </li>
  );
};

export default ClienteFila;
