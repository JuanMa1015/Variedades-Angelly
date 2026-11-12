import { useCallback, useEffect, useState } from 'react';
import { Package, PackagePlus, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import useConfirm from '../components/useConfirm';
import GestionProductos from './Inventario/GestionProductos';
import ResumenInventario from './Inventario/ResumenInventario';
import ReposicionModal from './Inventario/ReposicionModal';
import { useAccionesProducto } from './Inventario/useAccionesProducto';
import { useInventario } from './Inventario/useInventario';

const Inventario = () => {
  const { token, user } = useAuth();
  // Desactivar y reactivar productos es solo de admin/superadmin (el backend responde 403 al vendedor).
  const canDeactivate = user?.role === 'admin' || user?.role === 'superadmin';
  const { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload } = useInventario(token);
  const { confirm, ConfirmModal } = useConfirm();
  const recargar = useCallback(() => reload({ silent: true }), [reload]);

  const acciones = useAccionesProducto({
    recargar,
    setError,
    confirm,
    textoDesactivar: (producto) => ({ message: `¿Desactivar "${producto.nombre}"? Podrás verlo y reactivarlo en «Desactivados».` }),
  });
  const { success, setSuccess } = acciones;

  const [proveedores, setProveedores] = useState([]);
  const [reponiendo, setReponiendo] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    apiGet('/api/proveedores', { signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted) setProveedores(Array.isArray(payload) ? payload : []); })
      .catch(() => { /* sin proveedores el formulario sigue funcionando */ });
    return () => controller.abort();
  }, [token]);

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
            <button type="button" onClick={acciones.abrirCrear} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar producto
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ResumenInventario resumen={resumen} loading={loading} estado={filtros.estado} onEstado={(estado) => setFiltro({ estado, soloInactivos: false })} />
      </div>

      <GestionProductos
        inventario={{ filtros, setFiltro, setPagina, texto, setTexto, lista, loading }}
        acciones={acciones}
        confirm={confirm}
        proveedores={proveedores}
        canDeactivate={canDeactivate}
        titulo="Productos de tienda"
        vacio="No hay productos registrados en el catálogo de tienda"
        tituloCrear="Agregar producto al inventario"
        onRecargar={recargar}
      />

      <ReposicionModal abierto={reponiendo} onClose={() => setReponiendo(false)} />
      {ConfirmModal}
    </div>
  );
};

export default Inventario;
