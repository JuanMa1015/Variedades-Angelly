import { History, SlidersHorizontal, UserCheck, UserX } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { formatMoney } from '../../utils/format';
import { telefonoLegible } from '../../utils/whatsapp';
import { estadoDeCanje } from './fidelizacionHelpers';

const BOTON = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition';

const Estado = ({ cliente, umbral }) => {
  const estado = estadoDeCanje(cliente, umbral);
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estado.clases}`}>{estado.texto}</span>;
};

// Historial para todos; ajustar, desactivar y reactivar solo para quien administra.
const Acciones = ({ cliente, puedeAdministrar, onHistorial, onAjustar, onDesactivar, onReactivar }) => (
  <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => onHistorial(cliente)} className={`${BOTON} border-gray-300 text-gray-700 hover:bg-gray-50`} aria-label={`Historial de ${cliente.nombre}`}>
      <History className="h-3.5 w-3.5" aria-hidden="true" /> Historial
    </button>
    {puedeAdministrar && cliente.activo && (
      <>
        <button type="button" onClick={() => onAjustar(cliente)} className={`${BOTON} border-rosewood text-rosewood hover:bg-rosewood/5`} aria-label={`Ajustar puntos de ${cliente.nombre}`}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Ajustar
        </button>
        <button type="button" onClick={() => onDesactivar(cliente)} className={`${BOTON} border-red-200 text-red-600 hover:bg-red-50`} aria-label={`Desactivar a ${cliente.nombre}`}>
          <UserX className="h-3.5 w-3.5" aria-hidden="true" /> Desactivar
        </button>
      </>
    )}
    {puedeAdministrar && !cliente.activo && (
      <button type="button" onClick={() => onReactivar(cliente)} className={`${BOTON} border-emerald-200 text-emerald-700 hover:bg-emerald-50`} aria-label={`Reactivar a ${cliente.nombre}`}>
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Reactivar
      </button>
    )}
  </div>
);

// Tabla en escritorio y tarjetas en celular. Cada puntaje dice cuanto vale en descuento.
const ClientesLista = ({ clientes, loading, vacio, umbral, valorPunto, ...acciones }) => {
  if (loading) return <Skeleton lines={3} />;
  if (clientes.length === 0) return <p className="py-8 text-center text-sm text-gray-500">{vacio}</p>;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {['Nombre', 'WhatsApp', 'Puntos', 'Valor', 'Estado', 'Acciones'].map((titulo) => (
                <th key={titulo} className="px-4 py-3 font-semibold text-gray-700">{titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientes.map((cliente) => (
              <tr key={cliente.id} className={`border-b border-gray-100 ${cliente.activo ? '' : 'bg-gray-50/60 text-gray-400'}`}>
                <td className="px-4 py-3 font-semibold text-gray-900">{cliente.nombre}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-700">{telefonoLegible(cliente.telefono_whatsapp) || '-'}</td>
                <td className={`px-4 py-3 font-bold tabular-nums ${cliente.puntos_acumulados >= umbral && cliente.activo ? 'text-emerald-700' : 'text-gray-700'}`}>{cliente.puntos_acumulados}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">{formatMoney(cliente.puntos_acumulados * valorPunto)}</td>
                <td className="px-4 py-3"><Estado cliente={cliente} umbral={umbral} /></td>
                <td className="px-4 py-3"><Acciones cliente={cliente} {...acciones} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {clientes.map((cliente) => (
          <li key={cliente.id} className={`rounded-xl border p-4 shadow-sm ${cliente.activo ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
            <div className="mb-1 flex items-start justify-between gap-2">
              <span className="font-semibold text-gray-900">{cliente.nombre}</span>
              <Estado cliente={cliente} umbral={umbral} />
            </div>
            <p className="text-sm text-gray-600">{telefonoLegible(cliente.telefono_whatsapp) || '-'}</p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-black tabular-nums ${cliente.puntos_acumulados >= umbral && cliente.activo ? 'text-emerald-700' : 'text-gray-800'}`}>{cliente.puntos_acumulados}</span>
              <span className="text-sm text-gray-500">puntos · {formatMoney(cliente.puntos_acumulados * valorPunto)}</span>
            </p>
            <div className="mt-3"><Acciones cliente={cliente} {...acciones} /></div>
          </li>
        ))}
      </ul>
    </>
  );
};

export default ClientesLista;
