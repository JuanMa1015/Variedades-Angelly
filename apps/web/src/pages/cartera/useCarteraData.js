import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { construirMensajeCobro } from './mensajeCobro';
import { reactivarClienteCartera } from '../../api/carteraClientesApi';
import useConfirm from '../../components/useConfirm';
import {
  deleteCarteraCliente,
  fetchCarteraInitialData,
  fetchEstadoCuenta,
  saveCarteraCliente,
  saveCarteraVenta,
} from '../../api/carteraApi';

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const EMPTY_CLIENT_FORM = {
  nombre: '',
  documento: '',
  telefono_whatsapp: '',
};

const EMPTY_ITEM = {
  producto_id: '',
  cantidad: 1,
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
  return `$${Math.round(num).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
};

export const useCarteraData = () => {
  const { isAuthenticated, bootstrapped } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { confirm, ConfirmModal } = useConfirm();

  const [clientesCatalogo, setClientesCatalogo] = useState([]);
  const [productosCartera, setProductosCartera] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
  const [isVentasHistorialOpen, setIsVentasHistorialOpen] = useState(false);

  const [selectedClienteAbono, setSelectedClienteAbono] = useState(null);
  const [selectedClienteDetalle, setSelectedClienteDetalle] = useState(null);

  const activeSection = useMemo(() => {
    if (location.pathname.includes('/cartera/clientes')) return 'clientes';
    if (location.pathname.includes('/cartera/venta')) return 'venta';
    if (location.pathname.includes('/cartera/productos')) return 'productos';
    if (location.pathname.includes('/cartera/cobrar')) return 'cobrar';
    return 'dashboard';
  }, [location.pathname]);

  useEffect(() => {
    if (!bootstrapped) {
      return undefined;
    }

    if (!isAuthenticated) {
      setClientesCatalogo([]);
      setProductosCartera([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        const payload = await fetchCarteraInitialData({ signal: controller.signal });

        if (controller.signal.aborted) return;

        setClientesCatalogo(Array.isArray(payload.clientesCatalogo) ? payload.clientesCatalogo : []);
        setProductosCartera(Array.isArray(payload.productosCartera) ? payload.productosCartera : []);
      } catch {
        if (controller.signal.aborted) return;
        setError('No fue posible cargar los clientes y productos');
        setClientesCatalogo([]);
        setProductosCartera([]);
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
  }, [bootstrapped, isAuthenticated, reloadTick]);

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

  const handleSubmitCliente = async (event) => {
    event.preventDefault();
    cleanMessages();

    const nombre = clienteForm.nombre.trim();

    if (!nombre) {
      setError('El nombre del cliente es obligatorio');
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
    const confirmed = await confirm({
      title: 'Desactivar cliente',
      confirmLabel: 'Desactivar',
      message: `¿Desactivar a ${cliente.nombre}? Conserva su historial y podrás reactivarlo en «Desactivados». Solo se puede si no tiene deuda.`,
    });
    if (!confirmed) return;

    try {
      cleanMessages();
      await deleteCarteraCliente({ clienteId: cliente.id });
      setSuccess(`${cliente.nombre} desactivado`);
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible desactivar el cliente');
    }
  };

  const handleReactivarCliente = async (cliente) => {
    try {
      cleanMessages();
      await reactivarClienteCartera(cliente.id);
      setSuccess(`${cliente.nombre} reactivado`);
      refreshPage();
    } catch (err) {
      setError(err.message || 'No fue posible reactivar el cliente');
    }
  };

  const handleAbrirWhatsapp = async (cliente) => {
    const telefono = normalizeWhatsappNumber(cliente?.telefono_whatsapp);
    if (!telefono) {
      setError('Este cliente no tiene un WhatsApp válido');
      return;
    }

    let estado;
    try {
      estado = await fetchEstadoCuenta({ clienteId: cliente.id });
    } catch (err) {
      // Sin cifras reales no se envia nada: un monto equivocado le llegaria al cliente.
      setError(err.message || 'No fue posible preparar el mensaje de cobro');
      return;
    }

    const formasDePago = [];
    if (import.meta.env.VITE_COBRO_NUMERO_CUENTA) {
      formasDePago.push(`Transferencia: ${import.meta.env.VITE_COBRO_BANCO} ${import.meta.env.VITE_COBRO_TIPO_CUENTA} ${import.meta.env.VITE_COBRO_NUMERO_CUENTA}`);
    }
    if (import.meta.env.VITE_COBRO_NEQUI_NUMERO) {
      formasDePago.push(`Nequi: ${import.meta.env.VITE_COBRO_NEQUI_NUMERO}`);
    }

    const mensaje = encodeURIComponent(construirMensajeCobro(estado, formasDePago));
    window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
  };

  const handleRegistrarAbono = (cliente) => {
    cleanMessages();
    setSelectedClienteAbono(cliente);
  };

  // El cuadro de abono ya guardo el abono y muestra su propio resultado: aqui solo se avisa y se recarga.
  const handleAbonoRegistrado = async (abono) => {
    setError('');
    setSuccess(`Abono de ${formatMoney(abono.monto)} registrado`);
    refreshPage();
  };

  // Nunca se agrega mas de lo que hay en stock: el servidor lo rechazaria al registrar la venta.
  const handleAddProductoVenta = (producto) => {
    const stock = Number(producto.stock_actual ?? Infinity);
    const enVenta = Number(ventaItems.find((item) => Number(item.producto_id) === Number(producto.id))?.cantidad || 0);
    if (enVenta + 1 > stock) {
      setError(stock <= 0 ? `${producto.nombre} no tiene stock` : `Solo hay ${stock} de ${producto.nombre}`);
      return;
    }
    setError('');
    setVentaItems((current) => {
      const existingIndex = current.findIndex((item) => Number(item.producto_id) === Number(producto.id));

      if (existingIndex >= 0) {
        return current.map((item, index) => (
          index === existingIndex
            ? { ...item, cantidad: Number(item.cantidad || 0) + 1 }
            : item
        ));
      }

      return [...current.filter((item) => Number(item.producto_id) > 0), { producto_id: String(producto.id), cantidad: 1 }];
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

  const handleVerDetalle = (cliente) => {
    cleanMessages();
    setSelectedClienteDetalle(cliente);
  };

  const handleOpenVentasHistorial = () => {
    cleanMessages();
    setIsVentasHistorialOpen(true);
  };

  return {
    clientesCatalogo,
    productosCartera,
    loading,
    error,
    success,
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
    isVentasHistorialOpen,
    setIsVentasHistorialOpen,
    selectedClienteAbono,
    setSelectedClienteAbono,
    selectedClienteDetalle,
    setSelectedClienteDetalle,
    activeSection,
    productosById,
    totalVentaEstimado,
    totalAPagar,
    cambioContado,
    cleanMessages,
    setSuccess,
    refreshPage,
    startEditingCliente,
    cancelEditingCliente,
    startNewCliente,
    handleSubmitCliente,
    handleDeleteCliente,
    handleReactivarCliente,
    reloadTick,
    handleAbrirWhatsapp,
    handleRegistrarAbono,
    handleAbonoRegistrado,
    handleAddProductoVenta,
    handleRemoveVentaItem,
    handleChangeVentaItem,
    handleSubmitVentaCartera,
    handleVerDetalle,
    handleOpenVentasHistorial,
    navigate,
    formatMoney,
    formatMoneyWhatsapp,
    toDatetimeLocalValue,
    normalizeWhatsappNumber,
    confirm,
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
};
