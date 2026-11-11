import { useEffect, useState } from 'react';
import { CheckCircle, MessageCircle } from 'lucide-react';
import { fetchReposicion, registrarPedido } from '../../api/inventarioApi';
import Modal from '../../components/Modal';
import { formatMoney } from '../../utils/format';
import { buildWhatsappUrl } from '../../utils/whatsapp';
import { descripcionPedido, mensajePedido, montoDeItems } from './inventarioHelpers';

const INPUT_NUM = 'w-16 rounded-md border border-gray-300 px-2 py-1 text-right text-sm tabular-nums focus:border-rosewood focus:outline-none';

const Aviso = ({ children }) => <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{children}</p>;

// Cada producto con su cantidad a pedir: se puede ajustar o descartar antes de enviar.
const FilaProducto = ({ producto, linea, onCambio }) => (
  <li className="flex items-center gap-3 py-2">
    <input type="checkbox" checked={linea.incluir} onChange={(e) => onCambio({ ...linea, incluir: e.target.checked })} aria-label={`Incluir ${producto.nombre}`} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-gray-900">{producto.nombre}</p>
      <p className="text-xs text-gray-500">Hay {producto.stock_actual} · mínimo {producto.stock_minimo}</p>
    </div>
    <input
      type="number"
      min="1"
      value={linea.cantidad}
      onChange={(e) => onCambio({ ...linea, cantidad: e.target.value })}
      aria-label={`Cantidad de ${producto.nombre}`}
      className={INPUT_NUM}
    />
  </li>
);

const GrupoSinProveedor = ({ grupo }) => (
  <section className="space-y-2 rounded-xl border border-gray-200 p-4">
    <h3 className="font-bold text-gray-900">Sin proveedor asignado</h3>
    <Aviso>No se pueden pedir hasta que tengan proveedor: edita cada producto y elígelo.</Aviso>
    <p className="text-sm text-gray-600">{grupo.productos.map((p) => p.nombre).join(', ')}</p>
  </section>
);

const GrupoProveedor = ({ grupo }) => {
  const [lineas, setLineas] = useState(() => Object.fromEntries(grupo.productos.map((p) => [p.id, { incluir: true, cantidad: String(p.sugerido) }])));
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const items = grupo.productos
    .filter((p) => lineas[p.id].incluir && Number(lineas[p.id].cantidad) > 0)
    .map((p) => ({ nombre: p.nombre, cantidad: Number(lineas[p.id].cantidad), costo: p.costo }));
  const monto = montoDeItems(items);

  const handlePedir = async () => {
    setSaving(true);
    setError('');
    try {
      const creado = await registrarPedido({ proveedorId: grupo.proveedor_id, descripcion: descripcionPedido(items), monto });
      setPedido(creado);
      const enlace = buildWhatsappUrl(grupo.telefono, mensajePedido({ proveedor: grupo.proveedor_nombre, items, pedidoId: creado.id, monto, formatMoney }));
      if (enlace) window.open(enlace, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message || 'No fue posible registrar el pedido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-gray-900">{grupo.proveedor_nombre}</h3>
        <span className="text-sm font-semibold tabular-nums text-gray-700">{formatMoney(monto)} estimado</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {grupo.productos.map((p) => (
          <FilaProducto key={p.id} producto={p} linea={lineas[p.id]} onCambio={(nueva) => setLineas((actual) => ({ ...actual, [p.id]: nueva }))} />
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {pedido ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          <CheckCircle className="h-4 w-4" aria-hidden="true" /> Pedido #{pedido.id} registrado
          {!buildWhatsappUrl(grupo.telefono, ['x']) && ' (el proveedor no tiene un WhatsApp válido: avísale por otro medio)'}
        </p>
      ) : (
        <button
          type="button"
          onClick={handlePedir}
          disabled={saving || items.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Registrando...' : 'Registrar pedido y enviar por WhatsApp'}
        </button>
      )}
    </section>
  );
};

const Contenido = () => {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchReposicion({ signal: controller.signal })
      .then(setDatos)
      .catch((err) => { if (err?.name !== 'AbortError') setError(err.message || 'No fue posible calcular la reposición'); });
    return () => controller.abort();
  }, []);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!datos) return <p className="py-6 text-center text-sm text-gray-500">Calculando qué falta...</p>;
  if (datos.grupos.length === 0) return <p className="py-6 text-center text-sm text-gray-500">No hay productos agotados ni por agotarse. Nada que pedir por ahora.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{datos.total_productos} productos agotados o por agotarse. Se sugiere pedir hasta tener el doble del mínimo; ajusta las cantidades o descarta lo que no necesites.</p>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {datos.grupos.map((grupo) => (grupo.proveedor_id
          ? <GrupoProveedor key={grupo.proveedor_id} grupo={grupo} />
          : <GrupoSinProveedor key="sin-proveedor" grupo={grupo} />))}
      </div>
    </div>
  );
};

const ReposicionModal = ({ abierto, onClose }) => (
  <Modal isOpen={abierto} onClose={onClose} title="Reponer stock" subtitle="Pedido sugerido por proveedor" maxWidth="max-w-2xl">
    {abierto && <Contenido />}
  </Modal>
);

export default ReposicionModal;
