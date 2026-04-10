import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchCarteraMovimientos } from '../api/carteraApi';

const MOVIMIENTOS_PAGE_SIZE = 5;

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
    if (!isOpen || !cliente?.id) return;

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
      } catch (err) {
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-white pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Detalles del Cliente</h2>
            <p className="text-gray-600 mt-1">{cliente.nombre}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition"
          >
            <X size={28} />
          </button>
        </div>

        {/* Resumen */}
        <div className="mb-6">
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <p className="text-red-600 text-sm font-semibold">Saldo Pendiente</p>
            <p className="text-2xl font-bold text-red-600">
              ${Number(cliente.deuda_total ?? 0).toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        {/* Transacciones */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Historial de Transacciones</h3>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-red-700 font-semibold">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-base">
              <thead className="bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-4 py-3 font-bold">Tipo</th>
                  <th className="px-4 py-3 font-bold">Detalle</th>
                  <th className="px-4 py-3 font-bold">Monto</th>
                  <th className="px-4 py-3 font-bold">Fecha</th>
                  <th className="px-4 py-3 font-bold">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="5" className="px-4 py-6 text-center text-gray-500 font-semibold">
                      Cargando movimientos...
                    </td>
                  </tr>
                )}

                {!loading && !error && movimientos.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-4 py-6 text-center text-gray-500 font-semibold">
                      Este cliente no tiene movimientos registrados.
                    </td>
                  </tr>
                )}

                {!loading && !error && movimientos.map((movimiento) => {
                  const tipoNormalizado = String(movimiento.tipo || '').toLowerCase();
                  const esAbono = tipoNormalizado.includes('abono');
                  const fecha = movimiento.fecha
                    ? new Date(movimiento.fecha).toLocaleString('es-CO', {
                      year: 'numeric',
                      month: 'short',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                    : 'Sin fecha';

                  return (
                    <tr
                      key={movimiento.id}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-4 py-4 font-semibold">
                        <span
                          className={`px-3 py-1 rounded-full text-xs sm:text-sm font-bold ${
                            esAbono ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {movimiento.tipo}
                        </span>
                        {movimiento.descripcion && (
                          <p className="mt-1 text-xs text-gray-500">{movimiento.descripcion}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {movimiento.articulo ? (
                          <p>
                            {movimiento.articulo}
                            {movimiento.cantidad ? ` x${movimiento.cantidad}` : ''}
                          </p>
                        ) : (
                          <p>-</p>
                        )}
                        {movimiento.referencia && (
                          <p className="mt-1 text-xs text-gray-500">Ref: {movimiento.referencia}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 font-bold">
                        ${Number(movimiento.monto ?? 0).toLocaleString('es-CO')}
                      </td>
                      <td className="px-4 py-4">{fecha}</td>
                      <td className="px-4 py-4 font-bold">
                        ${Number(movimiento.saldo ?? 0).toLocaleString('es-CO')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              <ChevronLeft size={24} />
            </button>
            <span className="font-bold text-lg">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        )}

        {/* Botón Cerrar */}
        <button
          onClick={onClose}
          className="w-full mt-6 py-3 px-4 bg-rosewood text-white font-bold text-lg rounded-xl hover:bg-opacity-90 transition"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

export default VerDetalleModal;
