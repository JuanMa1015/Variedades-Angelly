import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../api/httpClient';
import { fetchCajaEstado } from '../api/cajaApi';
import ErrorMessage from '../components/ErrorMessage'
import SuccessMessage from '../components/SuccessMessage'
import Skeleton from '../components/Skeleton'
import PaginationControls from '../components/PaginationControls';
import SelectBuscable from '../components/SelectBuscable';
import useConfirm from '../components/useConfirm';
import { formatDateTime, formatMoney, parseApiDate } from '../utils/format';
import CrearProductoModal from './Inventario/CrearProductoModal';
import FacturasLista from './Facturas/FacturasLista';
import { MEDIOS_PAGO, TEXTO_PAGO } from './Facturas/facturasHelpers';
import ProductoBuscador from './Facturas/ProductoBuscador';
import { useFacturas } from './Facturas/useFacturas';
import MoneyInput from './Ventas/MoneyInput';

const EMPTY_ITEM = {
  producto_id: '',
  cantidad: 1,
  aplica_iva: false,
  precio_unitario: '',
  actualizar_precio: true,
  precio_venta: '',
  search: '',
};

// Igual que el backend: el precio sugerido sube al siguiente multiplo de $50.
const PASO_REDONDEO_PRECIO = 50;
const redondearPrecioVenta = (valor) => Math.ceil(Math.round(valor * 1e6) / 1e6 / PASO_REDONDEO_PRECIO) * PASO_REDONDEO_PRECIO;

const PORCENTAJE_DEFAULT = 0.70;
const ETIQUETA = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';
const CAMPO = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const NUMERO_MINIMO = 3;

const DRAFT_KEY = 'angelly.factura.draft';

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
};

const saveDraft = (data) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* noop */ }
};

const clearDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
};

