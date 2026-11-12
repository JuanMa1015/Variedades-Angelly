import { useEffect, useState } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import { fetchCobradoCartera } from '../../api/carteraClientesApi';
import ErrorMessage from '../../components/ErrorMessage';
import PaginationControls from '../../components/PaginationControls';
import Skeleton from '../../components/Skeleton';
import { telefonoLegible } from '../../utils/whatsapp';
import ResumenCobros from './cobrar/ResumenCobros';
import { useClientesCartera } from './clientes/useClientesCartera';
import { nivelDeudaCartera, textoAntiguedad } from './nivelDeudaCartera';

const FILTROS = [
  { id: 'con_deuda', etiqueta: 'Con deuda' },
  { id: 'alerta', etiqueta: 'En alerta' },
  { id: 'moroso', etiqueta: 'Morosos' },
];

const BOTON = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition';

// Lo cobrado por cartera (hoy, semana, mes). Si falla, la pantalla sigue funcionando sin esas cifras.
const useCobrado = (recargar) => {
  const [cobrado, setCobrado] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchCobradoCartera({ signal: controller.signal })
      .then((datos) => { if (!controller.signal.aborted) setCobrado(datos && !Array.isArray(datos) ? datos : null); })
      .catch(() => { if (!controller.signal.aborted) setCobrado(null); });
    return () => controller.abort();
  }, [recargar]);
  return cobrado;
};

// Clientes que deben, de quien mas debe a quien menos, con busqueda en vivo, filtros y paginas del servidor.
// `recargar` cambia cuando la pantalla registra un abono o cambia algo de un cliente.
const CarteraCobrarSection = ({ formatMoney, recargar, handleAbrirWhatsapp, handleRegistrarAbono, handleVerDetalle }) => {
  const { filtros, setEstado, setPagina, texto, setTexto, lista, resumen, loading, error, setError } = useClientesCartera(recargar, 'con_deuda');
  const cobrado = useCobrado(recargar);
  const hayFiltro = Boolean(texto || filtros.estado !== 'con_deuda');
  const vacio = hayFiltro ? 'No se encontraron clientes con ese criterio.' : 'Nadie le debe a la tienda por ahora.';

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900">Cobrar cartera</h2>
          <p className="text-sm text-gray-600">Los clientes que más deben aparecen primero.</p>
        </div>

        <ResumenCobros deuda={resumen} cobrado={cobrado} loading={loading} formatMoney={formatMoney} />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <label htmlFor="buscar-cobro-cartera" className="sr-only">Buscar cliente</label>
            <input
              id="buscar-cobro-cartera"
              type="search"
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              placeholder="Buscar por nombre, cédula o WhatsApp"
              className="w-full rounded-xl border-2 border-gray-200 py-2.5 pl-9 pr-3 text-sm transition focus:border-rosewood focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro de cobro">
            {FILTROS.map(({ id, etiqueta }) => (
              <button
                key={id}
                type="button"
                aria-pressed={filtros.estado === id}
                onClick={() => setEstado(id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filtros.estado === id ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {loading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><Skeleton lines={3} /></div>
      )}

      {!loading && !error && lista.data.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600 shadow-sm">{vacio}</div>
      )}

      {!loading && lista.data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {lista.data.map((cliente) => {
            const nivel = nivelDeudaCartera(cliente);
            const antiguedad = textoAntiguedad(cliente);
            return (
              <article key={cliente.id} className={`rounded-2xl border border-l-4 border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md ${nivel.border}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{cliente.nombre}</p>
                    <p className="text-xs text-gray-500">{telefonoLegible(cliente.telefono_whatsapp) || 'Sin WhatsApp'}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold tabular-nums ${nivel.text}`}>{formatMoney(cliente.deuda_total)}</p>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${nivel.bg} ${nivel.text}`}>
                      <span className={`h-2 w-2 rounded-full ${nivel.dot}`} />
                      {nivel.label}
                    </span>
                    {antiguedad && <p className="mt-1 text-xs text-gray-500">{antiguedad}</p>}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => handleRegistrarAbono(cliente)} className={`${BOTON} border-rosewood bg-rosewood text-white hover:opacity-90`} aria-label={`Registrar abono de ${cliente.nombre}`}>
                    Registrar abono
                  </button>
                  <button type="button" onClick={() => handleAbrirWhatsapp(cliente)} disabled={!cliente.telefono_whatsapp} className={`${BOTON} border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50`} aria-label={`Cobrar por WhatsApp a ${cliente.nombre}`}>
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
                  </button>
                  <button type="button" onClick={() => handleVerDetalle(cliente)} className={`${BOTON} border-gray-300 text-gray-700 hover:bg-gray-50`} aria-label={`Ver detalle de ${cliente.nombre}`}>
                    Detalle
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {lista.totalPages > 1 && <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />}
    </section>
  );
};

export default CarteraCobrarSection;
