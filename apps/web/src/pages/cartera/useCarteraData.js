import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import useConfirm from '../../components/useConfirm';
import {
  deleteCarteraCliente,
  fetchCarteraInitialData,
  fetchCarteraMovimientos,
  fetchCarteraVentasHistorial,
  saveCarteraAbono,
  saveCarteraCliente,
  saveCarteraProducto,
  saveCarteraVenta,
} from '../../api/carteraApi';

const CLIENTES_PAGE_SIZE = 20;
const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const emptyDashboardResumen = {
  ventas_diarias: 0,
  ventas_semanales: 0,
  ventas_mensuales: 0,
  transacciones_diarias: 0,
  transacciones_semanales: 0,
  transacciones_mensuales: 0,
};

const emptyCarteraResumen = {
  clientes_totales: 0,
  clientes_con_deuda: 0,
  deuda_total: 0,
  limite_total: 0,
  disponible_total: 0,
  clientes_alto_riesgo: 0,
  saldo_promedio: 0,
};

const EMPTY_CLIENT_FORM = {
  nombre: '',
  documento: '',
  telefono_whatsapp: '',
  limite_credito: '',
};

const EMPTY_ITEM = {
  producto_id: '',
  cantidad: 1,
};

const EMPTY_PRODUCT_FORM = {
  nombre: '',
  codigo_barras: '',
  precio_costo: '',
  precio_venta: '',
  stock_actual: '',
};

const toDatetimeLocalValue = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const normalizeWhatsappNumber = (rawValue) => {
  const digits = String(rawValue || '').replace(/\D/g, '');

  if (!digits) return '';

  if (digits.length === 12 && digits.startsWith('57')) {
    return digits;
  }

  if (digits.length === 10) {
    return `57${digits}`;
  }

  if (digits.length === 7) {
    return `57601${digits}`;
  }

  return '';
};

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));
const formatMoneyWhatsapp = (value) => {
  const num = Number(value || 0);
  return `$${Math.round(num).toLocaleString('es-CO', { useGrouping: false, maximumFractionDigits: 0 })}`;
};

