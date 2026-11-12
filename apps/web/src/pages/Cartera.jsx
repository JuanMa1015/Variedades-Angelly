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
import CarteraProductosSection from './cartera/CarteraProductosSection';
import CarteraVentaSection from './cartera/CarteraVentaSection';
import HistorialVentasCartera from './cartera/ventas/HistorialVentasCartera';
import { useCarteraData } from './cartera/useCarteraData';
import { apiUpload } from '../api/httpClient';


const Cartera = () => {
  const data = useCarteraData();
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleProductoSubmitWithImage = async (e) => {
    let imagen_url = data.productoForm.imagen_url;
    if (imageFile) {
      try {
        const result = await apiUpload('/api/upload-imagen', imageFile);
        imagen_url = result.url;
      } catch {
        imagen_url = null;
      }
    }
    setProductoForm((prev) => ({ ...prev, imagen_url }));
    setImageFile(null);
    setImagePreview(null);
    await data.handleSubmitProducto(e);
  };

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
    productoForm,
    setProductoForm,
    isClienteModalOpen,
    isProductoModalOpen,
    editingClienteId,
    editingProductoId,
    savingCliente,
    savingProducto,
    startNewCliente,
    startNewProducto,
    startEditingCliente,
    cancelEditingCliente,
    startEditingProducto,
    cancelEditingProducto,
    handleSubmitCliente,
    handleDeleteCliente,
    handleReactivarCliente,
    reloadTick,
    refreshPage,
    handleDeleteProducto,
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
    ConfirmModal,
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
          startNewProducto={startNewProducto}
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
        <CarteraProductosSection
          productosCartera={productosCartera}
          formatMoney={formatMoney}
          startNewProducto={startNewProducto}
          startEditingProducto={startEditingProducto}
          handleDeleteProducto={handleDeleteProducto}
        />
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

      {isProductoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{editingProductoId ? 'Editar producto' : 'Registrar producto de cartera'}</h3>
                <p className="text-sm text-gray-600">{editingProductoId ? 'Actualiza los datos del producto.' : 'Este producto quedará disponible en venta de cartera.'}</p>
              </div>
              <button type="button" onClick={cancelEditingProducto} className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50" aria-label="Cerrar modal">×</button>
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleProductoSubmitWithImage}>
              <input
                type="text"
                value={productoForm.nombre}
                onChange={(event) => setProductoForm((current) => ({ ...current, nombre: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Nombre del producto"
              />

              <input
                type="text"
                value={productoForm.codigo_barras}
                onChange={(event) => setProductoForm((current) => ({ ...current, codigo_barras: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                placeholder="Código de barras (opcional)"
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  min="0"
                  value={productoForm.precio_costo}
                  onChange={(event) => setProductoForm((current) => ({ ...current, precio_costo: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Precio costo"
                />
                <input
                  type="number"
                  min="0"
                  value={productoForm.precio_venta}
                  onChange={(event) => setProductoForm((current) => ({ ...current, precio_venta: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-rosewood focus:outline-none"
                  placeholder="Precio venta"
                />
              </div>

              {/* Image upload */}
              <div>
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img src={imagePreview} alt="Vista previa de la imagen del producto" className="h-24 w-24 rounded-xl border border-gray-300 object-cover" />
                    <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -right-2 -top-2 rounded-full border border-gray-300 bg-white p-0.5 text-gray-500 hover:text-red-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : productoForm.imagen_url ? (
                  <div className="relative inline-block">
                    <img src={productoForm.imagen_url?.startsWith('http') ? productoForm.imagen_url : `${import.meta.env.VITE_API_URL ?? ''}${productoForm.imagen_url}`} alt={productoForm.nombre || 'Imagen del producto'} className="h-24 w-24 rounded-xl border border-gray-300 object-cover" />
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 hover:border-rosewood hover:text-rosewood">
                    <ImageUp className="h-5 w-5" />
                    <span>Subir imagen del producto</span>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button type="submit" disabled={savingProducto} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">{savingProducto ? 'Guardando...' : <><Package className="h-4 w-4" /> {editingProductoId ? 'Actualizar producto' : 'Guardar producto'}</>}</button>
                <button type="button" onClick={cancelEditingProducto} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
