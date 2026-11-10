import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import useConfirm from '../components/useConfirm';
import ProductSelectionView from './Ventas/ProductSelectionView';
import CartPanel from './Ventas/CartPanel';
import SaleReceiptPanel from './Ventas/SaleReceiptPanel';
import CajaGate from './Ventas/CajaGate';
import HistorialVentasModal from './Ventas/HistorialVentasModal';
import MobileCartBar from './Ventas/MobileCartBar';
import NewClientModal from './Ventas/NewClientModal';
import NewLoyaltyClientModal from './Ventas/NewLoyaltyClientModal';
import { printHtml } from './Ventas/printReceipt';
import { buildReceiptHtml } from './Ventas/receiptHtml';
import { useAvailableHeight } from './Ventas/useAvailableHeight';
import { useVentasData } from './Ventas/useVentasData';
import { useHeldTickets } from './Ventas/useHeldTickets';
import { usePosPreferences } from './Ventas/usePosPreferences';
import { useVentasShortcuts } from './Ventas/useVentasShortcuts';
import {
  CATALOGO_ENDPOINT,
  buildSalePayload,
  emptyTicket,
  extractProductos,
  groupCartItems,
  looksLikeBarcode,
  loyaltyRedemption,
  resolvePayment,
  validateSale,
} from './Ventas/posHelpers';
import { formatMoney } from '../utils/format';
import { CONTACTO, SITE } from '../config/site';

const EMPTY_LOYALTY_FORM = { nombre: '', telefono: '', aceptaDatos: false };
const TICKET_FIELDS = Object.keys(emptyTicket());
const pickTicketFields = (source) => Object.fromEntries(TICKET_FIELDS.map((field) => [field, source[field]]));

