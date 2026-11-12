import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { apiDelete, apiRequest } from '../../../api/httpClient';
import ErrorMessage from '../../../components/ErrorMessage';
import PaginationControls from '../../../components/PaginationControls';
import SuccessMessage from '../../../components/SuccessMessage';
import useConfirm from '../../../components/useConfirm';
import AjusteStockModal from '../../Inventario/AjusteStockModal';
import CrearProductoModal from '../../Inventario/CrearProductoModal';
import EditarProductoModal from '../../Inventario/EditarProductoModal';
import HistorialStockModal from '../../Inventario/HistorialStockModal';
import InventarioToolbar from '../../Inventario/InventarioToolbar';
import ProductosLista from '../../Inventario/ProductosLista';
import ResumenInventario from '../../Inventario/ResumenInventario';
import { useInventario } from '../../Inventario/useInventario';

const CATALOGO = 'cartera';

// Productos de cartera con el mismo control de stock del inventario de la tienda: busqueda y filtros del servidor,
// stock, margen, ajuste con motivo, historial, desactivados y resumen. Cartera no usa proveedores.
// `onCambio` avisa a la pantalla de Cartera que algo cambio (la venta de cartera lee estos productos).
const ProductosCarteraSection = ({ onCambio }) => {
  const { token } = useAuth();
  const { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload } = useInventario(token, CATALOGO);
  const { confirm, ConfirmModal } = useConfirm();
  const recargar = useCallback(async () => { await reload({ silent: true }); onCambio?.(); }, [reload, onCambio]);

  const [success, setSuccess] = useState('');
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null);
  const [historial, setHistorial] = useState(null);

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

  const handleDesactivar = async (producto) => {
    const ok = await confirm({ title: 'Desactivar producto', confirmLabel: 'Desactivar', message: `¿Desactivar "${producto.nombre}"? Dejará de salir en la venta de cartera y podrás reactivarlo en «Desactivados».` });
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

  const hayFiltro = Boolean(texto || filtros.estado !== 'todos' || filtros.soloInactivos);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Productos de cartera</h2>
            <p className="text-sm text-gray-600">Catálogo y stock de los productos que aparecen en la venta de cartera.</p>
          </div>
          <button type="button" onClick={() => { setError(''); setSuccess(''); setCreando(true); }} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            <Plus className="h-4 w-4" aria-hidden="true" /> Registrar producto
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ResumenInventario resumen={resumen} loading={loading} estado={filtros.estado} onEstado={(estado) => setFiltro({ estado, soloInactivos: false })} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <InventarioToolbar
          texto={texto}
          onTexto={setTexto}
          filtros={filtros}
          onFiltro={setFiltro}
          puedeVerDesactivados
          onRecargar={recargar}
          placeholder="Buscar por nombre o código"
        />
        <ProductosLista
          productos={lista.data}
          loading={loading}
          vacio={hayFiltro ? 'No se encontraron productos con ese criterio' : 'Todavía no hay productos de cartera: registra el primero'}
          canDeactivate
          conProveedor={false}
          onEditar={(producto) => { setError(''); setSuccess(''); setEditando(producto); }}
          onHistorial={setHistorial}
          onEliminar={handleDesactivar}
          onReactivar={handleReactivar}
        />
        {lista.totalPages > 1 && (
          <div className="mt-4">
            <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />
          </div>
        )}
      </div>

      <CrearProductoModal abierto={creando} catalogo={CATALOGO} confirmar={confirm} onCreated={handleCreado} onClose={() => setCreando(false)} titulo="Registrar producto de cartera" />
      <EditarProductoModal producto={editando} confirmar={confirm} onSaved={handleGuardado} onAjustar={setAjustando} onClose={() => setEditando(null)} />
      <AjusteStockModal producto={ajustando} onAjustado={handleAjustado} onClose={() => setAjustando(null)} />
      <HistorialStockModal producto={historial} onClose={() => setHistorial(null)} />
      {ConfirmModal}
    </section>
  );
};

export default ProductosCarteraSection;
