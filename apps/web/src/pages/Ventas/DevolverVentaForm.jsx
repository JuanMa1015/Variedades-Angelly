import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatMoney } from '../../utils/format';
import { productosPorDevolver, valorDeDevolucion } from './historyHelpers';

const INPUT = 'h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20';

const Cantidad = ({ producto, valor, onChange }) => (
  <div className="inline-flex shrink-0 items-center rounded-full border border-gray-300 bg-white">
    <button
      type="button"
      onClick={() => onChange(Math.max(0, valor - 1))}
      disabled={valor <= 0}
      aria-label={`Devolver una unidad menos de ${producto.nombre}`}
      className="flex h-7 w-7 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
    >
      <Minus className="h-3.5 w-3.5" />
    </button>
    <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums" aria-label={`A devolver de ${producto.nombre}: ${valor}`}>{valor}</span>
    <button
      type="button"
      onClick={() => onChange(Math.min(producto.restante, valor + 1))}
      disabled={valor >= producto.restante}
      aria-label={`Devolver una unidad más de ${producto.nombre}`}
      className="flex h-7 w-7 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  </div>
);

// Devolver una parte de la venta: el producto vuelve al stock y el dinero sale de la caja abierta por el mismo medio de pago.
// La autoriza un administrador (el vendedor pide su clave), igual que una anulación.
const DevolverVentaForm = ({ venta, pideAutorizacion, saving, error, onSubmit, onCancel }) => {
  const productos = useMemo(() => productosPorDevolver(venta), [venta]);
  const [cantidades, setCantidades] = useState({});
  const [motivo, setMotivo] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  const elegidos = productos.filter((producto) => (cantidades[producto.producto_id] ?? 0) > 0);
  const valor = valorDeDevolucion(venta, cantidades);
  const listo = elegidos.length > 0 && motivo.trim().length >= 3 && (!pideAutorizacion || (usuario.trim() && password));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!listo || saving) return;
    onSubmit({
      items: elegidos.map((producto) => ({ producto_id: producto.producto_id, cantidad: cantidades[producto.producto_id] })),
      motivo: motivo.trim(),
      autorizadorUsuario: usuario.trim(),
      autorizadorPassword: password,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-3 rounded-lg bg-amber-50 p-3" aria-label={`Devolver productos de la venta ${venta.venta_id}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Productos que devuelve el cliente</p>
      <ul className="space-y-2">
        {productos.map((producto) => (
          <li key={producto.producto_id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-gray-800">
              {producto.nombre} <span className="text-xs text-gray-500">(quedan {producto.restante})</span>
            </span>
            <Cantidad producto={producto} valor={cantidades[producto.producto_id] ?? 0} onChange={(n) => setCantidades((actual) => ({ ...actual, [producto.producto_id]: n }))} />
          </li>
        ))}
      </ul>
      <input className={INPUT} value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Motivo (ej: producto en mal estado)" aria-label="Motivo de la devolución" maxLength={200} />
      {pideAutorizacion && (
        <div className="grid grid-cols-2 gap-2">
          <input className={INPUT} value={usuario} onChange={(event) => setUsuario(event.target.value)} placeholder="Usuario del administrador" aria-label="Usuario del administrador" autoComplete="off" />
          <input className={INPUT} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Clave del administrador" aria-label="Clave del administrador" autoComplete="off" />
        </div>
      )}
      <p className="text-sm text-gray-700">
        Se devolverán <strong className="tabular-nums">{formatMoney(valor)}</strong>
        {venta.es_fiado ? ' (primero baja lo que el cliente debe de esta venta; solo el resto sale en dinero).' : ' por el mismo medio con que pagó.'}
      </p>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-white">Cancelar</button>
        <button type="submit" disabled={!listo || saving} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50">
          {saving ? 'Devolviendo…' : 'Confirmar devolución'}
        </button>
      </div>
    </form>
  );
};

export default DevolverVentaForm;