const Ventas = () => {
  const { token, user } = useAuth();
  const { confirm, ConfirmModal } = useConfirm();
  const data = useVentasData(token);
  const { productos, clientesTienda, clientesFidelizacion, fidelizacionConfig, error, setError } = data;
  const heldTickets = useHeldTickets();
  const preferences = usePosPreferences();

  const [ticket, setTicket] = useState(emptyTicket);
  const [productSearch, setProductSearch] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingVenta, setSubmittingVenta] = useState(false);
  const [ventaCompletada, setVentaCompletada] = useState(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);

  const [newClient, setNewClient] = useState({ nombre: '', telefono: '' });
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [isLoyaltyModalOpen, setIsLoyaltyModalOpen] = useState(false);
  const [loyaltyForm, setLoyaltyForm] = useState(EMPTY_LOYALTY_FORM);

  const searchInputRef = useRef(null);
  const rootRef = useRef(null);
  useAvailableHeight(rootRef);
  const patchTicket = useCallback((patch) => setTicket((current) => ({ ...current, ...patch })), []);

  const productosById = useMemo(
    () => new Map(productos.map((producto) => [Number(producto.id), producto])),
    [productos],
  );

  const cartItems = useMemo(
    () => ticket.items.filter((item) => Number(item.producto_id) > 0 && Number(item.cantidad || 0) > 0),
    [ticket.items],
  );

  const subtotalEstimado = useMemo(
    () => ticket.items.reduce((acc, item) => {
      const producto = productosById.get(Number(item.producto_id));
      const cantidad = Number(item.cantidad || 0);
      return producto && cantidad > 0 ? acc + Number(producto.precio_venta || 0) * cantidad : acc;
    }, 0),
    [ticket.items, productosById],
  );

  const clienteFidelizacion = useMemo(
    () => clientesFidelizacion.find((cliente) => String(cliente.id) === String(ticket.clienteFidelizacionId)),
    [clientesFidelizacion, ticket.clienteFidelizacionId],
  );
  const redencion = useMemo(
    () => loyaltyRedemption({
      cliente: clienteFidelizacion,
      config: fidelizacionConfig,
      subtotal: subtotalEstimado,
      usar: ticket.usarPuntos,
    }),
    [clienteFidelizacion, fidelizacionConfig, subtotalEstimado, ticket.usarPuntos],
  );
  // Lo que realmente se cobra: el subtotal menos el descuento por puntos.
  const totalEstimado = subtotalEstimado - redencion.descuento;

  const cambioContado = useMemo(() => {
    if (ticket.metodoPago !== 'efectivo') return 0;
    const pago = Number(ticket.montoPago || 0);
    return Number.isFinite(pago) ? Math.max(0, pago - totalEstimado) : 0;
  }, [ticket.metodoPago, ticket.montoPago, totalEstimado]);

  const puntosEstimados = useMemo(() => {
    const cobrado = ticket.esFiado ? Number(ticket.abonoInicialFiado || 0) : totalEstimado;
    return Math.floor(cobrado / (fidelizacionConfig.pesos_por_punto || 1000));
  }, [ticket.esFiado, ticket.abonoInicialFiado, totalEstimado, fidelizacionConfig]);

  const quickPickProductos = useMemo(
    () => preferences.quickPickIds.map((id) => productosById.get(id)).filter(Boolean),
    [preferences.quickPickIds, productosById],
  );

  const cleanMessages = () => {
    setError('');
    setSuccess('');
  };

  // ── Carrito ──

  // `productoConocido` evita depender de `productos` cuando el producto acaba de llegar del servidor.
  const handleQuickAddProducto = (productoId, productoConocido) => {
    const producto = productoConocido ?? productosById.get(Number(productoId));
    const stock = Number(producto?.stock_actual || 0);

    setTicket((current) => {
      const existing = current.items.find((item) => Number(item.producto_id) === Number(productoId));
      if (Number(existing?.cantidad || 0) >= stock) return current;
      const items = existing
        ? current.items.map((item) => (item === existing ? { ...item, cantidad: Number(item.cantidad || 0) + 1 } : item))
        : [...current.items, { producto_id: String(productoId), cantidad: 1 }];
      return { ...current, items };
    });
    preferences.registerUse(productoId);
  };

  const handleRemoveProducto = (productoId) => {
    setTicket((current) => ({
      ...current,
      items: current.items.filter((item) => Number(item.producto_id) !== Number(productoId)),
    }));
  };

  const handleChangeQty = (index, delta) => {
    setTicket((current) => ({
      ...current,
      items: current.items
        .map((item, rowIndex) => (rowIndex === index ? { ...item, cantidad: Number(item.cantidad || 0) + delta } : item))
        .filter((item) => Number(item.cantidad) > 0),
    }));
  };

  // ── Busqueda y escaneo ──

  // El catalogo inicial trae 200 productos: lo que no este se busca en el servidor.
  useEffect(() => {
    const term = productSearch.trim();
    if (!token || term.length < 2) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const payload = await apiGet(`${CATALOGO_ENDPOINT}&limit=50&q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!controller.signal.aborted) data.addFetchedProductos(extractProductos(payload));
      } catch {
        // La busqueda local sigue funcionando si el servidor no responde.
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch, token]);

  const productosFiltrados = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return productos;
    return productos.filter((producto) => (
      producto.nombre.toLowerCase().includes(term) || String(producto.codigo_barras || '').toLowerCase().includes(term)
    ));
  }, [productos, productSearch]);

  const findProductByCode = async (code) => {
    const local = productos.find((producto) => producto.codigo_barras === code);
    if (local) return local;
    const payload = await apiGet(`${CATALOGO_ENDPOINT}&limit=5&q=${encodeURIComponent(code)}`);
    const encontrados = extractProductos(payload);
    const producto = encontrados.find((item) => item.codigo_barras === code);
    if (producto) data.addFetchedProductos(encontrados);
    return producto;
  };

  // Enter en la barra: agrega el codigo escaneado, o el unico resultado de una busqueda por nombre.
  const handleScanCode = async (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return false;
    cleanMessages();

    let producto;
    try {
      producto = looksLikeBarcode(code) ? await findProductByCode(code) : (productosFiltrados.length === 1 ? productosFiltrados[0] : null);
    } catch (err) {
      setError(err.message || 'No se pudo buscar el código de barras');
      return false;
    }

    if (!producto) {
      if (looksLikeBarcode(code)) setError(`No existe un producto con el código ${code}`);
      return false;
    }
    if (Number(producto.stock_actual || 0) <= 0) {
      setError(`"${producto.nombre}" no tiene stock disponible`);
      return false;
    }
    handleQuickAddProducto(producto.id, producto);
    return true;
  };

  // ── Venta ──

  const handleSubmitVenta = async (event) => {
    event?.preventDefault?.();
    cleanMessages();

    const grouped = groupCartItems(ticket.items);
    const validationError = validateSale({ grouped, productos, ticket, total: totalEstimado });
    if (validationError) {
      setError(validationError);
      return;
    }

    const pago = resolvePayment({ metodoPago: ticket.metodoPago, montoPago: ticket.montoPago, total: totalEstimado });
    const abono = Number(ticket.abonoInicialFiado || 0);

    try {
      setSubmittingVenta(true);
      const ventaCreada = await apiPost('/api/ventas', buildSalePayload({
        grouped,
        ticket,
        puntosCanjeados: redencion.puntos,
        montoRecibido: ticket.esFiado || ticket.metodoPago !== 'efectivo' ? null : pago,
      }));

      const selectedCliente = ticket.esFiado
        ? clientesTienda.find((cliente) => String(cliente.id) === String(ticket.clienteTiendaId))
        : null;
      const receiptItems = ticket.items.map((item) => {
        const producto = productosById.get(Number(item.producto_id));
        const cantidad = Number(item.cantidad || 0);
        const precio = Number(producto?.precio_venta || 0);
        return { nombre: producto?.nombre || `#${item.producto_id}`, cantidad, precio, subtotal: cantidad * precio };
      });

      setVentaCompletada({
        items: receiptItems,
        total: totalEstimado,
        descuento: redencion.descuento,
        puntosCanjeados: redencion.puntos,
        metodoPago: ticket.metodoPago,
        pago,
        cambio: ticket.esFiado ? 0 : Math.max(0, pago - totalEstimado),
        esFiado: ticket.esFiado,
        abono: ticket.esFiado ? abono : 0,
        puntos: Number(ventaCreada?.puntos_otorgados || 0),
        cliente: selectedCliente?.nombre || null,
        timestamp: new Date().toLocaleString('es-CO'),
      });
      setTicket(emptyTicket());

      // La venta ya quedo registrada: si la recarga falla no debe presentarse como
      // un error de venta (el cajero la repetiria y se duplicaria el cobro).
      data.reload().catch(() => {
        setSuccess('Venta registrada. No se pudo actualizar el inventario en pantalla; recarga la página.');
      });
    } catch (err) {
      setError(err.message || 'No fue posible registrar la venta');
      // Otra pestaña pudo cerrar la caja: se vuelve a consultar para mostrar la apertura.
      if (err.status === 409 && /caja/i.test(err.message || '')) data.reload().catch(() => {});
    } finally {
      setSubmittingVenta(false);
    }
  };

  const handleNewSale = () => {
    setVentaCompletada(null);
    cleanMessages();
  };

  // ── Tickets en espera ──

  const handleHold = () => {
    if (cartItems.length === 0) return;
    const numero = heldTickets.hold(ticket);
    setTicket(emptyTicket());
    setProductSearch('');
    cleanMessages();
    setSuccess(`Ticket ${numero} en espera. Recupéralo desde la barra "En espera".`);
  };

  const handleResumeTicket = (id) => {
    if (cartItems.length > 0) heldTickets.hold(ticket);
    const held = heldTickets.take(id);
    if (held) {
      setTicket({ ...emptyTicket(), ...pickTicketFields(held) });
      setVentaCompletada(null);
      cleanMessages();
    }
  };

  const handleClear = async () => {
    const ok = await confirm({ title: 'Vaciar ticket', message: '¿Quitar todos los productos del ticket actual?', variant: 'warning' });
    if (ok) setTicket(emptyTicket());
  };

  // ── Clientes ──

  const handleCreateLoyaltyClient = async (event) => {
    event.preventDefault();
    cleanMessages();
    try {
      setCreatingClient(true);
      const creado = await apiPost('/api/fidelizacion/clientes', {
        nombre: loyaltyForm.nombre.trim(),
        telefono_whatsapp: loyaltyForm.telefono.replace(/\D/g, ''),
        acepta_datos: loyaltyForm.aceptaDatos,
      });
      data.setClientesFidelizacion((current) => [...current, creado].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')));
      patchTicket({ clienteFidelizacionId: String(creado.id), usarPuntos: false });
      setLoyaltyForm(EMPTY_LOYALTY_FORM);
      setIsLoyaltyModalOpen(false);
      setSuccess(`${creado.nombre} quedó inscrito en el programa de puntos`);
    } catch (err) {
      setError(err.message || 'No se pudo inscribir al cliente');
    } finally {
      setCreatingClient(false);
    }
  };

  const handleCreateStoreClient = async (event) => {
    event.preventDefault();
    cleanMessages();

    const nombre = newClient.nombre.trim();
    const telefono = String(newClient.telefono || '').replace(/\D/g, '');
    if (!nombre) {
      setError('Ingresa el nombre del cliente fiado tienda');
      return;
    }

    try {
      setCreatingClient(true);
      const cuerpo = { nombre, telefono_whatsapp: (telefono.length === 10 ? `57${telefono}` : telefono) || null };
      let creado;
      try {
        creado = await apiPost('/api/clientes/tienda-fiado', cuerpo);
      } catch (err) {
        if (err.status !== 409 || !err.payload?.homonimo) throw err;
        // Mismo nombre que otro cliente: se registra solo si quien atiende confirma que es otra persona.
        const esOtraPersona = await confirm({ title: '¿Es otra persona?', message: `Ya hay un cliente llamado «${err.payload.coincidencias?.[0]?.nombre ?? nombre}». ¿Es otra persona con el mismo nombre?`, variant: 'primary' });
        if (!esOtraPersona) throw new Error('No se guardó: ya existe un cliente con ese nombre.');
        creado = await apiPost('/api/clientes/tienda-fiado', { ...cuerpo, confirmar_homonimo: true });
      }
      data.setClientesTienda((current) => [...current, creado].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')));
      patchTicket({ esFiado: true, clienteTiendaId: String(creado.id) });
      setNewClient({ nombre: '', telefono: '' });
      setIsNewClientOpen(false);
      setSuccess('Cliente fiado tienda creado correctamente');
    } catch (err) {
      setError(err.message || 'No se pudo crear el cliente fiado tienda');
    } finally {
      setCreatingClient(false);
    }
  };

  // ── Atajos ──

  useVentasShortcuts({
    enabled: !isNewClientOpen && !isLoyaltyModalOpen,
    onFocusSearch: () => {
      if (ventaCompletada) handleNewSale();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onHold: () => { if (!ventaCompletada) handleHold(); },
    onCharge: () => {
      if (!ventaCompletada && cartItems.length > 0 && !submittingVenta) void handleSubmitVenta();
    },
    onEscape: () => setProductSearch(''),
  });

  return (
    <div ref={rootRef} className="flex flex-col gap-3 pb-20 lg:pb-0">
      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      {data.cajaAbierta === false ? <CajaGate onOpened={() => data.reload()} /> : (
      <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setHistorialAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" /> Historial de ventas
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_28rem] 2xl:grid-cols-[minmax(0,1fr)_32rem]">
        <div className={`min-h-[30rem] lg:min-h-0 ${ventaCompletada ? 'pointer-events-none opacity-40' : ''}`}>
          <ProductSelectionView
            productos={productosFiltrados}
            searchTerm={productSearch}
            onSearchChange={setProductSearch}
            onAddItem={handleQuickAddProducto}
            onScanCode={handleScanCode}
            cart={cartItems}
            formatMoney={formatMoney}
            loading={data.loading}
            totalCatalogo={data.catalogoTotal}
            searchInputRef={searchInputRef}
            favorites={preferences.favorites}
            onToggleFavorite={preferences.toggleFavorite}
            quickPickProductos={quickPickProductos}
          />
        </div>

        <div id="pos-ticket" className="min-h-[34rem] scroll-mt-24 lg:min-h-0">
          {ventaCompletada ? (
            <SaleReceiptPanel
              receipt={ventaCompletada}
              formatMoney={formatMoney}
              onPrint={() => printHtml(buildReceiptHtml(ventaCompletada, { formatMoney, site: SITE, contacto: CONTACTO }))}
              onNewSale={handleNewSale}
            />
          ) : (
            <CartPanel
              cart={cartItems}
              productosById={productosById}
              totalEstimado={totalEstimado}
              onChangeQty={handleChangeQty}
              onRemoveItem={handleRemoveProducto}
              formatMoney={formatMoney}
              esFiado={ticket.esFiado}
              onSetEsFiado={(esFiado) => patchTicket({ esFiado })}
              montoPago={ticket.montoPago}
              onSetMontoPago={(montoPago) => patchTicket({ montoPago })}
              metodoPago={ticket.metodoPago}
              onSetMetodoPago={(metodoPago) => patchTicket({ metodoPago })}
              cambioContado={cambioContado}
              clientesTiendaFiado={clientesTienda}
              clienteTiendaId={ticket.clienteTiendaId}
              onSetClienteTiendaId={(clienteTiendaId) => patchTicket({ clienteTiendaId })}
              abonoInicialFiado={ticket.abonoInicialFiado}
              onSetAbonoInicialFiado={(abonoInicialFiado) => patchTicket({ abonoInicialFiado })}
              onCrearCliente={(nombre) => {
                cleanMessages();
                if (typeof nombre === 'string' && nombre) setNewClient((current) => ({ ...current, nombre }));
                setIsNewClientOpen(true);
              }}
              onConfirmar={handleSubmitVenta}
              submittingVenta={submittingVenta}
              clientesFidelizacion={clientesFidelizacion}
              clienteFidelizacionId={ticket.clienteFidelizacionId}
              onSetClienteFidelizacionId={(clienteFidelizacionId) => patchTicket({ clienteFidelizacionId, usarPuntos: false })}
              onCreateFidelizacion={() => setIsLoyaltyModalOpen(true)}
              redencion={redencion}
              valorPunto={fidelizacionConfig.valor_punto}
              usarPuntos={ticket.usarPuntos}
              onSetUsarPuntos={(usarPuntos) => patchTicket({ usarPuntos })}
              puntosEstimados={puntosEstimados}
              heldTickets={heldTickets.tickets}
              onHold={handleHold}
              onClear={handleClear}
              onResumeTicket={handleResumeTicket}
              onDiscardTicket={heldTickets.discard}
            />
          )}
        </div>
      </div>

      </>
      )}

      {!ventaCompletada && data.cajaAbierta !== false && (
        <MobileCartBar
          unidades={cartItems.reduce((acc, item) => acc + Number(item.cantidad || 0), 0)}
          total={totalEstimado}
          formatMoney={formatMoney}
          targetId="pos-ticket"
        />
      )}

      <HistorialVentasModal
        isOpen={historialAbierto}
        onClose={() => setHistorialAbierto(false)}
        role={user?.role}
        onPrint={(receipt) => printHtml(buildReceiptHtml(receipt, { formatMoney, site: SITE, contacto: CONTACTO }))}
        onChanged={() => data.reload()}
      />
      <NewLoyaltyClientModal
        isOpen={isLoyaltyModalOpen}
        onClose={() => setIsLoyaltyModalOpen(false)}
        form={loyaltyForm}
        onChange={(patch) => setLoyaltyForm((current) => ({ ...current, ...patch }))}
        onSubmit={handleCreateLoyaltyClient}
        saving={creatingClient}
      />
      <NewClientModal
        isOpen={isNewClientOpen}
        onClose={() => setIsNewClientOpen(false)}
        name={newClient.nombre}
        phone={newClient.telefono}
        onNameChange={(nombre) => setNewClient((current) => ({ ...current, nombre }))}
        onPhoneChange={(telefono) => setNewClient((current) => ({ ...current, telefono }))}
        onSubmit={handleCreateStoreClient}
        saving={creatingClient}
      />
      {ConfirmModal}
    </div>
  );
};

export default Ventas;
