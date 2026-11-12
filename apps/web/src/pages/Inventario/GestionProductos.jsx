import PaginationControls from '../../components/PaginationControls';
import AjusteStockModal from './AjusteStockModal';
import CrearProductoModal from './CrearProductoModal';
import EditarProductoModal from './EditarProductoModal';
import HistorialStockModal from './HistorialStockModal';
import InventarioToolbar from './InventarioToolbar';
import ProductosLista from './ProductosLista';

// La lista de productos con su buscador, filtros, paginas y los cuadros de crear, editar, ajustar stock e historial.
// La comparten el inventario de la tienda y los productos de cartera; sin `proveedores` se ocultan los proveedores.
// `inventario` viene de useInventario y `acciones` de useAccionesProducto.
const GestionProductos = ({
  inventario, acciones, confirm, catalogo = 'tienda', proveedores, canDeactivate, titulo, placeholder, vacio, tituloCrear, onRecargar,
}) => {
  const { filtros, setFiltro, setPagina, texto, setTexto, lista, loading } = inventario;
  const hayFiltro = Boolean(texto || filtros.estado !== 'todos' || filtros.soloInactivos || filtros.proveedorId);

  return (
    <>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {titulo && <h2 className="mb-4 text-xl font-bold text-gray-900">{titulo}</h2>}
        <InventarioToolbar
          texto={texto}
          onTexto={setTexto}
          filtros={filtros}
          onFiltro={setFiltro}
          proveedores={proveedores}
          puedeVerDesactivados={canDeactivate}
          onRecargar={onRecargar}
          placeholder={placeholder}
        />
        <ProductosLista
          productos={lista.data}
          loading={loading}
          vacio={hayFiltro ? 'No se encontraron productos con ese criterio' : vacio}
          canDeactivate={canDeactivate}
          conProveedor={Boolean(proveedores)}
          onEditar={acciones.abrirEditar}
          onHistorial={acciones.abrirHistorial}
          onEliminar={acciones.handleDesactivar}
          onReactivar={acciones.handleReactivar}
        />
        {lista.totalPages > 1 && (
          <div className="mt-4">
            <PaginationControls currentPage={filtros.page} totalPages={lista.totalPages} onPageChange={setPagina} />
          </div>
        )}
      </section>

      <CrearProductoModal abierto={acciones.creando} catalogo={catalogo} proveedores={proveedores} confirmar={confirm} titulo={tituloCrear} onCreated={acciones.handleCreado} onClose={acciones.cerrarCrear} />
      <EditarProductoModal producto={acciones.editando} proveedores={proveedores} confirmar={confirm} onSaved={acciones.handleGuardado} onAjustar={acciones.abrirAjuste} onClose={acciones.cerrarEditar} />
      <AjusteStockModal producto={acciones.ajustando} onAjustado={acciones.handleAjustado} onClose={acciones.cerrarAjuste} />
      <HistorialStockModal producto={acciones.historial} onClose={acciones.cerrarHistorial} />
    </>
  );
};

export default GestionProductos;
