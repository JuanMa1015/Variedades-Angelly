import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { anularVentaCartera, fetchVentasCartera } from '../../../api/carteraVentasApi';
import Modal from '../../../components/Modal';
import PaginationControls from '../../../components/PaginationControls';
import Skeleton from '../../../components/Skeleton';
import { formatDateTime } from '../../../utils/format';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;
const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'fiado', etiqueta: 'Fiado' },
  { id: 'contado', etiqueta: 'Contado' },
  { id: 'anuladas', etiqueta: 'Anuladas' },
];
const BOTON = 'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition';
const INPUT = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';

const Etiqueta = ({ venta }) => {
  if (venta.anulada) return <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">Anulada</span>;
  return venta.es_fiado
    ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Fiado</span>
    : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Contado</span>;
};

// Lineas de la venta, cuanto se abono al venderla y, si se puede, el formulario para anularla.
const Detalle = ({ venta, formatMoney, onAnulada }) => {
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    if (motivo.trim().length < 3) { setError('Explica el motivo (mínimo 3 letras)'); return; }
    setEnviando(true);
    setError('');
    try {
      await anularVentaCartera(venta.venta_id, motivo.trim());
      await onAnulada(venta);
    } catch (err) {
      setError(err.message || 'No se pudo anular la venta');
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl bg-gray-50 p-3 text-sm">
      <ul className="space-y-1">
        {venta.lineas.map((linea, indice) => (
          <li key={`${venta.venta_id}-${indice}`} className="flex justify-between gap-3 text-gray-700">
            <span>{linea.cantidad} × {linea.nombre_producto} <span className="text-xs text-gray-500">({formatMoney(linea.precio_unitario)} c/u)</span></span>
            <span className="font-semibold tabular-nums">{formatMoney(linea.subtotal)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-gray-200 pt-2 text-xs text-gray-600">
        {venta.metodo_pago && <span>Pago: {venta.metodo_pago}</span>}
        {venta.abono_inicial !== null && <span>Abono inicial: {formatMoney(venta.abono_inicial)}</span>}
        <span>Debía en total después de esta venta: {formatMoney(venta.saldo_cliente)}</span>
        {venta.creado_por && <span>Registró: {venta.creado_por}</span>}
      </div>
      {venta.anulada && (
        <p className="rounded-lg bg-white px-3 py-2 text-xs text-gray-600">
          Anulada{venta.anulada_por ? ` por ${venta.anulada_por}` : ''}: {venta.motivo_anulacion}
        </p>
      )}
      {venta.anulable && !anulando && (
        <button type="button" onClick={() => setAnulando(true)} className={`${BOTON} border-red-200 text-red-600 hover:bg-red-50`} aria-label={`Anular venta ${venta.venta_id}`}>
          Anular venta
        </button>
      )}
      {anulando && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
          <p className="text-xs text-gray-600">Se devuelve el stock y se le quita al cliente la deuda de esta venta. No se borra: queda anulada con su motivo.</p>
          <label htmlFor={`motivo-${venta.venta_id}`} className="block text-xs font-semibold text-gray-600">Motivo de la anulación</label>
          <input id={`motivo-${venta.venta_id}`} type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} className={`${INPUT} w-full`} placeholder="Ej: se digitó mal el producto" />
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAnulando(false); setError(''); }} className={`${BOTON} border-gray-300 text-gray-700 hover:bg-gray-50`}>Cancelar</button>
            <button type="button" onClick={confirmar} disabled={enviando} className={`${BOTON} border-red-600 bg-red-600 text-white hover:opacity-90 disabled:opacity-60`}>
              {enviando ? 'Anulando...' : 'Confirmar anulación'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Historial de ventas de cartera con busqueda en vivo, filtros, fechas y paginas del servidor.
const HistorialVentasCartera = ({ abierto, onClose, formatMoney, onCambio }) => {
  const [filtros, setFiltros] = useState({ q: '', estado: 'todas', desde: '', hasta: '', page: 1 });
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState({ data: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    const espera = setTimeout(() => {
      setFiltros((actual) => (actual.q === texto.trim() ? actual : { ...actual, q: texto.trim(), page: 1 }));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  useEffect(() => {
    if (!abierto) return undefined;
    const controller = new AbortController();
    const cargar = async () => {
      setLoading(true);
      try {
        const pagina = await fetchVentasCartera({ ...filtros, limit: PAGE_SIZE, signal: controller.signal });
        if (controller.signal.aborted) return;
        setLista({ data: pagina?.data ?? [], total: pagina?.page?.total ?? 0, totalPages: Math.max(1, pagina?.page?.total_pages ?? 1) });
        setError('');
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'No fue posible cargar el historial');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void cargar();
    return () => controller.abort();
  }, [abierto, filtros, recargar]);

  const cambiar = useCallback((parcial) => setFiltros((actual) => ({ ...actual, ...parcial, page: 1 })), []);

  const handleAnulada = async (venta) => {
    setAbierta(null);
    setAviso(`Venta #${venta.venta_id} anulada: se devolvió el stock y la deuda`);
    setRecargar((n) => n + 1);
    onCambio?.();
  };

  const hayFiltro = Boolean(filtros.q || filtros.desde || filtros.hasta || filtros.estado !== 'todas');

  return (
    <Modal isOpen={abierto} onClose={onClose} title="Historial de ventas de cartera" subtitle="Busca por cliente o número de venta (#12)." maxWidth="max-w-5xl">
      {abierto && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <label htmlFor="buscar-venta-cartera" className="sr-only">Buscar venta</label>
              <input id="buscar-venta-cartera" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cliente o #número" className={`${INPUT} w-full pl-9`} />
            </div>
            <div>
              <label htmlFor="ventas-desde" className="block text-xs font-semibold text-gray-500">Desde</label>
              <input id="ventas-desde" type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => cambiar({ desde: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label htmlFor="ventas-hasta" className="block text-xs font-semibold text-gray-500">Hasta</label>
              <input id="ventas-hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value })} className={INPUT} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro de ventas">
            {FILTROS.map(({ id, etiqueta }) => (
              <button key={id} type="button" aria-pressed={filtros.estado === id} onClick={() => cambiar({ estado: id })}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filtros.estado === id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {etiqueta}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {aviso && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{aviso}</p>}

          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {loading && <Skeleton lines={3} />}
            {!loading && lista.data.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">{hayFiltro ? 'No se encontraron ventas con ese criterio.' : 'No hay ventas de cartera registradas.'}</p>
            )}
            {!loading && lista.data.map((venta) => {
              const expandida = abierta === venta.venta_id;
              return (
                <div key={venta.venta_id} className={`rounded-xl border p-3 ${venta.anulada ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-200 bg-white'}`}>
                  <button type="button" onClick={() => setAbierta(expandida ? null : venta.venta_id)} aria-expanded={expandida} aria-label={`Ver detalle de la venta ${venta.venta_id}`}
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">#{venta.venta_id} · {venta.cliente_nombre}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(venta.fecha)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Etiqueta venta={venta} />
                      <span className={`text-sm font-bold tabular-nums ${venta.anulada ? 'line-through' : 'text-gray-900'}`}>{formatMoney(venta.total)}</span>
                      {expandida ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                    </div>
                  </button>
                  {expandida && <div className="mt-3"><Detalle venta={venta} formatMoney={formatMoney} onAnulada={handleAnulada} /></div>}
                </div>
              );
            })}
          </div>

          {lista.totalPages > 1 && <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={(page) => setFiltros((actual) => ({ ...actual, page }))} />}
          <p className="text-xs text-gray-500">{lista.total} venta{lista.total === 1 ? '' : 's'}</p>
        </div>
      )}
    </Modal>
  );
};

export default HistorialVentasCartera;
