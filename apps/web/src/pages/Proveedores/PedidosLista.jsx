import { CheckCircle2, MessageCircle, RotateCcw, XCircle } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { formatDateTime, formatMoney } from '../../utils/format';
import { ESTADOS_PEDIDO } from '../../utils/pedidosProveedor';
import { whatsappNumber } from '../../utils/whatsapp';

const BOTON = 'inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

const Estado = ({ pedido }) => {
  const estado = ESTADOS_PEDIDO[pedido.estado] ?? { etiqueta: pedido.estado || 'Sin estado', clases: 'bg-gray-100 text-gray-700' };
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estado.clases}`}>{estado.etiqueta}</span>
      {pedido.factura_id && <span className="text-xs text-gray-500">Factura #{pedido.factura_id}</span>}
      {pedido.nota && <span className="max-w-[160px] truncate text-xs text-gray-500" title={pedido.nota}>{pedido.nota}</span>}
    </span>
  );
};

// Acciones segun el estado: pendiente se recibe o se cancela; cerrado se puede reabrir (salvo si lo cumplio una factura).
const Acciones = ({ pedido, tieneWhatsapp, onWhatsapp, onEstado }) => (
  <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => onWhatsapp(pedido)} disabled={!tieneWhatsapp} className={`${BOTON} border-emerald-200 text-emerald-700 hover:bg-emerald-50`} title={tieneWhatsapp ? 'Enviar de nuevo por WhatsApp' : 'El proveedor no tiene WhatsApp'}>
      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
    </button>
    {pedido.estado === 'enviado' && (
      <>
        <button type="button" onClick={() => onEstado(pedido, 'recibido')} className={`${BOTON} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Recibido
        </button>
        <button type="button" onClick={() => onEstado(pedido, 'cancelado')} className={`${BOTON} border-red-200 text-red-600 hover:bg-red-50`}>
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Cancelar
        </button>
      </>
    )}
    {pedido.estado !== 'enviado' && !pedido.factura_id && (
      <button type="button" onClick={() => onEstado(pedido, 'enviado')} className={`${BOTON} border-gray-300 text-gray-600 hover:bg-gray-50`}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reabrir
      </button>
    )}
  </div>
);

const PedidosLista = ({ pedidos, loading, vacio, proveedoresPorId, onWhatsapp, onEstado }) => {
  if (loading) return <Skeleton lines={3} />;
  if (pedidos.length === 0) return <p className="py-8 text-center text-sm text-gray-500">{vacio}</p>;
  const tieneWhatsapp = (pedido) => Boolean(whatsappNumber(proveedoresPorId.get(Number(pedido.proveedor_id))?.telefono));

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {['Pedido', 'Proveedor', 'Detalle', 'Monto', 'Estado', 'Creado', 'Acciones'].map((titulo) => (
                <th key={titulo} className="px-3 py-3 font-semibold text-gray-700">{titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pedidos.map((pedido) => (
              <tr key={pedido.id} className="border-b border-gray-100 align-top">
                <td className="px-3 py-3 font-semibold text-gray-900">#{pedido.id}</td>
                <td className="px-3 py-3 font-medium text-gray-900">{pedido.proveedor_nombre}</td>
                <td className="max-w-[240px] truncate px-3 py-3 text-gray-700" title={pedido.descripcion}>{pedido.descripcion}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-900">{formatMoney(pedido.monto_estimado)}</td>
                <td className="px-3 py-3"><Estado pedido={pedido} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-600">{pedido.creado_por}<br />{formatDateTime(pedido.fecha_creacion)}</td>
                <td className="px-3 py-3"><Acciones pedido={pedido} tieneWhatsapp={tieneWhatsapp(pedido)} onWhatsapp={onWhatsapp} onEstado={onEstado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {pedidos.map((pedido) => (
          <li key={pedido.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="font-semibold text-gray-900">#{pedido.id} · {pedido.proveedor_nombre}</span>
              <Estado pedido={pedido} />
            </div>
            <p className="mb-2 line-clamp-3 text-sm text-gray-600">{pedido.descripcion}</p>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold text-gray-900">{formatMoney(pedido.monto_estimado)}</span>
              <span className="text-xs text-gray-500">{pedido.creado_por} · {formatDateTime(pedido.fecha_creacion)}</span>
            </div>
            <Acciones pedido={pedido} tieneWhatsapp={tieneWhatsapp(pedido)} onWhatsapp={onWhatsapp} onEstado={onEstado} />
          </li>
        ))}
      </ul>
    </>
  );
};

export default PedidosLista;