const Facturas = () => {
  const { token, user } = useAuth();
  const { confirm, ConfirmModal } = useConfirm();
  const historial = useFacturas(token);
  // Un administrador respalda la anulacion; quien no lo es debe pedir la clave de uno.
  const pideAutorizacion = !(user?.role === 'admin' || user?.role === 'superadmin');

  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);

  const [proveedorId, setProveedorId] = useState('');
  const [medioPago, setMedioPago] = useState('');
  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [anulandoId, setAnulandoId] = useState(null);
  const [savingAnulacion, setSavingAnulacion] = useState(false);
  const [errorAnulacion, setErrorAnulacion] = useState('');
  // Pedidos a este proveedor que siguen pendientes: la factura puede cumplir uno (queda recibido).
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [pedidoId, setPedidoId] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [encomienda, setEncomienda] = useState('');
  // El usuario piensa en "margen" (30 % sobre el precio de venta); la API guarda el
  // factor costo/venta (0.70). Se convierte aqui para no confundir 70 % con ganancia.
  const [margenPct, setMargenPct] = useState(String(Math.round((1 - PORCENTAJE_DEFAULT) * 100)));
  const [ivaRate, setIvaRate] = useState(0.19);
  const margenNum = Number(margenPct);
  const margenValido = Number.isFinite(margenNum) && margenNum >= 5 && margenNum <= 95;
  const porcentajeGanancia = String(margenValido ? Number((1 - margenNum / 100).toFixed(4)) : PORCENTAJE_DEFAULT);
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPrintFactura, setSelectedPrintFactura] = useState(null);

  const [creandoProducto, setCreandoProducto] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    // Para avisar si una compra en efectivo no se puede registrar; si falla, el servidor decide.
    fetchCajaEstado({ signal: controller.signal })
      .then((estado) => { if (!controller.signal.aborted) setCajaAbierta(typeof estado?.abierta === 'boolean' ? estado.abierta : null); })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!token || !proveedorId) return undefined;
    const controller = new AbortController();
    apiGet(`/api/proveedores/pedidos/paginados?estado=enviado&limit=50&proveedor_id=${proveedorId}`, { signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted) setPedidosPendientes(Array.isArray(payload?.data) ? payload.data : []); })
      .catch(() => { if (!controller.signal.aborted) setPedidosPendientes([]); });
    return () => controller.abort();
  }, [token, proveedorId]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const [proveedoresPayload, productosPayload] = await Promise.all([
          apiGet('/api/proveedores', { signal: controller.signal }),
          apiGet('/api/productos?catalogo=tienda', { signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;

        const proveedoresList = Array.isArray(proveedoresPayload) ? proveedoresPayload : [];
        setProveedores(proveedoresList);
        // La tasa de IVA la define el backend (IVA_RATE); si falla se conserva 19 %.
        apiGet('/api/facturas-compra/config', { signal: controller.signal })
          .then((cfg) => { if (Number(cfg?.iva_rate) >= 0) setIvaRate(Number(cfg.iva_rate)); })
          .catch(() => {});

        setProductos(Array.isArray(productosPayload) ? productosPayload : []);

        // Restore draft
        const draft = loadDraft();
        if (draft) {
          if (draft.proveedorId) setProveedorId(draft.proveedorId);
          if (draft.medioPago) setMedioPago(draft.medioPago);
          if (draft.numeroFactura !== undefined) setNumeroFactura(draft.numeroFactura);
          if (draft.encomienda !== undefined) setEncomienda(draft.encomienda);
          if (draft.porcentajeGanancia) {
            const factor = Number(draft.porcentajeGanancia);
            if (factor > 0 && factor < 1) setMargenPct(String(Math.round((1 - factor) * 100)));
          }
          if (Array.isArray(draft.items) && draft.items.length > 0) {
            setItems(draft.items.map((item) => ({ ...EMPTY_ITEM, ...item, search: '' })));
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || 'No se pudo cargar facturas');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadData();
    return () => controller.abort();
  }, [token]);

  // Auto-save draft to localStorage (and on unmount)
  useEffect(() => {
    const cleanItems = items;
    saveDraft({ proveedorId, medioPago, numeroFactura, encomienda, porcentajeGanancia, items: cleanItems });
    return () => {
      saveDraft({ proveedorId, medioPago, numeroFactura, encomienda, porcentajeGanancia, items: cleanItems });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId, medioPago, encomienda, porcentajeGanancia, items]);

  const opcionesProveedor = useMemo(() => proveedores.map((p) => ({ valor: String(p.id), etiqueta: p.nombre })), [proveedores]);

  const productosById = useMemo(
    () => new Map(productos.map((item) => [Number(item.id), item])),
    [productos],
  );

  const pct = Number(porcentajeGanancia) || PORCENTAJE_DEFAULT;

  const resumen = useMemo(() => {
    let subtotal = 0;
    let totalIva = 0;
    let totalGanancia = 0;

    for (const item of items) {
      const cantidad = Number(item.cantidad || 0);
      const precio = Number(item.precio_unitario || 0);
      if (cantidad <= 0 || precio <= 0) continue;
      const base = cantidad * precio;
      subtotal += base;
      if (item.aplica_iva) totalIva += base * ivaRate;
      const precioConIva = precio * (item.aplica_iva ? 1 + ivaRate : 1);
      const pvs = redondearPrecioVenta(precioConIva / pct);
      totalGanancia += (pvs - precioConIva) * cantidad;
    }

    const enf = Number(encomienda) || 0;

    return {
      subtotal,
      totalIva,
      totalFactura: subtotal + totalIva - enf,
      encomienda: enf,
      totalGanancia,
    };
  }, [items, encomienda, pct, ivaRate]);

  const handleAddItem = () => setItems((current) => [...current, { ...EMPTY_ITEM }]);

  const handleRemoveItem = (index) => {
    setItems((current) => {
      if (current.length === 1) return [{ ...EMPTY_ITEM }];
      return current.filter((_, row) => row !== index);
    });
  };

  const handleItemChange = (index, key, value) => {
    // Strip leading zeros from numeric inputs
    if (key === 'cantidad' || key === 'precio_unitario') {
      if (typeof value === 'string' && value.length > 1 && value.startsWith('0') && !value.startsWith('0.')) {
        value = String(Number(value));
      }
    }
    setItems((current) => current.map((item, row) => (
      row === index
        ? { ...item, [key]: value }
        : item
    )));
  };

  const handleSelectProducto = (index, productoId) => {
    const producto = productosById.get(Number(productoId));
    handleItemChange(index, 'producto_id', productoId);
    if (producto) {
      // El costo guardado incluye IVA cuando aplico: aqui se pide el precio de factura sin IVA.
      const costo = Number(producto.precio_costo || 0);
      const sinIva = items[index]?.aplica_iva ? costo / (1 + ivaRate) : costo;
      handleItemChange(index, 'precio_unitario', String(Math.round(sinIva * 100) / 100));
    }
  };

  const handleCreateFactura = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const proveedor = Number(proveedorId);
    if (!Number.isInteger(proveedor) || proveedor <= 0) {
      setError('Selecciona un proveedor');
      return;
    }

    if (!medioPago) {
      setError('Elige cómo se pagó la compra');
      return;
    }
    if (medioPago === 'efectivo' && cajaAbierta === false) {
      setError('La caja está cerrada: ábrela para registrar una compra en efectivo, o elige otro medio de pago');
      return;
    }
    const numero = numeroFactura.trim();
    if (numero && numero.length < NUMERO_MINIMO) {
      setError(`El número de factura debe tener al menos ${NUMERO_MINIMO} caracteres (o déjalo vacío)`);
      return;
    }

    const lineas = items
      .map((item) => {
        const precioConIva = Number(item.precio_unitario) * (item.aplica_iva ? 1 + ivaRate : 1);
        const nuevoPrecio = item.precio_venta !== '' ? Number(item.precio_venta) : redondearPrecioVenta(precioConIva / pct);
        return {
          producto_id: Number(item.producto_id),
          cantidad: Number(item.cantidad),
          aplica_iva: Boolean(item.aplica_iva),
          precio_unitario: Number(item.precio_unitario),
          actualizar_precio: Boolean(item.actualizar_precio),
          ...(item.actualizar_precio && Number(item.precio_venta) > 0 ? { precio_venta: Number(item.precio_venta) } : {}),
          _bajoCosto: Boolean(item.actualizar_precio) && nuevoPrecio < precioConIva,
        };
      })
      .filter((item) => Number.isInteger(item.producto_id) && item.producto_id > 0 && Number.isFinite(item.cantidad) && item.cantidad > 0 && Number.isFinite(item.precio_unitario) && item.precio_unitario > 0);

    if (lineas.length === 0) {
      setError('Agrega al menos un producto válido');
      return;
    }

    const nombreProveedor = proveedores.find((p) => p.id === proveedor)?.nombre ?? 'el proveedor';
    const ok = await confirm({
      title: 'Guardar factura',
      message: `Factura de ${nombreProveedor} por ${formatMoney(resumen.totalFactura)}, pagada ${TEXTO_PAGO[medioPago]}. Sumará ${lineas.length} producto${lineas.length === 1 ? '' : 's'} al inventario y cambiará su costo.`,
      variant: 'primary',
    });
    if (!ok) return;

    const bajoCosto = lineas.filter((item) => item._bajoCosto).map((item) => productosById.get(item.producto_id)?.nombre ?? `Producto ${item.producto_id}`);
    if (bajoCosto.length > 0) {
      const sigue = await confirm({
        title: 'Precio por debajo del costo',
        message: `El precio de venta nuevo queda por debajo del costo en: ${bajoCosto.join(', ')}. Venderás con pérdida. ¿Registrar así?`,
      });
      if (!sigue) return;
    }
    const itemsPayload = lineas.map(({ _bajoCosto, ...item }) => (_bajoCosto ? { ...item, permitir_bajo_costo: true } : item));

    try {
      setSaving(true);
      const payload = await apiPost('/api/facturas-compra', {
        proveedor_id: proveedor,
        items: itemsPayload,
        encomienda: Number(encomienda) || 0,
        porcentaje_ganancia: Number(porcentajeGanancia) || PORCENTAJE_DEFAULT,
        numero_factura: numero || null,
        medio_pago: medioPago,
        ...(pedidoId ? { pedido_id: Number(pedidoId) } : {}),
      });

      await historial.reload({ silent: true });
      if (pedidoId) setPedidosPendientes((current) => current.filter((pedido) => String(pedido.id) !== pedidoId));
      setPedidoId('');
      setItems([{ ...EMPTY_ITEM }]);
      setEncomienda('');
      setNumeroFactura('');
      setMedioPago('');
      clearDraft();
      if (medioPago === 'efectivo') setCajaAbierta(true);
      setSuccess(`Factura #${payload.id} registrada correctamente${pedidoId ? ` y pedido #${pedidoId} marcado como recibido` : ''}`);
    } catch (err) {
      setError(err.message || 'No se pudo registrar la factura');
    } finally {
      setSaving(false);
    }
  };

  // El producto recien creado entra a la primera linea vacia (o a una nueva) con stock 0: la factura es la que suma las unidades.
  const handleProductoCreado = async (mensaje, producto) => {
    setCreandoProducto(false);
    setSuccess(`Producto "${producto.nombre}" creado: ya está en la factura`);
    setProductos((actual) => [...actual, producto]);
    setItems((actual) => {
      const vacio = actual.findIndex((item) => !item.producto_id);
      const nueva = { ...EMPTY_ITEM, producto_id: String(producto.id), precio_unitario: producto.precio_costo > 0 ? String(producto.precio_costo) : '' };
      if (vacio === -1) return [...actual, nueva];
      return actual.map((item, indice) => (indice === vacio ? { ...item, ...nueva } : item));
    });
  };

  const handleToggleAnular = (id) => {
    setErrorAnulacion('');
    setAnulandoId((actual) => (actual === id ? null : id));
  };

  const handleAnular = async (factura, datos) => {
    setSavingAnulacion(true);
    setErrorAnulacion('');
    try {
      await apiPost(`/api/facturas-compra/${factura.id}/anular`, {
        motivo: datos.motivo,
        autorizador_usuario: datos.autorizadorUsuario || null,
        autorizador_password: datos.autorizadorPassword || null,
      });
      await historial.reload({ silent: true });
      setAnulandoId(null);
      setSuccess(`Factura #${factura.id} anulada: se devolvió el stock. El costo y el precio de venta que dejó no se restauran: revísalos en Inventario.`);
    } catch (err) {
      setErrorAnulacion(err.message || 'No fue posible anular la factura');
    } finally {
      setSavingAnulacion(false);
    }
  };

  const handlePrintFactura = (factura) => {
    setSelectedPrintFactura(factura);
    setTimeout(() => {
      window.print();
      setSelectedPrintFactura(null);
    }, 100);
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media screen { .print-ticket { display: none; } }
        @media print {
          @page { size: auto; margin: 5mm; }
          body * { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          .print-ticket, .print-ticket * { visibility: visible !important; height: auto !important; overflow: visible !important; }
          .print-ticket { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; display: block !important; padding: 5mm 8mm !important; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Facturas de compra</h1>
          <p className="text-gray-600">Registra facturas, calcula precios de venta y ganancias</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Añadir factura</h2>

        <form className="space-y-4" onSubmit={handleCreateFactura}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <div>
              <label htmlFor="factura-proveedor" className={ETIQUETA}>Proveedor</label>
              <SelectBuscable
                id="factura-proveedor"
                value={proveedorId}
                onChange={(valor) => { setProveedorId(valor); setPedidoId(''); setPedidosPendientes([]); }}
                opciones={opcionesProveedor}
                placeholder="Selecciona proveedor"
              />
            </div>

            <div>
              <label htmlFor="factura-medio" className={ETIQUETA}>Pagado con</label>
              <select id="factura-medio" value={medioPago} onChange={(event) => setMedioPago(event.target.value)} className={CAMPO}>
                <option value="">¿Cómo se pagó?</option>
                {MEDIOS_PAGO.map(({ id, etiqueta }) => <option key={id} value={id}>{etiqueta}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="factura-numero" className={ETIQUETA}>No. factura</label>
              <input id="factura-numero" type="text" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} className={CAMPO} placeholder="FEV-36965" maxLength={20} />
            </div>

            <div>
              <label htmlFor="factura-margen" className={ETIQUETA} title="Porcentaje del precio de venta que es ganancia. Precio de venta = costo ÷ (1 − margen)">Margen sobre la venta (%)</label>
              <input id="factura-margen" type="number" min="5" max="95" step="1" value={margenPct} onChange={(e) => setMargenPct(e.target.value)} className={CAMPO} placeholder="30" />
            </div>

            <div>
              <label htmlFor="factura-encomienda" className={ETIQUETA} title="Se resta del total de la factura">Encomienda (−)</label>
              <MoneyInput id="factura-encomienda" label="Encomienda" value={encomienda} onChange={setEncomienda} placeholder="0" />
            </div>
          </div>

          {medioPago === 'efectivo' && cajaAbierta === false && (
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">La caja está cerrada: ábrela para registrar una compra en efectivo, o elige otro medio de pago.</p>
          )}
          {medioPago === 'efectivo' && cajaAbierta !== false && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Sale del cajón: el total de la factura se descuenta del efectivo del turno abierto.</p>
          )}

          {pedidosPendientes.length > 0 && (
            <div>
              <label htmlFor="factura-pedido" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">¿Esta factura cumple un pedido?</label>
              <select
                id="factura-pedido"
                value={pedidoId}
                onChange={(event) => setPedidoId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              >
                <option value="">No, es una compra sin pedido</option>
                {pedidosPendientes.map((pedido) => (
                  <option key={pedido.id} value={pedido.id}>
                    {`Pedido #${pedido.id} · ${formatDateTime(pedido.fecha_creacion)} · ${formatMoney(pedido.monto_estimado)}`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Al guardar, el pedido queda como recibido y enlazado a esta factura.</p>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item, index) => {
              const cantidad = Number(item.cantidad || 0);
              const precio = Number(item.precio_unitario || 0);
              const base = cantidad * precio;
              const iva = item.aplica_iva ? base * ivaRate : 0;
              const total = base + iva;
              const precioConIva = precio * (item.aplica_iva ? 1 + ivaRate : 1);
              const pvs = redondearPrecioVenta(precioConIva / pct);
              const precioVentaFinal = item.precio_venta !== '' ? Number(item.precio_venta) : pvs;
              const ganancia = pvs - precioConIva;

              return (
                <div key={`factura-item-${index}`} className="rounded-xl border border-gray-200 p-3 space-y-2">
                  {/* Inputs row */}
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.5fr_90px_80px_130px]">
                    <div className="col-span-2 md:col-span-1">
                      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Producto</label>
                      {item.producto_id ? (
                        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
                          <span className="flex-1 font-medium text-gray-900">
                            {productosById.get(Number(item.producto_id))?.nombre || 'Producto'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleItemChange(index, 'producto_id', '')}
                            aria-label="Quitar producto de la línea"
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <ProductoBuscador productos={productos} onSelect={(producto) => handleSelectProducto(index, String(producto.id))} />
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(event) => handleItemChange(index, 'cantidad', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">IVA</label>
                      <label className="flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm">
                        <input
                          type="checkbox"
                          checked={item.aplica_iva}
                          onChange={(event) => handleItemChange(index, 'aplica_iva', event.target.checked)}
                        />
                        Aplica IVA
                      </label>
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio sin IVA</label>
                      <input
                        type="number"
                        min="0"
                        value={item.precio_unitario}
                        onChange={(event) => handleItemChange(index, 'precio_unitario', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
                        placeholder="0"
                        aria-label="Precio de factura sin IVA"
                      />
                    </div>
                  </div>

                  {/* Results row */}
                  {precio > 0 && (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-xs text-gray-500">Precio con IVA</span>
                        <p className="text-sm font-bold text-gray-800">{formatMoney(precioConIva)}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-xs text-gray-500">Total línea</span>
                        <p className="text-sm font-bold text-gray-800">{formatMoney(total)}</p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <span className="text-xs text-amber-600">Precio venta sugerido</span>
                        <p className="text-sm font-bold text-amber-800">{formatMoney(pvs)}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <span className="text-xs text-emerald-600">Ganancia estimada</span>
                        <p className="text-sm font-bold text-emerald-800">{formatMoney(ganancia)}</p>
                      </div>
                    </div>
                  )}

                  {precio > 0 && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                        <input
                          type="checkbox"
                          checked={Boolean(item.actualizar_precio)}
                          onChange={(event) => handleItemChange(index, 'actualizar_precio', event.target.checked)}
                        />
                        Actualizar precio de venta
                      </label>
                      {item.actualizar_precio ? (
                        <label className="flex items-center gap-2 text-sm text-violet-900">
                          Nuevo precio
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={item.precio_venta !== '' ? item.precio_venta : pvs}
                            onChange={(event) => handleItemChange(index, 'precio_venta', event.target.value)}
                            className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-rosewood focus:outline-none"
                            aria-label="Nuevo precio de venta"
                          />
                          <span className="text-xs text-violet-700">
                            (margen real {precioVentaFinal > 0 ? Math.round(((precioVentaFinal - precioConIva) / precioVentaFinal) * 100) : 0}%)
                          </span>
                        </label>
                      ) : (
                        <span className="text-xs text-violet-700">El precio de venta actual no cambia; solo costo y stock.</span>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                      aria-label="Eliminar línea"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Agregar producto
            </button>
            <button
              type="button"
              onClick={() => setCreandoProducto(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Producto nuevo
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm md:grid-cols-5">
            <p>Subtotal: <span className="font-semibold">{formatMoney(resumen.subtotal)}</span></p>
            <p>IVA: <span className="font-semibold">{formatMoney(resumen.totalIva)}</span></p>
            <p>Encomienda (se resta): <span className="font-semibold text-red-600">-{formatMoney(resumen.encomienda)}</span></p>
            <p>Total factura: <span className="font-semibold text-gray-900">{formatMoney(resumen.totalFactura)}</span></p>
            <p>Ganancia estimada: <span className="font-semibold text-emerald-700">{formatMoney(resumen.totalGanancia)}</span></p>
          </div>

          <button
            type="submit"
            disabled={saving || loading || (medioPago === 'efectivo' && cajaAbierta === false)}
            className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {saving ? 'Guardando factura...' : 'Guardar factura'}
          </button>
        </form>
      </section>

      {ConfirmModal}

      <CrearProductoModal
        abierto={creandoProducto}
        titulo="Producto nuevo para la factura"
        soloManual
        proveedores={proveedores}
        confirmar={confirm}
        onCreated={handleProductoCreado}
        onClose={() => setCreandoProducto(false)}
      />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Facturas registradas</h2>
        <FacturasLista
          facturas={historial.lista.data}
          loading={historial.loading}
          hayFiltros={Boolean(historial.texto || historial.filtros.proveedorId || historial.filtros.medio || historial.filtros.estado !== 'todas' || historial.filtros.desde || historial.filtros.hasta)}
          texto={historial.texto}
          onTexto={historial.setTexto}
          filtros={historial.filtros}
          onFiltro={historial.setFiltro}
          proveedores={proveedores}
          onPrint={handlePrintFactura}
          anulacion={{ id: anulandoId, pideAutorizacion, saving: savingAnulacion, error: errorAnulacion, onToggle: handleToggleAnular, onAnular: handleAnular }}
        />
        {historial.lista.totalPages > 1 && (
          <div className="mt-4">
            <PaginationControls currentPage={historial.filtros.page} totalPages={historial.lista.totalPages} onPageChange={historial.setPagina} />
          </div>
        )}
      </section>

      {selectedPrintFactura && (
        <div className="print-ticket">
          <div className="w-full max-w-lg rounded-xl border border-gray-300 bg-white p-6 shadow-2xl">
            <div className="text-center">
              <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900">Variedades Angelly</h2>
              <p className="text-xs text-gray-600">NIT: 123.456.789-0</p>
              <p className="text-xs text-gray-600">Carrera XX #YY-ZZ, Ciudad</p>
              <p className="text-xs text-gray-600">Tel: (123) 456-7890</p>
            </div>

            <div className="my-3 border-t border-dashed border-gray-400" />

            <div className="mb-4">
              <h3 className="text-center text-sm font-bold uppercase tracking-wide text-gray-900">Factura de Compra</h3>
              <p className="text-center text-xs text-gray-600">No. {selectedPrintFactura.id}</p>
              {selectedPrintFactura.numero_factura && (
                <p className="text-center text-xs text-gray-600">Ref: {selectedPrintFactura.numero_factura}</p>
              )}
            </div>

            <div className="my-3 border-t border-dashed border-gray-400" />

            <div className="mb-4 space-y-1 text-xs text-gray-700">
              <p><span className="font-semibold">Proveedor:</span> {selectedPrintFactura.proveedor_nombre}</p>
              <p><span className="font-semibold">Fecha:</span> {parseApiDate(selectedPrintFactura.fecha_creacion).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</p>
              {selectedPrintFactura.encomienda ? <p><span className="font-semibold">Encomienda:</span> {formatMoney(selectedPrintFactura.encomienda)}</p> : null}
              {selectedPrintFactura.porcentaje_ganancia ? <p><span className="font-semibold">Margen:</span> {((1 - selectedPrintFactura.porcentaje_ganancia) * 100).toFixed(0)}%</p> : null}
            </div>

            <div className="my-3 border-t border-dashed border-gray-400" />

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-gray-700">
                <thead>
                  <tr className="border-b border-gray-300 font-semibold text-gray-900">
                    <th className="whitespace-nowrap py-1 pr-2 text-left">Producto</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">Cant</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">P.Unit</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">Total</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">P.Venta</th>
                    <th className="whitespace-nowrap py-1 pl-2 text-right">Ganancia</th>
                  </tr>
                </thead>
              <tbody>
                {Array.isArray(selectedPrintFactura.items) && selectedPrintFactura.items.map((item, idx) => {
                  const cantidad = Number(item.cantidad || 0);
                  const precio = Number(item.precio_unitario || 0);
                  const aplicaIva = Boolean(item.aplica_iva);
                  const total = cantidad * precio;
                  const precioConIva = precio * (aplicaIva ? 1 + ivaRate : 1);
                  const pvs = item.precio_venta_sugerido || (precioConIva / (selectedPrintFactura.porcentaje_ganancia || 0.70));
                  const ganancia = item.ganancia_estimada || (pvs - precioConIva);
                  return (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="whitespace-nowrap py-1 pr-2">{item.nombre_producto || `Producto #${item.producto_id}`}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{cantidad}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{formatMoney(precio)}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{formatMoney(total)}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{formatMoney(pvs)}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right">{formatMoney(ganancia)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            <div className="my-3 border-t border-dashed border-gray-400" />

            <div className="space-y-1 text-xs text-gray-700">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatMoney(selectedPrintFactura.subtotal || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA:</span>
                <span>{formatMoney(selectedPrintFactura.total_iva || 0)}</span>
              </div>
              {selectedPrintFactura.encomienda ? (
                <div className="flex justify-between text-red-600">
                  <span>Encomienda:</span>
                  <span>-{formatMoney(selectedPrintFactura.encomienda)}</span>
                </div>
              ) : null}
            </div>

            <div className="my-3 border-t border-double border-gray-800" />

            <div className="flex justify-between text-sm font-bold text-gray-900">
              <span>TOTAL:</span>
              <span>{formatMoney(selectedPrintFactura.total_factura || 0)}</span>
            </div>

            <div className="mt-8 border-t border-gray-300" />

            <p className="mt-2 text-center text-xs text-gray-500">¡Gracias por su preferencia!</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Facturas;