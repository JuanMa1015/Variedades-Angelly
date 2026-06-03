import { useState } from 'react';
import { ImageUp, Package, Plus, UserPlus, X } from 'lucide-react';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import Skeleton from '../components/Skeleton';
import RegistrarAbonoModal from '../components/RegistrarAbonoModal';
import VerDetalleModal from '../components/VerDetalleModal';
import CarteraDashboardSection from './cartera/CarteraDashboardSection';
import CarteraClientesSection from './cartera/CarteraClientesSection';
import CarteraCobrarSection from './cartera/CarteraCobrarSection';
import CarteraProductosSection from './cartera/CarteraProductosSection';
import CarteraVentaSection from './cartera/CarteraVentaSection';
import { useCarteraData } from './cartera/useCarteraData';
import { apiUpload } from '../api/httpClient';

import { formatDateTime } from '../utils/format';

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
    clientes,
    clientesCatalogo,
    clientesCarteraFiltrados,
    clientesRanking,
    clientesMasCompras,
    clientesAccesoRapido,
    dashboardVentas,
    resumenCartera,
    productosCartera,
    loading,
    error,
    success,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    totalPages,
    selectedClienteAbono,
    setSelectedClienteAbono,
    selectedClienteDetalle,
    setSelectedClienteDetalle,
    expandedCobroClientes,
    toggleCobroCliente,
    ventasHistorial,
    loadingVentasHistorial,
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
    handleDeleteProducto,
    handleAbrirWhatsapp,
    handleRegistrarAbono,
    handleConfirmAbono,
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
          clientesCarteraFiltrados={clientesCarteraFiltrados}
          formatMoney={formatMoney}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          startNewCliente={startNewCliente}
          startEditingCliente={startEditingCliente}
          handleDeleteCliente={handleDeleteCliente}
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
          clientes={clientes}
          loading={loading}
          error={error}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          expandedCobroClientes={expandedCobroClientes}
          toggleCobroCliente={toggleCobroCliente}
          handleAbrirWhatsapp={handleAbrirWhatsapp}
          handleRegistrarAbono={handleRegistrarAbono}
          handleVerDetalle={handleVerDetalle}
          startEditingCliente={startEditingCliente}
          handleDeleteCliente={handleDeleteCliente}
          formatMoney={formatMoney}
          totalPages={totalPages}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
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
                    <img src={imagePreview} alt="Preview" className="h-24 w-24 rounded-xl border border-gray-300 object-cover" />
                    <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -right-2 -top-2 rounded-full border border-gray-300 bg-white p-0.5 text-gray-500 hover:text-red-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : productoForm.imagen_url ? (
                  <div className="relative inline-block">
                    <img src={productoForm.imagen_url} alt="Producto" className="h-24 w-24 rounded-xl border border-gray-300 object-cover" />
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

      {isVentasHistorialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Historial de ventas de cartera</h3>
                <p className="text-sm text-gray-600">Últimas ventas registradas en el módulo de cartera.</p>
              </div>
              <button type="button" onClick={() => setIsVentasHistorialOpen(false)} className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50">Cerrar</button>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200">
              <div className="max-h-[60vh] overflow-auto">
                <table className="hidden w-full min-w-[860px] text-left text-sm md:table">
                  <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">Fecha</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Cliente</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Artículos</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Saldo cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingVentasHistorial && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8"><Skeleton lines={1} /></td>
                      </tr>
                    )}

                    {!loadingVentasHistorial && ventasHistorial.map((venta, index) => (
                      <tr key={`hist-venta-${venta.venta_id}`} className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                        <td className="px-4 py-3 text-gray-700">{formatDateTime(venta.fecha)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{venta.cliente_nombre}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <p className="font-medium text-gray-900">{venta.articulos_detalle || '-'}</p>
                          <p className="text-xs text-gray-500">{venta.articulos || 0} unidades</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(venta.total)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatMoney(venta.saldo_cliente)}</td>
                      </tr>
                    ))}

                    {!loadingVentasHistorial && ventasHistorial.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          No hay ventas de cartera registradas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="space-y-3 p-4 md:hidden">
                  {loadingVentasHistorial && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                      <Skeleton lines={2} />
                    </div>
                  )}

                  {!loadingVentasHistorial && ventasHistorial.map((venta) => (
                    <div key={`hist-card-${venta.venta_id}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{venta.cliente_nombre}</p>
                          <p className="text-xs text-gray-500">{formatDateTime(venta.fecha)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Total</p>
                          <p className="text-sm font-bold text-gray-900">{formatMoney(venta.total)}</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <p className="font-medium text-gray-900">{venta.articulos_detalle || '-'}</p>
                        <p className="text-xs text-gray-500">{venta.articulos || 0} unidades</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                        <span>Saldo cliente</span>
                        <span className="font-semibold text-gray-900">{formatMoney(venta.saldo_cliente)}</span>
                      </div>
                    </div>
                  ))}

                  {!loadingVentasHistorial && ventasHistorial.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                      No hay ventas de cartera registradas.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedClienteAbono && (
        <RegistrarAbonoModal
          cliente={selectedClienteAbono}
          isOpen={true}
          onClose={() => setSelectedClienteAbono(null)}
          onConfirm={handleConfirmAbono}
        />
      )}

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
