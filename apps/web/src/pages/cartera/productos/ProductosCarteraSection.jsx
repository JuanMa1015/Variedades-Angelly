import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import ErrorMessage from '../../../components/ErrorMessage';
import SuccessMessage from '../../../components/SuccessMessage';
import useConfirm from '../../../components/useConfirm';
import GestionProductos from '../../Inventario/GestionProductos';
import ResumenInventario from '../../Inventario/ResumenInventario';
import { useAccionesProducto } from '../../Inventario/useAccionesProducto';
import { useInventario } from '../../Inventario/useInventario';

const CATALOGO = 'cartera';

// Productos de cartera con el mismo control de stock del inventario de la tienda (ver GestionProductos).
// Cartera no usa proveedores. `onCambio` avisa a la pantalla de Cartera que algo cambio (la venta lee estos productos).
const ProductosCarteraSection = ({ onCambio }) => {
  const { token } = useAuth();
  const { filtros, setFiltro, setPagina, texto, setTexto, lista, resumen, loading, error, setError, reload } = useInventario(token, CATALOGO);
  const { confirm, ConfirmModal } = useConfirm();
  const recargar = useCallback(async () => { await reload({ silent: true }); onCambio?.(); }, [reload, onCambio]);
  const acciones = useAccionesProducto({
    recargar,
    setError,
    confirm,
    textoDesactivar: (producto) => ({ message: `¿Desactivar "${producto.nombre}"? Dejará de salir en la venta de cartera y podrás reactivarlo en «Desactivados».` }),
  });

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Productos de cartera</h2>
            <p className="text-sm text-gray-600">Catálogo y stock de los productos que aparecen en la venta de cartera.</p>
          </div>
          <button type="button" onClick={acciones.abrirCrear} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            <Plus className="h-4 w-4" aria-hidden="true" /> Registrar producto
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={acciones.success} onDismiss={() => acciones.setSuccess('')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ResumenInventario resumen={resumen} loading={loading} estado={filtros.estado} onEstado={(estado) => setFiltro({ estado, soloInactivos: false })} />
      </div>

      <GestionProductos
        inventario={{ filtros, setFiltro, setPagina, texto, setTexto, lista, loading }}
        acciones={acciones}
        confirm={confirm}
        catalogo={CATALOGO}
        canDeactivate
        placeholder="Buscar por nombre o código"
        vacio="Todavía no hay productos de cartera: registra el primero"
        tituloCrear="Registrar producto de cartera"
        onRecargar={recargar}
      />
      {ConfirmModal}
    </section>
  );
};

export default ProductosCarteraSection;
