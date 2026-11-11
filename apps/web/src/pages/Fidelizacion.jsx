import { useState } from 'react';
import { Gift, Search, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { desactivarCliente, reactivarCliente } from '../api/fidelizacionApi';
import ErrorMessage from '../components/ErrorMessage';
import PaginationControls from '../components/PaginationControls';
import Skeleton from '../components/Skeleton';
import SuccessMessage from '../components/SuccessMessage';
import useConfirm from '../components/useConfirm';
import { formatMoney } from '../utils/format';
import AjustePuntosModal from './Fidelizacion/AjustePuntosModal';
import ClientesLista from './Fidelizacion/ClientesLista';
import { FILTROS } from './Fidelizacion/fidelizacionHelpers';
import HistorialPuntosModal from './Fidelizacion/HistorialPuntosModal';
import InscribirClienteModal from './Fidelizacion/InscribirClienteModal';
import { useFidelizacion } from './Fidelizacion/useFidelizacion';

// Si el servidor no responde con la configuracion, se usan los valores de siempre y se avisa.
const UMBRAL_DEFECTO = 100;
const VALOR_PUNTO_DEFECTO = 20;

const Tarjeta = ({ titulo, valor, tono = 'text-gray-900', children }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-sm uppercase text-gray-500">{titulo}</p>
    <p className={`text-3xl font-bold ${tono}`}>{valor}</p>
    {children}
  </div>
);

const Resumen = ({ resumen, loading }) => {
  if (loading && !resumen) {
    return <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{[1, 2, 3].map((n) => <div key={n} className="rounded-xl border border-gray-200 bg-white p-4"><Skeleton lines={2} /></div>)}</div>;
  }
  if (!resumen) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Tarjeta titulo="Clientes en el programa" valor={resumen.total_activos}>
        {resumen.desactivados > 0 && <p className="text-xs text-gray-500">{resumen.desactivados} desactivado{resumen.desactivados === 1 ? '' : 's'}</p>}
      </Tarjeta>
      <Tarjeta titulo="Mínimo para canjear" valor={`${resumen.umbral_bono} pts`}>
        <p className="text-xs text-gray-500">1 punto = {formatMoney(resumen.valor_punto)}</p>
      </Tarjeta>
      <Tarjeta titulo="Pueden canjear" valor={resumen.pueden_canjear} tono="text-emerald-700">
        <p className="text-xs text-gray-500">{resumen.puntos_en_circulacion} puntos en circulación · {formatMoney(resumen.valor_en_circulacion)}</p>
      </Tarjeta>
    </div>
  );
};

const Fidelizacion = () => {
  const { token, user } = useAuth();
  // Ajustar puntos y desactivar/reactivar clientes es solo de admin/superadmin (el servidor responde 403 al vendedor).
  const puedeAdministrar = user?.role === 'admin' || user?.role === 'superadmin';
  const { filtros, setEstado, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload } = useFidelizacion(token);
  const { confirm, ConfirmModal } = useConfirm();

  const [success, setSuccess] = useState('');
  const [inscribiendo, setInscribiendo] = useState(false);
  const [historial, setHistorial] = useState(null);
  const [ajustando, setAjustando] = useState(null);

  const umbral = resumen?.umbral_bono ?? UMBRAL_DEFECTO;
  const valorPunto = resumen?.valor_punto ?? VALOR_PUNTO_DEFECTO;
  const filtrosVisibles = FILTROS.filter((f) => !f.soloAdmin || puedeAdministrar);

  const avisar = (mensaje) => { setError(''); setSuccess(mensaje); };
  const fallar = (mensaje) => { setSuccess(''); setError(mensaje); };

  const handleInscrito = async (cliente) => {
    setInscribiendo(false);
    avisar(`${cliente.nombre} quedó inscrito en el programa de puntos`);
    await reload({ silent: true });
  };

  const handleAjustado = async (cliente) => {
    setAjustando(null);
    avisar(`Puntos de ${cliente.nombre} ajustados: quedó registrado en su historial`);
    await reload({ silent: true });
  };

  const handleDesactivar = async (cliente) => {
    const ok = await confirm({ message: `¿Desactivar a "${cliente.nombre}"? Dejará de ganar y canjear puntos y conserva los ${cliente.puntos_acumulados} que tiene; podrás reactivarlo en «Desactivados».` });
    if (!ok) return;
    try {
      await desactivarCliente(cliente.id);
      avisar(`${cliente.nombre} desactivado`);
      await reload({ silent: true });
    } catch (err) {
      fallar(err.message || 'No se pudo desactivar al cliente');
    }
  };

  const handleReactivar = async (cliente) => {
    try {
      await reactivarCliente(cliente.id);
      avisar(`${cliente.nombre} reactivado`);
      await reload({ silent: true });
    } catch (err) {
      fallar(err.message || 'No se pudo reactivar al cliente');
    }
  };

  const hayFiltro = Boolean(texto || filtros.estado !== 'activos');
  const vacio = hayFiltro ? 'No se encontraron clientes con ese criterio.' : 'No hay clientes de fidelización registrados.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Gift className="h-8 w-8 text-rosewood" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Fidelización</h1>
            <p className="text-gray-600">Los puntos se canjean como descuento al cobrar en Ventas</p>
          </div>
        </div>
        <button type="button" onClick={() => { avisar(''); setInscribiendo(true); }} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Inscribir cliente
        </button>
      </div>

      <Resumen resumen={resumen} loading={loading} />
      {!loading && !resumen && !error && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No se pudieron cargar las reglas del programa: se muestran las de siempre ({UMBRAL_DEFECTO} puntos mínimos, 1 punto = {formatMoney(VALOR_PUNTO_DEFECTO)}) y podrían no ser las actuales.
        </p>
      )}

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <label htmlFor="buscar-fidelizacion" className="sr-only">Buscar cliente</label>
            <input
              id="buscar-fidelizacion"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por nombre o WhatsApp"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro de clientes">
            {filtrosVisibles.map(({ id, etiqueta }) => (
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

        <ClientesLista
          clientes={lista.data}
          loading={loading}
          vacio={vacio}
          umbral={umbral}
          valorPunto={valorPunto}
          puedeAdministrar={puedeAdministrar}
          onHistorial={setHistorial}
          onAjustar={setAjustando}
          onDesactivar={handleDesactivar}
          onReactivar={handleReactivar}
        />
        {lista.totalPages > 1 && (
          <div className="mt-4">
            <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />
          </div>
        )}
      </section>

      <InscribirClienteModal abierto={inscribiendo} onInscrito={handleInscrito} onClose={() => setInscribiendo(false)} />
      <HistorialPuntosModal cliente={historial} valorPunto={valorPunto} onClose={() => setHistorial(null)} />
      <AjustePuntosModal cliente={ajustando} onAjustado={handleAjustado} onClose={() => setAjustando(null)} />
      {ConfirmModal}
    </div>
  );
};

export default Fidelizacion;
