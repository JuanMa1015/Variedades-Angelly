import { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { fetchProductos } from '../../api/inventarioApi';
import { registrarPedido } from '../../api/proveedoresApi';
import Modal from '../../components/Modal';
import { formatMoney } from '../../utils/format';
import { MAX_DESCRIPCION, cantidadSugerida, descripcionPedido, mensajePedido, montoDeItems } from '../../utils/pedidosProveedor';
import { buildWhatsappUrl } from '../../utils/whatsapp';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const INPUT_NUM = 'w-16 rounded-md border border-gray-300 px-2 py-1 text-right text-sm tabular-nums focus:border-rosewood focus:outline-none';

// Lo que falta (agotado o en el minimo) sale marcado con la cantidad sugerida; el resto se puede agregar a mano.
const lineasIniciales = (productos) => Object.fromEntries(productos.map((p) => {
  const falta = p.stock_actual <= p.stock_minimo;
  return [p.id, { incluir: falta, cantidad: String(falta ? cantidadSugerida(p.stock_actual, p.stock_minimo) : 1) }];
}));

const FilaProducto = ({ producto, linea, onCambio }) => {
  const falta = producto.stock_actual <= producto.stock_minimo;
  return (
    <li className="flex items-center gap-3 py-2">
      <input type="checkbox" checked={linea.incluir} onChange={(e) => onCambio({ ...linea, incluir: e.target.checked })} aria-label={`Incluir ${producto.nombre}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{producto.nombre}</p>
        <p className={`text-xs ${falta ? 'font-semibold text-orange-600' : 'text-gray-500'}`}>
          Hay {producto.stock_actual} · mínimo {producto.stock_minimo}{falta && ' · falta'}
        </p>
      </div>
      <input type="number" min="1" value={linea.cantidad} onChange={(e) => onCambio({ ...linea, cantidad: e.target.value })} aria-label={`Cantidad de ${producto.nombre}`} className={INPUT_NUM} />
    </li>
  );
};

// Productos del proveedor elegido: se cargan al elegirlo y se arma el pedido sobre ellos.
const Productos = ({ proveedor, onPedido }) => {
  const [productos, setProductos] = useState(null);
  const [lineas, setLineas] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchProductos({ proveedorId: proveedor.id, limit: 200, orden: 'stock', signal: controller.signal })
      .then((pagina) => {
        if (controller.signal.aborted) return;
        const lista = Array.isArray(pagina?.data) ? pagina.data : [];
        setProductos(lista);
        setLineas(lineasIniciales(lista));
      })
      .catch((err) => { if (!controller.signal.aborted) { setError(err.message || 'No fue posible cargar los productos'); setProductos([]); } });
    return () => controller.abort();
  }, [proveedor.id]);

  const items = useMemo(() => (productos ?? [])
    .filter((p) => lineas[p.id]?.incluir && Number(lineas[p.id].cantidad) > 0)
    .map((p) => ({ nombre: p.nombre, cantidad: Math.floor(Number(lineas[p.id].cantidad)), costo: Number(p.precio_costo) })), [productos, lineas]);
  const monto = montoDeItems(items);

  const pedir = async () => {
    setError('');
    const descripcion = descripcionPedido(items);
    if (items.some((item) => !(item.costo > 0))) {
      setError('Algún producto no tiene precio de costo: edítalo en Inventario antes de pedirlo');
      return;
    }
    setSaving(true);
    try {
      const creado = await registrarPedido({ proveedorId: proveedor.id, descripcion: descripcion.slice(0, MAX_DESCRIPCION), monto });
      const enlace = buildWhatsappUrl(proveedor.telefono, mensajePedido({ proveedor: proveedor.contacto || proveedor.nombre, items, pedidoId: creado.id, monto, formatMoney }));
      if (enlace) window.open(enlace, '_blank', 'noopener,noreferrer');
      onPedido(creado, Boolean(enlace));
    } catch (err) {
      setError(err.message || 'No se pudo registrar el pedido');
      setSaving(false);
    }
  };

  if (productos === null) return <p className="py-6 text-center text-sm text-gray-500">Cargando productos de {proveedor.nombre}...</p>;
  if (productos.length === 0) {
    return <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error || `${proveedor.nombre} no tiene productos asignados: edita cada producto en Inventario y elígelo como proveedor.`}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Los productos que faltan ya van marcados con lo sugerido (hasta el doble del mínimo). Ajusta las cantidades o marca otros.</p>
      <ul className="max-h-[45vh] divide-y divide-gray-100 overflow-y-auto pr-1">
        {productos.map((p) => (
          <FilaProducto key={p.id} producto={p} linea={lineas[p.id]} onCambio={(nueva) => setLineas((actual) => ({ ...actual, [p.id]: nueva }))} />
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold tabular-nums text-gray-700">{items.length} productos · {formatMoney(monto)} estimado</span>
        <button type="button" onClick={pedir} disabled={saving || items.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Registrando...' : 'Registrar pedido y enviar por WhatsApp'}
        </button>
      </div>
      {!buildWhatsappUrl(proveedor.telefono, ['x']) && <p className="text-xs text-gray-500">Este proveedor no tiene un WhatsApp válido: el pedido se registra, pero tendrás que avisarle por otro medio.</p>}
    </div>
  );
};

const Contenido = ({ proveedores, onPedido }) => {
  const [proveedorId, setProveedorId] = useState('');
  const proveedor = proveedores.find((p) => String(p.id) === proveedorId);
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="nuevo-pedido-proveedor" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Proveedor</label>
        <select id="nuevo-pedido-proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={INPUT}>
          <option value="">Selecciona proveedor</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      {proveedor
        ? <Productos key={proveedor.id} proveedor={proveedor} onPedido={onPedido} />
        : <p className="py-4 text-center text-sm text-gray-400">Elige un proveedor para ver sus productos.</p>}
    </div>
  );
};

const NuevoPedidoModal = ({ abierto, proveedores, onPedido, onClose }) => (
  <Modal isOpen={abierto} onClose={onClose} title="Nuevo pedido" subtitle="Pedido a un proveedor" maxWidth="max-w-2xl">
    {abierto && <Contenido proveedores={proveedores} onPedido={onPedido} />}
  </Modal>
);

export default NuevoPedidoModal;
