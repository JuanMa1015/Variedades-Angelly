import { Eye, Pencil, UserCheck, UserX } from 'lucide-react';
import Skeleton from '../../../components/Skeleton';
import { telefonoLegible } from '../../../utils/whatsapp';
import { nivelDeudaCartera, textoAntiguedad } from '../nivelDeudaCartera';

const BOTON = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition';

const Nivel = ({ cliente }) => {
  const nivel = nivelDeudaCartera(cliente);
  const antiguedad = textoAntiguedad(cliente);
  return (
    <div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${nivel.bg} ${nivel.text}`}>
        <span className={`h-2 w-2 rounded-full ${nivel.dot}`} />
        {nivel.label}
      </span>
      {antiguedad && <p className="mt-1 text-xs text-gray-500">{antiguedad}</p>}
    </div>
  );
};

const EstadoCliente = ({ cliente }) => (
  cliente.activo ? <Nivel cliente={cliente} /> : <span className="text-xs font-semibold text-gray-500">Desactivado</span>
);

const Acciones = ({ cliente, onDetalle, onEditar, onDesactivar, onReactivar }) => (
  <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => onDetalle(cliente)} className={`${BOTON} border-gray-300 text-gray-700 hover:bg-gray-50`} aria-label={`Ver detalle de ${cliente.nombre}`}>
      <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Detalle
    </button>
    {cliente.activo ? (
      <>
        <button type="button" onClick={() => onEditar(cliente)} className={`${BOTON} border-blue-300 text-blue-700 hover:bg-blue-50`} aria-label={`Editar a ${cliente.nombre}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
        </button>
        <button type="button" onClick={() => onDesactivar(cliente)} className={`${BOTON} border-red-200 text-red-600 hover:bg-red-50`} aria-label={`Desactivar a ${cliente.nombre}`}>
          <UserX className="h-3.5 w-3.5" aria-hidden="true" /> Desactivar
        </button>
      </>
    ) : (
      <button type="button" onClick={() => onReactivar(cliente)} className={`${BOTON} border-emerald-200 text-emerald-700 hover:bg-emerald-50`} aria-label={`Reactivar a ${cliente.nombre}`}>
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Reactivar
      </button>
    )}
  </div>
);

// Tabla en escritorio y tarjetas en celular.
const ClientesCarteraLista = ({ clientes, loading, vacio, formatMoney, ...acciones }) => {
  if (loading) return <Skeleton lines={3} />;
  if (clientes.length === 0) return <p className="py-8 text-center text-sm text-gray-500">{vacio}</p>;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {['Cliente', 'Documento', 'WhatsApp', 'Compras', 'Deuda', 'Nivel', 'Acciones'].map((titulo) => (
                <th key={titulo} className={`px-4 py-3 font-semibold text-gray-700 ${titulo === 'Deuda' ? 'text-right' : ''}`}>{titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientes.map((cliente) => {
              const nivel = nivelDeudaCartera(cliente);
              return (
                <tr key={cliente.id} className={`border-b border-gray-100 ${cliente.activo ? '' : 'bg-gray-50/60 text-gray-400'}`}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{cliente.nombre}</td>
                  <td className="px-4 py-3 text-gray-700">{cliente.documento || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{telefonoLegible(cliente.telefono_whatsapp) || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{cliente.compras_cantidad} · {formatMoney(cliente.compras_total)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${nivel.text}`}>{formatMoney(cliente.deuda_total)}</td>
                  <td className="px-4 py-3"><EstadoCliente cliente={cliente} /></td>
                  <td className="px-4 py-3"><Acciones cliente={cliente} {...acciones} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {clientes.map((cliente) => {
          const nivel = nivelDeudaCartera(cliente);
          const borde = cliente.activo ? `border-gray-200 bg-white ${nivel.border}` : 'border-gray-200 border-l-gray-300 bg-gray-50 text-gray-400';
          return (
            <li key={cliente.id} className={`rounded-2xl border border-l-4 p-4 shadow-sm ${borde}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-gray-900">{cliente.nombre}</p>
                  <p className="mt-1 text-xs text-gray-500">Documento: {cliente.documento || '-'}</p>
                  <p className="text-xs text-gray-500">WhatsApp: {telefonoLegible(cliente.telefono_whatsapp) || '-'}</p>
                  <p className="text-xs text-gray-500">{cliente.compras_cantidad} compras · {formatMoney(cliente.compras_total)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Deuda</p>
                  <p className={`text-base font-bold ${nivel.text}`}>{formatMoney(cliente.deuda_total)}</p>
                  <div className="mt-1 flex justify-end"><EstadoCliente cliente={cliente} /></div>
                </div>
              </div>
              <div className="mt-3"><Acciones cliente={cliente} {...acciones} /></div>
            </li>
          );
        })}
      </ul>
    </>
  );
};

export default ClientesCarteraLista;
