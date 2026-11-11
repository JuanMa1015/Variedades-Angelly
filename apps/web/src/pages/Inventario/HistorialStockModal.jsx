import { useEffect, useState } from 'react';
import { fetchMovimientosStock } from '../../api/inventarioApi';
import Modal from '../../components/Modal';
import PaginationControls from '../../components/PaginationControls';
import { formatDateTime } from '../../utils/format';
import { ETIQUETA_MOVIMIENTO, describirReferencia } from './inventarioHelpers';

const Movimiento = ({ mov }) => {
  const sube = mov.delta > 0;
  const referencia = describirReferencia(mov);
  return (
    <li className="rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">{ETIQUETA_MOVIMIENTO[mov.tipo] ?? mov.tipo}</span>
        {referencia && <span className="text-xs text-gray-500">{referencia}</span>}
        <span className="text-xs text-gray-500">{formatDateTime(mov.fecha)}</span>
        <span className={`ml-auto text-lg font-black tabular-nums ${sube ? 'text-emerald-700' : 'text-red-700'}`}>{sube ? '+' : ''}{mov.delta}</span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Quedó en <strong>{mov.stock_resultante}</strong> · {mov.usuario}
        {mov.motivo && <> · {mov.motivo}</>}
      </p>
    </li>
  );
};

// Contenido con su propio estado: se monta al abrir, asi nunca muestra el historial del producto anterior.
const Historial = ({ producto }) => {
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchMovimientosStock(producto.id, { page: pagina, limit: 8, signal: controller.signal })
      .then((respuesta) => { setDatos(respuesta); setError(''); })
      .catch((err) => { if (err?.name !== 'AbortError') setError(err.message || 'No fue posible cargar el historial'); });
    return () => controller.abort();
  }, [producto.id, pagina]);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!datos) return <p className="py-6 text-center text-sm text-gray-500">Cargando movimientos...</p>;
  if (datos.data.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">Todavía no hay movimientos registrados. Desde ahora, cada venta, compra o ajuste queda aquí.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Stock actual: <strong className="text-gray-900">{producto.stock_actual} u</strong></p>
      <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {datos.data.map((mov) => <Movimiento key={mov.id} mov={mov} />)}
      </ul>
      {datos.page.total_pages > 1 && <PaginationControls currentPage={pagina} totalPages={datos.page.total_pages} onPageChange={setPagina} />}
    </div>
  );
};

const HistorialStockModal = ({ producto, onClose }) => (
  <Modal isOpen={producto !== null} onClose={onClose} title={producto?.nombre ?? ''} subtitle="Por qué cambió el stock" maxWidth="max-w-2xl">
    {producto && <Historial key={producto.id} producto={producto} />}
  </Modal>
);

export default HistorialStockModal;
