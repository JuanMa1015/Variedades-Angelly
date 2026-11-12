import { useState } from 'react';
import { ImageUp, Package, Plus, UserPlus, X } from 'lucide-react';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import Skeleton from '../components/Skeleton';
import AbonoCarteraModal from './cartera/cobrar/AbonoCarteraModal';
import VerDetalleModal from '../components/VerDetalleModal';
import CarteraDashboardSection from './cartera/CarteraDashboardSection';
import CarteraClientesSection from './cartera/CarteraClientesSection';
import CarteraCobrarSection from './cartera/CarteraCobrarSection';
import ProductosCarteraSection from './cartera/productos/ProductosCarteraSection';
import CrearProductoModal from './Inventario/CrearProductoModal';
import CarteraVentaSection from './cartera/CarteraVentaSection';
import HistorialVentasCartera from './cartera/ventas/HistorialVentasCartera';
import { useCarteraData } from './cartera/useCarteraData';


const Cartera = () => {
  const data = useCarteraData();
  const [creandoProducto, setCreandoProducto] = useState(false);

  const {
    activeSection,
    clientesCatalogo,
    clientesRanking,
    clientesMasCompras,
    clientesAccesoRapido,
    dashboardVentas,
    resumenCartera,
    productosCartera,
    error,
    success,
    selectedClienteAbono,
    setSelectedClienteAbono,
    selectedClienteDetalle,
    setSelectedClienteDetalle,
    isVentasHistorialOpen,
    setIsVentasHistorialOpen,
    clienteForm,
    setClienteForm,
    isClienteModalOpen,
    editingClienteId,
    savingCliente,
    startNewCliente,
    startEditingCliente,
    cancelEditingCliente,
    handleSubmitCliente,
    handleDeleteCliente,
    handleReactivarCliente,
    reloadTick,
    refreshPage,
    handleAbrirWhatsapp,
    handleRegistrarAbono,
    handleAbonoRegistrado,
    handleOpenVentasHistorial,
    handleVerDetalle,
    handleSubmitVentaCartera,
    handleAddProductoVenta,
    handleChangeVentaItem,
    handleRemoveVentaItem,
    cleanMessages,
    ventaModo,
    setVentaModo,
    ventaClienteId,
    setVentaClienteId,
    ventaFecha,
    setVentaFecha,
    abonoInicial,
    setAbonoInicial,
    pagoRecibido,
    setPagoRecibido,
    metodoPago,
    setMetodoPago,
    referenciaVenta,
    setReferenciaVenta,
    ventaItems,
    productosById,
    totalVentaEstimado,
    totalAPagar,
    cambioContado,
    savingVenta,
    navigate,
    formatMoney,
    confirm,
    ConfirmModal,
    setSuccess,
  } = data;

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <ErrorMessage message={error} onDismiss={cleanMessages} />
      <SuccessMessage message={success} onDismiss={cleanMessages} />

      {activeSection === 'venta' && (
        <CarteraVentaSection
          clientesCatalogo={clientesCatalogo}
          formatMoney={formatMoney}
          ventaModo={ventaModo}
          setVentaModo={setVentaModo}
          ventaClienteId={ventaClienteId}
          setVentaClienteId={setVentaClienteId}
          ventaFecha={ventaFecha}
          setVentaFecha={setVentaFecha}
          abonoInicial={abonoInicial}
          setAbonoInicial={setAbonoInicial}
          pagoRecibido={pagoRecibido}
          setPagoRecibido={setPagoRecibido}
          metodoPago={metodoPago}
          setMetodoPago={setMetodoPago}
          referenciaVenta={referenciaVenta}
          setReferenciaVenta={setReferenciaVenta}
          ventaItems={ventaItems}
          productosById={productosById}
          todosLosProductos={productosCartera}
          totalVentaEstimado={totalVentaEstimado}
          totalAPagar={totalAPagar}
          cambioContado={cambioContado}
          savingVenta={savingVenta}
          handleOpenVentasHistorial={handleOpenVentasHistorial}
          startNewCliente={startNewCliente}
          startNewProducto={() => setCreandoProducto(true)}
          handleAddProductoVenta={handleAddProductoVenta}
          handleChangeVentaItem={handleChangeVentaItem}
          handleRemoveVentaItem={handleRemoveVentaItem}
          handleSubmitVentaCartera={handleSubmitVentaCartera}
        />
      )}

      {activeSection === 'dashboard' && (
        <CarteraDashboardSection
          resumenCartera={resumenCartera}
          dashboardVentas={dashboardVentas}
          clientesRanking={clientesRanking}
          clientesMasCompras={clientesMasCompras}
          clientesAccesoRapido={clientesAccesoRapido}
          navigate={navigate}
          formatMoney={formatMoney}
        />
      )}

      {activeSection === 'clientes' && (
        <CarteraClientesSection
          formatMoney={formatMoney}
          recargar={reloadTick}
          startNewCliente={startNewCliente}
          startEditingCliente={startEditingCliente}
          handleDeleteCliente={handleDeleteCliente}
          handleReactivarCliente={handleReactivarCliente}
          handleVerDetalle={handleVerDetalle}
        />
      )}

      {activeSection === 'productos' && (
        <ProductosCarteraSection onCambio={refreshPage} />
      )}

      {activeSection === 'cobrar' && (
        <CarteraCobrarSection
          formatMoney={formatMoney}
          recargar={reloadTick}
          handleAbrirWhatsapp={handleAbrirWhatsapp}
          handleRegistrarAbono={handleRegistrarAbono}
          handleVerDetalle={handleVerDetalle}
        />
      )}

      {isClienteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{editingClienteId ? 'Editar cliente' : 'Registrar cliente'}</h3>
                <p className="text-sm text-gray-600">Alta rápida desde modal para despejar la vista principal.</p>
              </div>
              <button type="button" onClick={cancelEditingCliente} className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50" aria-label="Cerrar modal">×</button>
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleSubmitCliente}>
              <input
                type="text"
                value={clienteForm.nombre}
                onChange={(event) => setClienteForm((current) => ({ ...current, nombre: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Nombre del cliente"
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={clienteForm.documento}
                  onChange={(event) => setClienteForm((current) => ({ ...current, documento: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Cédula o documento"
                />
                <input
                  type="text"
                  value={clienteForm.telefono_whatsapp}
                  onChange={(event) => setClienteForm((current) => ({ ...current, telefono_whatsapp: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="WhatsApp (10 dígitos, ej: 3001234567)"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button type="submit" disabled={savingCliente} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">{savingCliente ? 'Guardando...' : <><UserPlus className="h-4 w-4" /> {editingClienteId ? 'Actualizar' : 'Guardar cliente'}</>}</button>
                <button type="button" onClick={cancelEditingCliente} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CrearProductoModal
        abierto={creandoProducto}
        catalogo="cartera"
        confirmar={confirm}
        titulo="Registrar producto de cartera"
        onCreated={async (mensaje) => { setCreandoProducto(false); setSuccess(mensaje); refreshPage(); }}
        onClose={() => setCreandoProducto(false)}
      />

      <HistorialVentasCartera
        abierto={isVentasHistorialOpen}
        onClose={() => setIsVentasHistorialOpen(false)}
        formatMoney={formatMoney}
        onCambio={refreshPage}
      />

      <AbonoCarteraModal
        cliente={selectedClienteAbono}
        onRegistrado={handleAbonoRegistrado}
        onClose={() => setSelectedClienteAbono(null)}
      />

      {selectedClienteDetalle && (
        <VerDetalleModal
          cliente={selectedClienteDetalle}
          isOpen={true}
          onClose={() => setSelectedClienteDetalle(null)}
        />
      )}
      {ConfirmModal}
    </div>
  );
};

export default Cartera;