export const useCarteraData = () => {
  const { isAuthenticated, bootstrapped } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { confirm, ConfirmModal } = useConfirm();

  const [clientes, setClientes] = useState([]);
  const [clientesCatalogo, setClientesCatalogo] = useState([]);
  const [productosCartera, setProductosCartera] = useState([]);
  const [dashboardVentas, setDashboardVentas] = useState(emptyDashboardResumen);
  const [resumenCartera, setResumenCartera] = useState(emptyCarteraResumen);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);

  const [clienteForm, setClienteForm] = useState(EMPTY_CLIENT_FORM);
  const [savingCliente, setSavingCliente] = useState(false);
  const [editingClienteId, setEditingClienteId] = useState(null);
  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);

  const [ventaClienteId, setVentaClienteId] = useState('');
  const [ventaFecha, setVentaFecha] = useState(toDatetimeLocalValue());
  const [ventaModo, setVentaModo] = useState('fiado');
  const [abonoInicial, setAbonoInicial] = useState('');
  const [pagoRecibido, setPagoRecibido] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [referenciaVenta, setReferenciaVenta] = useState('');
  const [ventaItems, setVentaItems] = useState([{ ...EMPTY_ITEM }]);
  const [savingVenta, setSavingVenta] = useState(false);
  const [ventasHistorial, setVentasHistorial] = useState([]);
  const [loadingVentasHistorial, setLoadingVentasHistorial] = useState(false);
  const [isVentasHistorialOpen, setIsVentasHistorialOpen] = useState(false);

  const [selectedClienteAbono, setSelectedClienteAbono] = useState(null);
  const [selectedClienteDetalle, setSelectedClienteDetalle] = useState(null);
  const [expandedCobroClientes, setExpandedCobroClientes] = useState([]);
  const [productoForm, setProductoForm] = useState(EMPTY_PRODUCT_FORM);
  const [savingProducto, setSavingProducto] = useState(false);
  const [isProductoModalOpen, setIsProductoModalOpen] = useState(false);

  const activeSection = useMemo(() => {
    if (location.pathname.includes('/cartera/clientes')) return 'clientes';
    if (location.pathname.includes('/cartera/venta')) return 'venta';
    if (location.pathname.includes('/cartera/productos')) return 'productos';
    if (location.pathname.includes('/cartera/cobrar')) return 'cobrar';
    return 'dashboard';
  }, [location.pathname]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!bootstrapped) {
      return undefined;
    }

    if (!isAuthenticated) {
      setClientes([]);
      setClientesCatalogo([]);
      setProductosCartera([]);
      setDashboardVentas(emptyDashboardResumen);
      setResumenCartera(emptyCarteraResumen);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        const payload = await fetchCarteraInitialData({
          page: currentPage,
          limit: CLIENTES_PAGE_SIZE,
          search: debouncedSearch,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setClientes(Array.isArray(payload.clientes?.data) ? payload.clientes.data : []);
        setTotalPages(Math.max(1, Number(payload.clientes?.total_pages ?? 1)));
        setClientesCatalogo(Array.isArray(payload.clientesCatalogo) ? payload.clientesCatalogo : []);
        setProductosCartera(Array.isArray(payload.productosCartera) ? payload.productosCartera : []);
        setDashboardVentas(typeof payload.dashboardVentas === 'object' && payload.dashboardVentas ? payload.dashboardVentas : emptyDashboardResumen);
        setResumenCartera(typeof payload.resumenCartera === 'object' && payload.resumenCartera ? payload.resumenCartera : emptyCarteraResumen);
      } catch {
        if (controller.signal.aborted) return;
        setError('No fue posible cargar los clientes');
        setClientes([]);
        setClientesCatalogo([]);
        setProductosCartera([]);
        setDashboardVentas(emptyDashboardResumen);
        setResumenCartera(emptyCarteraResumen);
        setTotalPages(1);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      controller.abort();
    };
  }, [bootstrapped, currentPage, debouncedSearch, isAuthenticated, reloadTick]);

  const productosById = useMemo(
    () => new Map(productosCartera.map((producto) => [Number(producto.id), producto])),
    [productosCartera],
  );

  const totalVentaEstimado = useMemo(
    () => ventaItems.reduce((sum, item) => {
      const producto = productosById.get(Number(item.producto_id));
      if (!producto) return sum;
      return sum + Number(producto.precio_venta || 0) * Number(item.cantidad || 0);
    }, 0),
    [productosById, ventaItems],
  );

  const totalAPagar = Math.max(0, totalVentaEstimado - Number(abonoInicial || 0));
  const cambioContado = ventaModo === 'contado'
    ? Math.max(0, Number(pagoRecibido || 0) - totalVentaEstimado)
    : 0;

  const cleanMessages = () => {
    setError('');
    setSuccess('');
  };

  const refreshPage = () => {
    setReloadTick((current) => current + 1);
  };

  const startEditingCliente = (cliente) => {
    cleanMessages();
    setEditingClienteId(cliente.id);
    setClienteForm({
      nombre: cliente.nombre || '',
      documento: cliente.documento || '',
      telefono_whatsapp: cliente.telefono_whatsapp || '',
      limite_credito: String(cliente.limite_credito || ''),
    });
    setIsClienteModalOpen(true);
  };

  const cancelEditingCliente = () => {
    setEditingClienteId(null);
    setClienteForm(EMPTY_CLIENT_FORM);
    setIsClienteModalOpen(false);
  };

  const startNewCliente = () => {
    cleanMessages();
    setEditingClienteId(null);
    setClienteForm(EMPTY_CLIENT_FORM);
    setIsClienteModalOpen(true);
  };

  const startNewProducto = () => {
    cleanMessages();
    setProductoForm(EMPTY_PRODUCT_FORM);
    setIsProductoModalOpen(true);
  };

  const handleSubmitCliente = async (event) => {
    event.preventDefault();
    cleanMessages();

    const nombre = clienteForm.nombre.trim();
    const limiteCredito = Number(clienteForm.limite_credito);

    if (!nombre) {
      setError('El nombre del cliente es obligatorio');
      return;
    }

    if (!Number.isFinite(limiteCredito) || limiteCredito < 0) {
      setError('El limite de credito no puede ser negativo');
      return;
    }

    const phone = clienteForm.telefono_whatsapp.trim();
    if (phone && !normalizeWhatsappNumber(phone)) {
      setError('El número de WhatsApp debe tener 10 dígitos (ej: 3001234567)');
      return;
    }

    try {
      setSavingCliente(true);
      await saveCarteraCliente({
        clienteId: editingClienteId,
        payload: {
          nombre,
          documento: clienteForm.documento.trim() || null,
          telefono_whatsapp: clienteForm.telefono_whatsapp.trim() || null,
          limite_credito: limiteCredito,
        },
      });

      setSuccess(editingClienteId ? 'Cliente actualizado correctamente' : 'Cliente registrado correctamente');
      cancelEditingCliente();
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible guardar el cliente');
    } finally {
      setSavingCliente(false);
    }
  };

  const handleDeleteCliente = async (cliente) => {
    const confirmed = await confirm({ title: 'Eliminar cliente', message: `¿Eliminar cliente ${cliente.nombre}?` });
    if (!confirmed) return;

    try {
      await deleteCarteraCliente({ clienteId: cliente.id });
      setSuccess('Cliente eliminado correctamente');
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible eliminar el cliente');
    }
  };

  const handleSubmitProducto = async (event) => {
    event.preventDefault();
    cleanMessages();

    const nombre = productoForm.nombre.trim();
    if (!nombre) {
      setError('El nombre del producto es obligatorio');
      return;
    }

    const payload = {
      nombre,
      codigo_barras: productoForm.codigo_barras.trim() || null,
      catalogo: 'cartera',
      precio_costo: Number(productoForm.precio_costo || 0),
      precio_venta: Number(productoForm.precio_venta || 0),
      stock_actual: Number(productoForm.stock_actual || 0),
    };

    if (!Number.isFinite(payload.precio_costo) || payload.precio_costo < 0) {
      setError('El precio de costo no puede ser negativo');
      return;
    }

    if (!Number.isFinite(payload.precio_venta) || payload.precio_venta < 0) {
      setError('El precio de venta no puede ser negativo');
      return;
    }

    if (!Number.isInteger(payload.stock_actual) || payload.stock_actual < 0) {
      setError('El stock inicial no puede ser negativo');
      return;
    }

    try {
      setSavingProducto(true);
      await saveCarteraProducto(payload);
      setSuccess('Producto de cartera registrado correctamente');
      setIsProductoModalOpen(false);
      setProductoForm(EMPTY_PRODUCT_FORM);
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible registrar el producto');
    } finally {
      setSavingProducto(false);
    }
  };

  const handleAbrirWhatsapp = async (cliente) => {
    const telefono = normalizeWhatsappNumber(cliente?.telefono_whatsapp);
    if (!telefono) {
      setError('Este cliente no tiene un WhatsApp válido');
      return;
    }

    const deuda = Number(cliente?.deuda_total || 0);
    const nombre = String(cliente?.nombre || '').trim();

    let productosRegistrados = '';
    let totalOriginal = 0;
    try {
      const movimientos = await fetchCarteraMovimientos({ clienteId: cliente.id, page: 1, limit: 20 });
      const ventas = (movimientos?.data || []).filter((m) => m.tipo === 'Venta');
      if (ventas.length > 0) {
        totalOriginal = ventas.reduce((sum, v) => sum + Number(v.monto || 0), 0);
        productosRegistrados = ventas
          .filter((v) => v.articulo)
          .slice(0, 5)
          .map((v) => `- ${v.articulo} ($${Math.round(Number(v.monto)).toLocaleString('es-CO', { useGrouping: false, maximumFractionDigits: 0 })})`)
          .join('\n');
      }
    } catch {
      // si falla la consulta, solo omitimos el detalle
    }

    const totalAbonado = Math.max(0, totalOriginal - deuda);

    const lineas = [];
    lineas.push(`Hola ${nombre}, un saludo de Tienda Angelly.`);
    lineas.push('');

    if (productosRegistrados) {
      lineas.push('Productos registrados:');
      lineas.push(productosRegistrados);
      lineas.push('');
      lineas.push(`Total original: ${formatMoneyWhatsapp(totalOriginal)}`);
      if (totalAbonado > 0) {
        lineas.push(`Abonado: ${formatMoneyWhatsapp(totalAbonado)}`);
      }
      lineas.push(`Pendiente: ${formatMoneyWhatsapp(deuda)}`);
    } else {
      lineas.push(`Tu saldo pendiente es de ${formatMoneyWhatsapp(deuda)}.`);
    }

    lineas.push('');
    lineas.push('Formas de pago:');
    if (import.meta.env.VITE_COBRO_NUMERO_CUENTA) {
      lineas.push(`- Transferencia: ${import.meta.env.VITE_COBRO_BANCO} ${import.meta.env.VITE_COBRO_TIPO_CUENTA} ${import.meta.env.VITE_COBRO_NUMERO_CUENTA}`);
    }
    if (import.meta.env.VITE_COBRO_NEQUI_NUMERO) {
      lineas.push(`- Nequi: ${import.meta.env.VITE_COBRO_NEQUI_NUMERO}`);
    }
    lineas.push('');
    lineas.push('Comparte el comprobante para aplicar el abono. Gracias!');

    const mensaje = encodeURIComponent(lineas.join('\n'));
    window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
  };

  const handleRegistrarAbono = (cliente) => {
    cleanMessages();
    setSelectedClienteAbono(cliente);
  };

  const handleConfirmAbono = async (monto, metodoPagoAbono = 'efectivo') => {
    if (!selectedClienteAbono) return;

    try {
      setSavingCliente(true);
      await saveCarteraAbono({
        clienteId: selectedClienteAbono.id,
        payload: {
          monto,
          metodo_pago: metodoPagoAbono,
        },
      });

      setSuccess('Abono registrado correctamente');
      setSelectedClienteAbono(null);
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible registrar el abono');
    } finally {
      setSavingCliente(false);
    }
  };

  const handleAddProductoVenta = (producto) => {
    setVentaItems((current) => {
      const existingIndex = current.findIndex((item) => Number(item.producto_id) === Number(producto.id));

      if (existingIndex >= 0) {
        return current.map((item, index) => (
          index === existingIndex
            ? { ...item, cantidad: Number(item.cantidad || 0) + 1 }
            : item
        ));
      }

      return [...current, { producto_id: String(producto.id), cantidad: 1 }];
    });
  };

  const handleRemoveVentaItem = (index) => {
    setVentaItems((current) => {
      if (current.length === 1) return [{ ...EMPTY_ITEM }];
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const handleChangeVentaItem = (index, key, value) => {
    setVentaItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? {
            ...item,
            [key]: value,
          }
        : item
    )));
  };

  const handleSubmitVentaCartera = async (event) => {
    event.preventDefault();
    cleanMessages();

    if (!ventaClienteId) {
      setError('Selecciona un cliente para registrar la venta');
      return;
    }

    const itemsNormalizados = ventaItems
      .map((item) => ({
        producto_id: Number(item.producto_id),
        cantidad: Number(item.cantidad),
      }))
      .filter((item) => Number.isInteger(item.producto_id) && item.producto_id > 0 && Number.isInteger(item.cantidad) && item.cantidad > 0);

    if (itemsNormalizados.length === 0) {
      setError('Debes agregar al menos un articulo con cantidad valida');
      return;
    }

    const abono = ventaModo === 'contado'
      ? totalVentaEstimado
      : Number(String(abonoInicial).trim() === '' ? 0 : abonoInicial);

    if (ventaModo === 'contado') {
      const pago = Number(pagoRecibido || 0);
      if (!Number.isFinite(pago) || pago < totalVentaEstimado) {
        setError('En contado debes registrar un valor recibido igual o superior al total');
        return;
      }
    } else if (!Number.isFinite(abono) || abono < 0) {
      setError('El abono inicial debe ser un valor valido');
      return;
    }

    try {
      setSavingVenta(true);

      const responsePayload = await saveCarteraVenta({
        cliente_id: Number(ventaClienteId),
        fecha_venta: ventaFecha ? new Date(ventaFecha).toISOString() : new Date().toISOString(),
        referencia: referenciaVenta.trim() || null,
        metodo_pago: metodoPago,
        abono_inicial: ventaModo === 'contado'
          ? totalVentaEstimado
          : Number(String(abonoInicial).trim() === '' ? 0 : abonoInicial),
        items: itemsNormalizados,
      });

      setSuccess(responsePayload.resumen_recibo || 'Venta de cartera registrada correctamente');
      setVentaItems([{ ...EMPTY_ITEM }]);
      setVentaClienteId('');
      setVentaFecha(new Date().toISOString().slice(0, 16));
      setAbonoInicial('');
      setPagoRecibido('');
      setMetodoPago('efectivo');
      setReferenciaVenta('');
      setVentaModo('fiado');
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible registrar la venta de cartera');
    } finally {
      setSavingVenta(false);
    }
  };

  const clientesConDeuda = useMemo(
    () => clientesCatalogo.filter((cliente) => Number(cliente.deuda_total || 0) > 0),
    [clientesCatalogo],
  );

  const clientesRanking = useMemo(
    () => [...clientesConDeuda]
      .sort((a, b) => Number(b.deuda_total || 0) - Number(a.deuda_total || 0))
      .slice(0, 8),
    [clientesConDeuda],
  );

  const clientesMasCompras = useMemo(
    () => [...clientesCatalogo]
      .sort((a, b) => {
        const comprasB = Number(b.compras_cantidad || 0);
        const comprasA = Number(a.compras_cantidad || 0);
        if (comprasB !== comprasA) return comprasB - comprasA;
        return Number(b.compras_total || 0) - Number(a.compras_total || 0);
      })
      .filter((cliente) => Number(cliente.compras_cantidad || 0) > 0)
      .slice(0, 6),
    [clientesCatalogo],
  );

  const clientesAccesoRapido = useMemo(
    () => [...clientesConDeuda]
      .sort((a, b) => Number(b.deuda_total || 0) - Number(a.deuda_total || 0)),
    [clientesConDeuda],
  );

  const clientesCarteraFiltrados = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return clientesCatalogo;

    return clientesCatalogo.filter((cliente) => (
      [cliente.nombre, cliente.documento, cliente.telefono_whatsapp]
        .some((value) => String(value || '').toLowerCase().includes(query))
    ));
  }, [clientesCatalogo, searchTerm]);

  const toggleCobroCliente = (clienteId) => {
    setExpandedCobroClientes((current) => (
      current.includes(clienteId)
        ? current.filter((id) => id !== clienteId)
        : [...current, clienteId]
    ));
  };

  const handleVerDetalle = (cliente) => {
    cleanMessages();
    setSelectedClienteDetalle(cliente);
  };

  const handleOpenVentasHistorial = async () => {
    cleanMessages();

    try {
      setLoadingVentasHistorial(true);
      setIsVentasHistorialOpen(true);

      const responsePayload = await fetchCarteraVentasHistorial({ limit: 80 });
      setVentasHistorial(Array.isArray(responsePayload) ? responsePayload : []);
    } catch (err) {
      setError(err.message || 'No fue posible cargar el historial de ventas');
      setVentasHistorial([]);
      setIsVentasHistorialOpen(false);
    } finally {
      setLoadingVentasHistorial(false);
    }
  };

  return {
    clientes,
    clientesCatalogo,
    productosCartera,
    dashboardVentas,
    resumenCartera,
    loading,
    error,
    success,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    currentPage,
    setCurrentPage,
    totalPages,
    clienteForm,
    setClienteForm,
    savingCliente,
    editingClienteId,
    isClienteModalOpen,
    setIsClienteModalOpen,
    ventaClienteId,
    setVentaClienteId,
    ventaFecha,
    setVentaFecha,
    ventaModo,
    setVentaModo,
    abonoInicial,
    setAbonoInicial,
    pagoRecibido,
    setPagoRecibido,
    metodoPago,
    setMetodoPago,
    referenciaVenta,
    setReferenciaVenta,
    ventaItems,
    setVentaItems,
    savingVenta,
    ventasHistorial,
    loadingVentasHistorial,
    isVentasHistorialOpen,
    setIsVentasHistorialOpen,
    selectedClienteAbono,
    setSelectedClienteAbono,
    selectedClienteDetalle,
    setSelectedClienteDetalle,
    expandedCobroClientes,
    setExpandedCobroClientes,
    productoForm,
    setProductoForm,
    savingProducto,
    isProductoModalOpen,
    setIsProductoModalOpen,
    activeSection,
    productosById,
    totalVentaEstimado,
    totalAPagar,
    cambioContado,
    clientesConDeuda,
    clientesRanking,
    clientesMasCompras,
    clientesAccesoRapido,
    clientesCarteraFiltrados,
    cleanMessages,
    refreshPage,
    startEditingCliente,
    cancelEditingCliente,
    startNewCliente,
    startNewProducto,
    handleSubmitCliente,
    handleDeleteCliente,
    handleSubmitProducto,
    handleAbrirWhatsapp,
    handleRegistrarAbono,
    handleConfirmAbono,
    handleAddProductoVenta,
    handleRemoveVentaItem,
    handleChangeVentaItem,
    handleSubmitVentaCartera,
    toggleCobroCliente,
    handleVerDetalle,
    handleOpenVentasHistorial,
    navigate,
    formatMoney,
    formatMoneyWhatsapp,
    toDatetimeLocalValue,
    normalizeWhatsappNumber,
    ConfirmModal,
  };
};

export {
  formatMoney,
  formatMoneyWhatsapp,
  toDatetimeLocalValue,
  normalizeWhatsappNumber,
  EMPTY_CLIENT_FORM,
  EMPTY_ITEM,
  EMPTY_PRODUCT_FORM,
  emptyDashboardResumen,
  emptyCarteraResumen,
};
