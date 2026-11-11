import { useCallback, useEffect, useState } from 'react';
import { Package, PackagePlus, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiGet, apiRequest } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import PaginationControls from '../components/PaginationControls';
import SuccessMessage from '../components/SuccessMessage';
import { SkeletonCard } from '../components/Skeleton';
import useConfirm from '../components/useConfirm';
import AjusteStockModal from './Inventario/AjusteStockModal';
import CrearProductoModal from './Inventario/CrearProductoModal';
import EditarProductoModal from './Inventario/EditarProductoModal';
import HistorialStockModal from './Inventario/HistorialStockModal';
import InventarioToolbar from './Inventario/InventarioToolbar';
import ProductosLista from './Inventario/ProductosLista';
import ReposicionModal from './Inventario/ReposicionModal';
import { useInventario } from './Inventario/useInventario';

const TarjetaResumen = ({ titulo, valor, tono = 'text-gray-900', activa = false, onClick, children }) => {
  const contenido = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{titulo}</p>
      <p className={`mt-2 text-2xl font-bold sm:text-3xl ${tono}`}>{valor}</p>
      {children}
    </>
  );
  const base = 'rounded-2xl border bg-white p-4 text-left shadow-sm sm:p-5';
  if (!onClick) return <div className={`${base} border-gray-200`}>{contenido}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`${base} transition hover:shadow-md ${activa ? 'border-rosewood ring-2 ring-rosewood/20' : 'border-gray-200'}`}>
      {contenido}
    </button>
  );
};

const Resumen = ({ resumen, loading, estado, onEstado }) => {
  if (loading && !resumen) {
    return <>{[1, 2, 3, 4].map((n) => <SkeletonCard key={n} />)}</>;
  }
  if (!resumen) return null;
  const alternar = (nuevo) => onEstado(estado === nuevo ? 'todos' : nuevo);
  return (
    <>
      <TarjetaResumen titulo="Productos" valor={resumen.total} />
      <TarjetaResumen titulo="Stock total" valor={`${resumen.stock_total} u`} />
      <TarjetaResumen titulo="Agotados" valor={resumen.agotados} tono="text-red-700" activa={estado === 'agotado'} onClick={() => alternar('agotado')} />
      <TarjetaResumen titulo="Bajo stock" valor={resumen.bajo_stock} tono="text-orange-600" activa={estado === 'bajo'} onClick={() => alternar('bajo')}>
        {resumen.urgentes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {resumen.urgentes.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-gray-700">{p.nombre}</span>
                <span className="ml-2 shrink-0 font-semibold text-orange-600">{p.stock_actual} u</span>
              </li>
            ))}
          </ul>
        )}
      </TarjetaResumen>
    </>
  );
};

const Inventario = () => {
  const { token, user } = useAuth();
  // Desactivar y reactivar productos es solo de admin/superadmin (el backend responde 403 al vendedor).
  const canDeactivate = user?.role === 'admin' || user?.role === 'superadmin';
  const { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload } = useInventario(token);
  const { confirm, ConfirmModal } = useConfirm();
  const recargar = useCallback(() => reload({ silent: true }), [reload]);

  const [proveedores, setProveedores] = useState([]);
  const [success, setSuccess] = useState('');
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [reponiendo, setReponiendo] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    apiGet('/api/proveedores', { signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted) setProveedores(Array.isArray(payload) ? payload : []); })
      .catch(() => { /* sin proveedores el formulario sigue funcionando */ });
    return () => controller.abort();
  }, [token]);

  const avisar = (mensaje) => { setError(''); setSuccess(mensaje); };

  const handleCreado = async (mensaje) => {
    setCreando(false);
    avisar(mensaje);
    await recargar();
  };

  const handleGuardado = async (nombre) => {
    setEditando(null);
    avisar(`Producto "${nombre}" actualizado`);
    await recargar();
  };

  const handleAjustado = async ({ producto, movimiento }) => {
    setAjustando(null);
    setEditando(null);
    avisar(`Stock de "${producto.nombre}": ${movimiento.stock_resultante - movimiento.delta} → ${movimiento.stock_resultante}`);
    await recargar();
  };

  const handleEliminar = async (producto) => {
    const ok = await confirm({ message: `¿Desactivar "${producto.nombre}"? Podrás verlo y reactivarlo en «Desactivados».` });
    if (!ok) return;
    try {
      await apiDelete(`/api/productos/${producto.id}`);
      avisar(`Producto "${producto.nombre}" desactivado`);
      await recargar();
    } catch (err) {
      setError(err.message || 'No se pudo desactivar el producto');
    }
  };

  const handleReactivar = async (producto) => {
    try {
      await apiRequest(`/api/productos/${producto.id}/reactivar`, { method: 'PUT' });
      avisar(`Producto "${producto.nombre}" reactivado`);
      await recargar();
    } catch (err) {
      setError(err.message || 'No se pudo reactivar el producto');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-600">Catálogo de tienda y control de stock</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Ingreso de productos</h2>
            <p className="text-sm text-gray-600">Agrega productos nuevos o por código de barras, o repón lo que se está acabando.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setReponiendo(true)} className="inline-flex items-center gap-2 rounded-lg border border-rosewood px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-rosewood/5">
              <PackagePlus className="h-4 w-4" aria-hidden="true" /> Reponer stock
            </button>
            <button type="button" onClick={() => { setError(''); setSuccess(''); setCreando(true); }} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar producto
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumen resumen={resumen} loading={loading} estado={filtros.estado} onEstado={(estado) => setFiltro({ estado, soloInactivos: false })} />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Productos de tienda</h2>
        <InventarioToolbar
          texto={texto}
          onTexto={setTexto}
          filtros={filtros}
          onFiltro={setFiltro}
          proveedores={proveedores}
          puedeVerDesactivados={canDeactivate}
          onRecargar={recargar}
        />
        <ProductosLista
          productos={lista.data}
          loading={loading}
          vacio={texto || filtros.estado !== 'todos' || filtros.soloInactivos || filtros.proveedorId ? 'No se encontraron productos con ese criterio' : 'No hay productos registrados en el catálogo de tienda'}
          canDeactivate={canDeactivate}
          onEditar={(producto) => { setError(''); setSuccess(''); setEditando(producto); }}
          onHistorial={setHistorial}
          onEliminar={handleEliminar}
          onReactivar={handleReactivar}
        />
        {lista.totalPages > 1 && (
          <div className="mt-4">
            <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />
          </div>
        )}
      </section>

      <CrearProductoModal abierto={creando} proveedores={proveedores} confirmar={confirm} onCreated={handleCreado} onClose={() => setCreando(false)} />
      <EditarProductoModal producto={editando} proveedores={proveedores} confirmar={confirm} onSaved={handleGuardado} onAjustar={setAjustando} onClose={() => setEditando(null)} />
      <AjusteStockModal producto={ajustando} onAjustado={handleAjustado} onClose={() => setAjustando(null)} />
      <HistorialStockModal producto={historial} onClose={() => setHistorial(null)} />
      <ReposicionModal abierto={reponiendo} onClose={() => setReponiendo(false)} />
      {ConfirmModal}
    </div>
  );
};

export default Inventario;
