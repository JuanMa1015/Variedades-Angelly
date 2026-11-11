import { useEffect, useState } from 'react';
import { fetchMovimientos } from '../../api/fidelizacionApi';
import Modal from '../../components/Modal';
import PaginationControls from '../../components/PaginationControls';
import { formatDateTime, formatMoney } from '../../utils/format';
import { ETIQUETA_MOVIMIENTO, describirReferencia } from './fidelizacionHelpers';

const Movimiento = ({ mov }) => {
  const sube = mov.puntos > 0;
  const referencia = describirReferencia(mov);
  return (
    <li className="rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">{ETIQUETA_MOVIMIENTO[mov.tipo] ?? mov.tipo}</span>
        {referencia && <span className="text-xs text-gray-500">{referencia}</span>}
        <span className="text-xs text-gray-500">{formatDateTime(mov.fecha)}</span>
        <span className={`ml-auto text-lg font-black tabular-nums ${sube ? 'text-emerald-700' : 'text-red-700'}`}>{sube ? '+' : ''}{mov.puntos}</span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Quedó en <strong>{mov.saldo}</strong> puntos · {mov.usuario}
        {mov.motivo && <> · {mov.motivo}</>}
      </p>
    </li>
  );
};

// Contenido con su propio estado: se monta al abrir, asi nunca muestra el historial del cliente anterior.
const Historial = ({ cliente, valorPunto }) => {
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchMovimientos(cliente.id, { page: pagina, signal: controller.signal })
      .then((respuesta) => { setDatos(respuesta); setError(''); })
      .catch((err) => { if (err?.name !== 'AbortError') setError(err.message || 'No fue posible cargar el historial'); });
    return () => controller.abort();
  }, [cliente.id, pagina]);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!datos) return <p className="py-6 text-center text-sm text-gray-500">Cargando movimientos...</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Puntos actuales: <strong className="text-gray-900">{cliente.puntos_acumulados}</strong> ({formatMoney(cliente.puntos_acumulados * valorPunto)} en descuento)
      </p>
      {datos.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Todavía no hay movimientos. Desde ahora, cada compra, canje o ajuste queda aquí.</p>
      ) : (
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {datos.data.map((mov) => <Movimiento key={mov.id} mov={mov} />)}
        </ul>
      )}
      {datos.page.total_pages > 1 && <PaginationControls currentPage={pagina} totalPages={datos.page.total_pages} onPageChange={setPagina} />}
    </div>
  );
};

const HistorialPuntosModal = ({ cliente, valorPunto, onClose }) => (
  <Modal isOpen={cliente !== null} onClose={onClose} title={cliente?.nombre ?? ''} subtitle="Historial de puntos" maxWidth="max-w-2xl">
    {cliente && <Historial key={cliente.id} cliente={cliente} valorPunto={valorPunto} />}
  </Modal>
);

export default HistorialPuntosModal;
