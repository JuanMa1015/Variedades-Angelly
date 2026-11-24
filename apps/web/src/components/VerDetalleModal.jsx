import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchCarteraMovimientos } from '../api/carteraApi';
import ErrorMessage from './ErrorMessage';
import Modal from './Modal';
import Skeleton from './Skeleton';
import { parseApiDate } from '../utils/format';

const MOVIMIENTOS_PAGE_SIZE = 5;

const dinero = (valor) => `$${Number(valor ?? 0).toLocaleString('es-CO')}`;

const formatearFecha = (valor) => (valor
  ? parseApiDate(valor).toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  })
  : 'Sin fecha');

const esAbono = (movimiento) => String(movimiento.tipo || '').toLowerCase().includes('abono');

const Etiqueta = ({ movimiento }) => (
  <span className={`rounded-full px-3 py-1 text-xs font-bold sm:text-sm ${esAbono(movimiento) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
    {movimiento.tipo}
  </span>
);

const Articulo = ({ movimiento }) => (
  <>
    <p>{movimiento.articulo ? `${movimiento.articulo}${movimiento.cantidad ? ` x${movimiento.cantidad}` : ''}` : '-'}</p>
    {movimiento.referencia && <p className="mt-1 text-xs text-gray-500">Ref: {movimiento.referencia}</p>}
  </>
);

// Escritorio: tabla. Celular: una tarjeta por movimiento (la tabla ancha obligaba a deslizar de lado).
const Tabla = ({ movimientos }) => (
  <div className="hidden overflow-x-auto md:block">
    <table className="w-full text-left text-sm sm:text-base">
      <thead className="border-b-2 border-gray-300 bg-gray-100">
        <tr>
          <th className="px-4 py-3 font-bold">Tipo</th>
          <th className="px-4 py-3 font-bold">Detalle</th>
          <th className="px-4 py-3 font-bold">Monto</th>
          <th className="px-4 py-3 font-bold">Fecha</th>
          <th className="px-4 py-3 font-bold">Saldo</th>
        </tr>
      </thead>
      <tbody>
        {movimientos.map((movimiento) => (
          <tr key={movimiento.id} className="border-b border-gray-200 hover:bg-gray-50">
            <td className="px-4 py-4 font-semibold">
              <Etiqueta movimiento={movimiento} />
              {movimiento.descripcion && <p className="mt-1 text-xs text-gray-500">{movimiento.descripcion}</p>}
            </td>
            <td className="px-4 py-4 text-sm text-gray-700"><Articulo movimiento={movimiento} /></td>
            <td className="px-4 py-4 font-bold">{dinero(movimiento.monto)}</td>
            <td className="px-4 py-4">{formatearFecha(movimiento.fecha)}</td>
            <td className="px-4 py-4 font-bold">{dinero(movimiento.saldo)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Tarjetas = ({ movimientos }) => (
  <ul className="space-y-3 md:hidden">
    {movimientos.map((movimiento) => (
      <li key={movimiento.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <Etiqueta movimiento={movimiento} />
          <span className="text-lg font-bold text-gray-900">{dinero(movimiento.monto)}</span>
        </div>
        {movimiento.descripcion && <p className="mt-1 text-xs text-gray-500">{movimiento.descripcion}</p>}
        <div className="mt-2 text-sm text-gray-700"><Articulo movimiento={movimiento} /></div>
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-500">
          <span>{formatearFecha(movimiento.fecha)}</span>
          <span>Saldo <strong className="text-gray-800">{dinero(movimiento.saldo)}</strong></span>
        </div>
      </li>
    ))}
  </ul>
);

const VerDetalleModal = ({ cliente, isOpen, onClose }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPage(1);
  }, [isOpen, cliente?.id]);

  useEffect(() => {
    if (!isOpen || !cliente?.id) return undefined;

    const controller = new AbortController();

    const fetchMovimientos = async () => {
      try {
        setLoading(true);
        setError('');

        const payload = await fetchCarteraMovimientos({
          clienteId: cliente.id,
          page: currentPage,
          limit: MOVIMIENTOS_PAGE_SIZE,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setMovimientos(Array.isArray(payload.data) ? payload.data : []);
        setTotalPages(Math.max(1, Number(payload.total_pages ?? 1)));
      } catch {
        if (controller.signal.aborted) return;
        setError('No fue posible cargar los movimientos del cliente');
        setMovimientos([]);
        setTotalPages(1);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchMovimientos();

    return () => {
      controller.abort();
    };
  }, [cliente?.id, currentPage, isOpen]);

  if (!isOpen) return null;

  return (
    <Modal isOpen onClose={onClose} title="Detalles del Cliente" subtitle={cliente.nombre} maxWidth="max-w-4xl">
      <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-600">Saldo Pendiente</p>
        <p className="text-2xl font-bold text-red-600">{dinero(cliente.deuda_total)}</p>
      </div>

      <h3 className="mb-4 text-xl font-bold text-gray-900">Historial de Transacciones</h3>
      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {loading && <div className="py-6"><Skeleton lines={2} /></div>}
      {!loading && !error && movimientos.length === 0 && (
        <p className="py-6 text-center font-semibold text-gray-500">Este cliente no tiene movimientos registrados.</p>
      )}
      {!loading && !error && movimientos.length > 0 && (
        <>
          <Tabla movimientos={movimientos} />
          <Tarjetas movimientos={movimientos} />
        </>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 border-t border-gray-200 pt-4">
          <button
            type="button"
            aria-label="Página anterior"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="rounded-lg bg-gray-100 p-2 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            <ChevronLeft size={24} />
          </button>
          <span className="text-lg font-bold">Página {currentPage} de {totalPages}</span>
          <button
            type="button"
            aria-label="Página siguiente"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="rounded-lg bg-gray-100 p-2 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full rounded-xl bg-rosewood px-4 py-3 text-lg font-bold text-white transition hover:bg-opacity-90"
      >
        Cerrar
      </button>
    </Modal>
  );
};

export default VerDetalleModal;
