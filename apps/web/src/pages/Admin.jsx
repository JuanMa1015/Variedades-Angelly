import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Database, PencilLine, Plus, RefreshCw, Shield, Trash2, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiRequest } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import useConfirm from '../components/useConfirm';
import Skeleton from '../components/Skeleton';
import EditFormModal from '../components/EditFormModal';

const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
};

const ROLE_GROUPS = [
  {
    role: 'Vendedor',
    modules: [
      { id: 'productos', label: 'Productos' },
      { id: 'proveedores', label: 'Proveedores' },
      { id: 'gastos', label: 'Gastos' },
      { id: 'pedidos_proveedor', label: 'Pedidos proveedor' },
    ],
  },
  {
    role: 'Cartera',
    modules: [
      { id: 'ventas', label: 'Ventas' },
      { id: 'clientes_cartera', label: 'Clientes cartera' },
      { id: 'abonos_cartera', label: 'Abonos cartera' },
    ],
  },
  {
    role: 'SuperAdmin',
    modules: [
      { id: 'admins', label: 'Admins' },
      { id: 'vendedores', label: 'Vendedores' },
      { id: 'clientes_tienda', label: 'Clientes tienda' },
      { id: 'clientes_fidelizacion', label: 'Clientes fidelización' },
      { id: 'facturas_compra', label: 'Facturas compra' },
      { id: 'auditorias', label: 'Auditorías' },
      { id: 'informes', label: 'Informes' },
    ],
  },
];

const MODULE_LABELS = {
  admins: 'Admins',
  vendedores: 'Vendedores',
  productos: 'Productos',
  proveedores: 'Proveedores',
  clientes_cartera: 'Clientes cartera',
  clientes_tienda: 'Clientes tienda',
  clientes_fidelizacion: 'Clientes fidelización',
  ventas: 'Ventas',
  pedidos_proveedor: 'Pedidos proveedor',
  facturas_compra: 'Facturas compra',
  gastos: 'Gastos',
  abonos_cartera: 'Abonos cartera',
  auditorias: 'Auditorías',
  informes: 'Informes',
};

const CREATE_DIALOGS = {
  admins: 'admins',
  vendedores: 'vendedores',
  productos: 'productos',
  proveedores: 'proveedores',
  clientes_cartera: 'clientes_cartera',
  clientes_tienda: 'clientes_tienda',
  clientes_fidelizacion: 'clientes_fidelizacion',
  ventas: 'ventas',
  pedidos_proveedor: 'pedidos_proveedor',
  facturas_compra: 'facturas_compra',
  gastos: 'gastos',
  abonos_cartera: 'abonos_cartera',
  auditorias: 'auditorias',
};

const Admin = ({ moduleKey = null }) => {
  const { token, isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState(moduleKey ?? 'productos');
  const [expandedRole, setExpandedRole] = useState('Vendedor');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { confirm, ConfirmModal } = useConfirm();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalTitle, setEditModalTitle] = useState('');
  const [editModalFields, setEditModalFields] = useState([]);
  const [editModalValues, setEditModalValues] = useState({});
  const editOnSaveRef = useRef(null);

  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [clientesCartera, setClientesCartera] = useState([]);
  const [clientesTienda, setClientesTienda] = useState([]);
  const [clientesFidelizacion, setClientesFidelizacion] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [pedidosProveedor, setPedidosProveedor] = useState([]);
  const [facturasCompra, setFacturasCompra] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [abonosCartera, setAbonosCartera] = useState([]);
  const [auditorias, setAuditorias] = useState([]);
  const [informes, setInformes] = useState({
    ventas_totales: 0,
    facturacion_total: 0,
    vendedor_mas_vendedor: null,
    vendedores_top: [],
    producto_mas_vendido: null,
    producto_menos_vendido: null,
    productos_mas_vendidos: [],
    productos_menos_vendidos: [],
  });

  const [vendedorForm, setVendedorForm] = useState({ username: '', password: '' });
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [proveedorForm, setProveedorForm] = useState({ nombre: '', contacto: '', telefono: '' });
  const [productoForm, setProductoForm] = useState({ nombre: '', codigo_barras: '', precio_costo: '', precio_venta: '', stock_actual: '', stock_minimo: '', catalogo: 'tienda' });
  const [clienteCarteraForm, setClienteCarteraForm] = useState({ nombre: '', documento: '', telefono_whatsapp: '', limite_credito: '' });
  const [clienteTiendaForm, setClienteTiendaForm] = useState({ nombre: '', telefono_whatsapp: '' });
  const [clienteFidelizacionForm, setClienteFidelizacionForm] = useState({ nombre: '', telefono_whatsapp: '', puntos_acumulados: '' });
  const [ventaForm, setVentaForm] = useState({ cliente_id: '', cliente_tienda_id: '', items_json: '[]', es_fiado: false, fiado_origen: '', abono_inicial: '0', metodo_pago: '' });
  const [pedidoProveedorForm, setPedidoProveedorForm] = useState({ proveedor_id: '', descripcion: '', monto_estimado: '' });
  const [facturaCompraForm, setFacturaCompraForm] = useState({ proveedor_id: '', items_json: '[]' });
  const [gastoForm, setGastoForm] = useState({ categoria: '', descripcion: '', monto: '' });
  const [auditoriaForm, setAuditoriaForm] = useState({ modulo: '', entidad: '', entidad_id: '', accion: '', detalle: '' });
  const [abonoCarteraForm, setAbonoCarteraForm] = useState({ cliente_id: '', monto: '', metodo_pago: 'efectivo', referencia: '' });
  const [createDialog, setCreateDialog] = useState(null);

  useEffect(() => {
    if (moduleKey) {
      setActiveTab(moduleKey);
    }
  }, [moduleKey]);

  const notifyError = (message) => {
    setSuccess('');
    setError(message);
  };

  const notifySuccess = (message) => {
    setError('');
    setSuccess(message);
  };

  const openCreateDialog = (dialogKey) => {
    setError('');
    setSuccess('');
    setCreateDialog(dialogKey);
  };

  const closeCreateDialog = () => {
    setCreateDialog(null);
  };

  const request = async ({ endpoint, method = 'GET', body, signal }) => {
    return apiRequest(endpoint, {
      method,
      signal,
      body,
    });
  };

  const loadAll = useCallback(async (signal) => {
    try {
      const [
        proveedoresPayload,
        productosPayload,
        vendedoresPayload,
        adminsPayload,
        clientesPayload,
        clientesTiendaPayload,
        clientesFidelizacionPayload,
        ventasPayload,
        pedidosPayload,
        facturasPayload,
        gastosPayload,
        abonosPayload,
        auditoriasPayload,
        informesPayload,
      ] = await Promise.all([
        request({ endpoint: '/api/superadmin/proveedores', signal }),
        request({ endpoint: '/api/superadmin/productos', signal }),
        request({ endpoint: '/api/superadmin/usuarios/vendedores', signal }),
        request({ endpoint: '/api/superadmin/usuarios/admins', signal }),
        request({ endpoint: '/api/clientes', signal }),
        request({ endpoint: '/api/clientes/tienda-fiado', signal }),
        request({ endpoint: '/api/fidelizacion/clientes', signal }),
        request({ endpoint: '/api/ventas', signal }),
        request({ endpoint: '/api/proveedores/pedidos', signal }),
        request({ endpoint: '/api/facturas-compra', signal }),
        request({ endpoint: '/api/gastos', signal }),
        request({ endpoint: '/api/cartera/abonos', signal }),
        request({ endpoint: '/api/superadmin/auditorias', signal }),
        request({ endpoint: '/api/superadmin/informes', signal }),
      ]);

      setProveedores(Array.isArray(proveedoresPayload) ? proveedoresPayload : []);
      setProductos(Array.isArray(productosPayload) ? productosPayload : []);
      setVendedores(Array.isArray(vendedoresPayload) ? vendedoresPayload : []);
      setAdmins(Array.isArray(adminsPayload) ? adminsPayload : []);
      setClientesCartera(Array.isArray(clientesPayload) ? clientesPayload : []);
      setClientesTienda(Array.isArray(clientesTiendaPayload) ? clientesTiendaPayload : []);
      setClientesFidelizacion(Array.isArray(clientesFidelizacionPayload) ? clientesFidelizacionPayload : []);
      setVentas(Array.isArray(ventasPayload) ? ventasPayload : []);
      setPedidosProveedor(Array.isArray(pedidosPayload) ? pedidosPayload : []);
      setFacturasCompra(Array.isArray(facturasPayload) ? facturasPayload : []);
      setGastos(Array.isArray(gastosPayload) ? gastosPayload : []);
      setAbonosCartera(Array.isArray(abonosPayload) ? abonosPayload : []);
      setAuditorias(Array.isArray(auditoriasPayload) ? auditoriasPayload : []);
      setInformes({
        ventas_totales: Number(informesPayload?.ventas_totales || 0),
        facturacion_total: Number(informesPayload?.facturacion_total || 0),
        vendedor_mas_vendedor: informesPayload?.vendedor_mas_vendedor || null,
        vendedores_top: Array.isArray(informesPayload?.vendedores_top) ? informesPayload.vendedores_top : [],
        producto_mas_vendido: informesPayload?.producto_mas_vendido || null,
        producto_menos_vendido: informesPayload?.producto_menos_vendido || null,
        productos_mas_vendidos: Array.isArray(informesPayload?.productos_mas_vendidos) ? informesPayload.productos_mas_vendidos : [],
        productos_menos_vendidos: Array.isArray(informesPayload?.productos_menos_vendidos) ? informesPayload.productos_menos_vendidos : [],
      });
    } catch (err) {
      if (signal?.aborted) return;
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!token || !isSuperAdmin) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        await loadAll(controller.signal);
      } catch (err) {
        if (!isMounted || controller.signal.aborted) return;
        notifyError(err.message || 'No se pudo cargar el modulo admin');
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [token, isSuperAdmin, loadAll]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const controller = new AbortController();
      await loadAll(controller.signal);
      notifySuccess('Datos actualizados');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar');
    } finally {
      setRefreshing(false);
    }
  };

  const runDelete = async ({ endpoint, successMessage }) => {
    await apiDelete(endpoint);

    await loadAll();
    notifySuccess(successMessage);
  };

  const openEditModal = (title, fields, initialValues, onSave) => {
    setEditModalTitle(title);
    setEditModalFields(fields);
    setEditModalValues(initialValues);
    editOnSaveRef.current = onSave;
    setEditModalOpen(true);
  };

  const parseItemsJson = (value) => {
    const raw = String(value || '').trim() || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('items debe ser un arreglo JSON');
    }
    return parsed;
  };

  // Clientes cartera
  const handleCreateClienteCartera = async (event) => {
    event.preventDefault();
    if (Number(clienteCarteraForm.limite_credito) < 0) {
      notifyError('El limite de credito no puede ser negativo');
      return;
    }
    try {
      await request({
        endpoint: '/api/cartera/clientes',
        method: 'POST',
        body: {
          nombre: clienteCarteraForm.nombre.trim(),
          documento: clienteCarteraForm.documento.trim() || null,
          telefono_whatsapp: clienteCarteraForm.telefono_whatsapp.trim() || null,
          limite_credito: Number(clienteCarteraForm.limite_credito || 0),
        },
      });
      await loadAll();
      setClienteCarteraForm({ nombre: '', documento: '', telefono_whatsapp: '', limite_credito: '' });
      closeCreateDialog();
      notifySuccess('Cliente creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear cliente');
    }
  };

  const handleEditClienteCartera = (item) => {
    openEditModal(
      'Editar cliente cartera',
      [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'documento', label: 'Documento (opcional)', type: 'text', required: false },
        { name: 'telefono_whatsapp', label: 'Teléfono (opcional)', type: 'text', required: false },
        { name: 'limite_credito', label: 'Límite crédito', type: 'number', required: true },
      ],
      { nombre: item.nombre, documento: item.documento || '', telefono_whatsapp: item.telefono_whatsapp || '', limite_credito: String(item.limite_credito ?? '') },
      async (values) => {
        await request({
          endpoint: `/api/cartera/clientes/${item.id}`,
          method: 'PATCH',
          body: {
            nombre: values.nombre.trim(),
            documento: values.documento.trim() || null,
            telefono_whatsapp: values.telefono_whatsapp.trim() || null,
            limite_credito: Number(values.limite_credito || 0),
          },
        });
        await loadAll();
        notifySuccess('Cliente actualizado');
      },
    );
  };

  const handleDeleteClienteCartera = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar cliente', message: `Eliminar cliente ${item.nombre}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/cartera/clientes/${item.id}`,
        successMessage: 'Cliente eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar cliente');
    }
  };

  // Clientes tienda fiado
  const handleCreateClienteTienda = async (event) => {
    event.preventDefault();
    try {
      await request({
        endpoint: '/api/clientes/tienda-fiado',
        method: 'POST',
        body: {
          nombre: clienteTiendaForm.nombre.trim(),
          telefono_whatsapp: clienteTiendaForm.telefono_whatsapp.trim() || null,
        },
      });
      await loadAll();
      setClienteTiendaForm({ nombre: '', telefono_whatsapp: '' });
      closeCreateDialog();
      notifySuccess('Cliente tienda creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear cliente tienda');
    }
  };

  const handleEditClienteTienda = (item) => {
    openEditModal(
      'Editar cliente tienda',
      [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'telefono_whatsapp', label: 'Teléfono (opcional)', type: 'text', required: false },
      ],
      { nombre: item.nombre, telefono_whatsapp: item.telefono_whatsapp || '' },
      async (values) => {
        await request({
          endpoint: `/api/clientes/tienda-fiado/${item.id}`,
          method: 'PATCH',
          body: {
            nombre: values.nombre.trim(),
            telefono_whatsapp: values.telefono_whatsapp.trim() || null,
          },
        });
        await loadAll();
        notifySuccess('Cliente tienda actualizado');
      },
    );
  };

  const handleDeleteClienteTienda = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar cliente', message: `Eliminar cliente ${item.nombre}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/clientes/tienda-fiado/${item.id}`,
        successMessage: 'Cliente tienda eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar cliente tienda');
    }
  };

  // Clientes fidelizacion
  const handleCreateClienteFidelizacion = async (event) => {
    event.preventDefault();
    if (Number(clienteFidelizacionForm.puntos_acumulados) < 0) {
      notifyError('Los puntos acumulados no pueden ser negativos');
      return;
    }
    try {
      await request({
        endpoint: '/api/fidelizacion/clientes',
        method: 'POST',
        body: {
          nombre: clienteFidelizacionForm.nombre.trim(),
          telefono_whatsapp: clienteFidelizacionForm.telefono_whatsapp.trim(),
          puntos_acumulados: Number(clienteFidelizacionForm.puntos_acumulados || 0),
        },
      });
      await loadAll();
      setClienteFidelizacionForm({ nombre: '', telefono_whatsapp: '', puntos_acumulados: '' });
      closeCreateDialog();
      notifySuccess('Cliente fidelizacion creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear cliente fidelizacion');
    }
  };

  const handleEditClienteFidelizacion = (item) => {
    openEditModal(
      'Editar cliente fidelización',
      [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'telefono_whatsapp', label: 'Teléfono', type: 'text', required: true },
        { name: 'puntos_acumulados', label: 'Puntos acumulados', type: 'number', required: true },
      ],
      { nombre: item.nombre, telefono_whatsapp: item.telefono_whatsapp || '', puntos_acumulados: String(item.puntos_acumulados ?? '') },
      async (values) => {
        if (Number(values.puntos_acumulados) < 0) {
          notifyError('Los puntos acumulados no pueden ser negativos');
          return;
        }
        await request({
          endpoint: `/api/fidelizacion/clientes/${item.id}`,
          method: 'PATCH',
          body: {
            nombre: values.nombre.trim(),
            telefono_whatsapp: values.telefono_whatsapp.trim(),
            puntos_acumulados: Number(values.puntos_acumulados || 0),
          },
        });
        await loadAll();
        notifySuccess('Cliente fidelizacion actualizado');
      },
    );
  };

  const handleDeleteClienteFidelizacion = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar cliente', message: `Eliminar cliente ${item.nombre}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/fidelizacion/clientes/${item.id}`,
        successMessage: 'Cliente fidelizacion eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar cliente fidelizacion');
    }
  };

  // Ventas
  const handleCreateVenta = async (event) => {
    event.preventDefault();
    try {
      const items = parseItemsJson(ventaForm.items_json);
      await request({
        endpoint: '/api/ventas',
        method: 'POST',
        body: {
          cliente_id: ventaForm.cliente_id ? Number(ventaForm.cliente_id) : null,
          cliente_tienda_id: ventaForm.cliente_tienda_id ? Number(ventaForm.cliente_tienda_id) : null,
          items,
          es_fiado: Boolean(ventaForm.es_fiado),
          fiado_origen: ventaForm.fiado_origen.trim() || null,
          abono_inicial: Number(ventaForm.abono_inicial || 0),
          metodo_pago: ventaForm.metodo_pago.trim() || null,
        },
      });
      await loadAll();
      setVentaForm({ cliente_id: '', cliente_tienda_id: '', items_json: '[]', es_fiado: false, fiado_origen: '', abono_inicial: '0', metodo_pago: '' });
      closeCreateDialog();
      notifySuccess('Venta creada');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear venta');
    }
  };

  const handleEditVenta = (item) => {
    openEditModal(
      'Editar venta',
      [
        { name: 'total', label: 'Total', type: 'number', required: true },
        { name: 'saldo_pendiente', label: 'Saldo pendiente', type: 'number', required: true },
      ],
      { total: String(item.total ?? ''), saldo_pendiente: String(item.saldo_pendiente ?? '') },
      async (values) => {
        if (Number(values.total) < 0) { notifyError('El total no puede ser negativo'); return; }
        if (Number(values.saldo_pendiente) < 0) { notifyError('El saldo pendiente no puede ser negativo'); return; }
        await request({
          endpoint: `/api/ventas/${item.venta_id}`,
          method: 'PATCH',
          body: { total: Number(values.total), saldo_pendiente: Number(values.saldo_pendiente) },
        });
        await loadAll();
        notifySuccess('Venta actualizada');
      },
    );
  };

  const handleDeleteVenta = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar venta', message: `Eliminar venta ${item.venta_id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/ventas/${item.venta_id}`,
        successMessage: 'Venta eliminada',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar venta');
    }
  };

  // Pedidos proveedor
  const handleCreatePedidoProveedor = async (event) => {
    event.preventDefault();
    try {
      await request({
        endpoint: '/api/proveedores/pedidos',
        method: 'POST',
        body: {
          proveedor_id: Number(pedidoProveedorForm.proveedor_id),
          descripcion: pedidoProveedorForm.descripcion.trim(),
          monto_estimado: Number(pedidoProveedorForm.monto_estimado || 0),
        },
      });
      await loadAll();
      setPedidoProveedorForm({ proveedor_id: '', descripcion: '', monto_estimado: '' });
      closeCreateDialog();
      notifySuccess('Pedido creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear pedido');
    }
  };

  const handleEditPedidoProveedor = (item) => {
    openEditModal(
      'Editar pedido proveedor',
      [
        { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true },
        { name: 'monto_estimado', label: 'Monto estimado', type: 'number', required: true },
      ],
      { descripcion: item.descripcion, monto_estimado: String(item.monto_estimado ?? '') },
      async (values) => {
        if (Number(values.monto_estimado) < 0) { notifyError('El monto estimado no puede ser negativo'); return; }
        await request({
          endpoint: `/api/proveedores/pedidos/${item.id}`,
          method: 'PATCH',
          body: { descripcion: values.descripcion.trim(), monto_estimado: Number(values.monto_estimado || 0) },
        });
        await loadAll();
        notifySuccess('Pedido actualizado');
      },
    );
  };

  const handleDeletePedidoProveedor = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar pedido', message: `Eliminar pedido ${item.id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/proveedores/pedidos/${item.id}`,
        successMessage: 'Pedido eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar pedido');
    }
  };

  // Facturas compra
  const handleCreateFacturaCompra = async (event) => {
    event.preventDefault();
    try {
      const items = parseItemsJson(facturaCompraForm.items_json);
      await request({
        endpoint: '/api/facturas-compra',
        method: 'POST',
        body: {
          proveedor_id: Number(facturaCompraForm.proveedor_id),
          items,
        },
      });
      await loadAll();
      setFacturaCompraForm({ proveedor_id: '', items_json: '[]' });
      closeCreateDialog();
      notifySuccess('Factura creada');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear factura');
    }
  };

  const handleEditFacturaCompra = (item) => {
    openEditModal(
      'Editar factura compra',
      [{ name: 'total_factura', label: 'Total factura', type: 'number', required: true }],
      { total_factura: String(item.total_factura ?? '') },
      async (values) => {
        if (Number(values.total_factura) < 0) { notifyError('El total de factura no puede ser negativo'); return; }
        await request({
          endpoint: `/api/facturas-compra/${item.id}`,
          method: 'PATCH',
          body: { total_factura: Number(values.total_factura) },
        });
        await loadAll();
        notifySuccess('Factura actualizada');
      },
    );
  };

  const handleDeleteFacturaCompra = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar factura', message: `Eliminar factura ${item.id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/facturas-compra/${item.id}`,
        successMessage: 'Factura eliminada',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar factura');
    }
  };

  // Gastos
  const handleCreateGasto = async (event) => {
    event.preventDefault();
    if (Number(gastoForm.monto) <= 0) {
      notifyError('El monto no puede ser negativo');
      return;
    }
    try {
      await request({
        endpoint: '/api/gastos',
        method: 'POST',
        body: {
          categoria: gastoForm.categoria.trim(),
          descripcion: gastoForm.descripcion.trim(),
          monto: Number(gastoForm.monto || 0),
        },
      });
      await loadAll();
      setGastoForm({ categoria: '', descripcion: '', monto: '' });
      closeCreateDialog();
      notifySuccess('Gasto creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear gasto');
    }
  };

  const handleEditGasto = (item) => {
    openEditModal(
      'Editar gasto',
      [
        { name: 'categoria', label: 'Categoría', type: 'text', required: true },
        { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true },
        { name: 'monto', label: 'Monto', type: 'number', required: true },
      ],
      { categoria: item.categoria, descripcion: item.descripcion, monto: String(item.monto ?? '') },
      async (values) => {
        if (Number(values.monto) < 0) { notifyError('El monto no puede ser negativo'); return; }
        await request({
          endpoint: `/api/gastos/${item.id}`,
          method: 'PATCH',
          body: { categoria: values.categoria.trim(), descripcion: values.descripcion.trim(), monto: Number(values.monto || 0) },
        });
        await loadAll();
        notifySuccess('Gasto actualizado');
      },
    );
  };

  const handleDeleteGasto = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar gasto', message: `Eliminar gasto ${item.id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/gastos/${item.id}`,
        successMessage: 'Gasto eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar gasto');
    }
  };

  // Abonos cartera
  const handleCreateAbonoCartera = async (event) => {
    event.preventDefault();
    try {
      await request({
        endpoint: '/api/cartera/abonos',
        method: 'POST',
        body: {
          cliente_id: Number(abonoCarteraForm.cliente_id),
          monto: Number(abonoCarteraForm.monto),
          metodo_pago: abonoCarteraForm.metodo_pago,
          referencia: abonoCarteraForm.referencia.trim() || null,
        },
      });
      await loadAll();
      setAbonoCarteraForm({ cliente_id: '', monto: '', metodo_pago: 'efectivo', referencia: '' });
      closeCreateDialog();
      notifySuccess('Abono creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear abono');
    }
  };

  const handleEditAbonoCartera = (item) => {
    openEditModal(
      'Editar abono cartera',
      [{ name: 'monto', label: 'Monto', type: 'number', required: true }],
      { monto: String(item.monto ?? '') },
      async (values) => {
        if (Number(values.monto) <= 0) { notifyError('El monto del abono debe ser mayor a cero'); return; }
        await request({
          endpoint: `/api/cartera/abonos/${item.id}`,
          method: 'PATCH',
          body: { monto: Number(values.monto) },
        });
        await loadAll();
        notifySuccess('Abono actualizado');
      },
    );
  };

  const handleDeleteAbonoCartera = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar abono', message: `Eliminar abono ${item.id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/cartera/abonos/${item.id}`,
        successMessage: 'Abono eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar abono');
    }
  };

  // Admins
  const handleCreateAdmin = async (event) => {
    event.preventDefault();
    try {
      await request({
        endpoint: '/api/superadmin/usuarios/admins',
        method: 'POST',
        body: { username: adminForm.username.trim(), password: adminForm.password },
      });
      await loadAll();
      setAdminForm({ username: '', password: '' });
      closeCreateDialog();
      notifySuccess('Admin creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear admin');
    }
  };

  const handleEditAdmin = (item) => {
    openEditModal(
      'Editar admin',
      [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Nueva contraseña (en blanco para mantener)', type: 'password', required: false },
      ],
      { username: item.username, password: '' },
      async (values) => {
        const payload = { username: values.username.trim() };
        if (values.password.trim()) payload.password = values.password;
        await request({
          endpoint: `/api/superadmin/usuarios/admins/${item.id}`,
          method: 'PATCH',
          body: payload,
        });
        await loadAll();
        notifySuccess('Admin actualizado');
      },
    );
  };

  const handleDeleteAdmin = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar admin', message: `Eliminar admin ${item.username}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/superadmin/usuarios/admins/${item.id}`,
        successMessage: 'Admin eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar admin');
    }
  };

  // Vendedores
  const handleCreateVendedor = async (event) => {
    event.preventDefault();
    try {
      await request({
        endpoint: '/api/superadmin/usuarios/vendedores',
        method: 'POST',
        body: { username: vendedorForm.username.trim(), password: vendedorForm.password },
      });
      await loadAll();
      setVendedorForm({ username: '', password: '' });
      closeCreateDialog();
      notifySuccess('Vendedor creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear vendedor');
    }
  };

  const handleEditVendedor = (item) => {
    openEditModal(
      'Editar vendedor',
      [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Nueva contraseña (en blanco para mantener)', type: 'password', required: false },
      ],
      { username: item.username, password: '' },
      async (values) => {
        const payload = { username: values.username.trim() };
        if (values.password.trim()) payload.password = values.password;
        await request({
          endpoint: `/api/superadmin/usuarios/vendedores/${item.id}`,
          method: 'PATCH',
          body: payload,
        });
        await loadAll();
        notifySuccess('Vendedor actualizado');
      },
    );
  };

  const handleDeleteVendedor = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar vendedor', message: `Eliminar vendedor ${item.username}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/superadmin/usuarios/vendedores/${item.id}`,
        successMessage: 'Vendedor eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar vendedor');
    }
  };

  // Productos
  const handleCreateProducto = async (event) => {
    event.preventDefault();
    if (Number(productoForm.precio_costo) < 0) {
      notifyError('El precio de costo no puede ser negativo');
      return;
    }
    if (Number(productoForm.precio_venta) < 0) {
      notifyError('El precio de venta no puede ser negativo');
      return;
    }
    if (Number(productoForm.stock_actual) < 0) {
      notifyError('El stock actual no puede ser negativo');
      return;
    }
    if (Number(productoForm.stock_minimo) < 0) {
      notifyError('El stock minimo no puede ser negativo');
      return;
    }
    try {
      await request({
        endpoint: '/api/superadmin/productos',
        method: 'POST',
        body: {
          nombre: productoForm.nombre.trim(),
          codigo_barras: productoForm.codigo_barras.trim() || null,
          precio_costo: Number(productoForm.precio_costo || 0),
          precio_venta: Number(productoForm.precio_venta || 0),
          stock_actual: Number(productoForm.stock_actual || 0),
          stock_minimo: Number(productoForm.stock_minimo || 0),
          catalogo: productoForm.catalogo,
        },
      });
      await loadAll();
      setProductoForm({ nombre: '', codigo_barras: '', precio_costo: '', precio_venta: '', stock_actual: '', stock_minimo: '', catalogo: 'tienda' });
      closeCreateDialog();
      notifySuccess('Producto creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear producto');
    }
  };

  const handleEditProducto = (item) => {
    openEditModal(
      'Editar producto',
      [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'precio_venta', label: 'Precio de venta', type: 'number', required: true },
      ],
      { nombre: item.nombre, precio_venta: String(item.precio_venta ?? '') },
      async (values) => {
        if (Number(values.precio_venta) < 0) { notifyError('El precio de venta no puede ser negativo'); return; }
        await request({
          endpoint: `/api/productos/${item.id}`,
          method: 'PATCH',
          body: { nombre: values.nombre.trim(), precio_venta: Number(values.precio_venta) },
        });
        await loadAll();
        notifySuccess('Producto actualizado');
      },
    );
  };

  const handleDeleteProducto = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar producto', message: `Eliminar producto ${item.nombre}?` }); if (!confirmed) return;
    try {
      await apiDelete(`/api/productos/${item.id}`);
      await loadAll();
      notifySuccess('Producto eliminado');
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar producto');
    }
  };

  // Proveedores
  const handleCreateProveedor = async (event) => {
    event.preventDefault();
    try {
      await request({
        endpoint: '/api/superadmin/proveedores',
        method: 'POST',
        body: {
          nombre: proveedorForm.nombre.trim(),
          contacto: proveedorForm.contacto.trim() || null,
          telefono: proveedorForm.telefono.trim() || null,
        },
      });
      await loadAll();
      setProveedorForm({ nombre: '', contacto: '', telefono: '' });
      closeCreateDialog();
      notifySuccess('Proveedor creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear proveedor');
    }
  };

  const handleEditProveedor = (item) => {
    openEditModal(
      'Editar proveedor',
      [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'telefono', label: 'Teléfono', type: 'text', required: true },
      ],
      { nombre: item.nombre, telefono: item.telefono || '' },
      async (values) => {
        await request({
          endpoint: `/api/proveedores/${item.id}`,
          method: 'PATCH',
          body: { nombre: values.nombre.trim(), telefono: values.telefono.trim() || null },
        });
        await loadAll();
        notifySuccess('Proveedor actualizado');
      },
    );
  };

  const handleDeleteProveedor = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar proveedor', message: `Eliminar proveedor ${item.nombre}?` }); if (!confirmed) return;
    try {
      await apiDelete(`/api/proveedores/${item.id}`);
      await loadAll();
      notifySuccess('Proveedor eliminado');
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar proveedor');
    }
  };

  // Auditorias
  const handleCreateAuditoria = async (event) => {
    event.preventDefault();
    try {
      await request({
        endpoint: '/api/superadmin/auditorias',
        method: 'POST',
        body: {
          modulo: auditoriaForm.modulo.trim(),
          entidad: auditoriaForm.entidad.trim(),
          entidad_id: auditoriaForm.entidad_id ? Number(auditoriaForm.entidad_id) : null,
          accion: auditoriaForm.accion.trim(),
          detalle: auditoriaForm.detalle.trim() || null,
          usuario: 'superadmin',
        },
      });
      await loadAll();
      setAuditoriaForm({ modulo: '', entidad: '', entidad_id: '', accion: '', detalle: '' });
      closeCreateDialog();
      notifySuccess('Auditoria creada');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear auditoria');
    }
  };

  const handleEditAuditoria = (item) => {
    openEditModal(
      'Editar auditoría',
      [
        { name: 'modulo', label: 'Módulo', type: 'text', required: true },
        { name: 'accion', label: 'Acción', type: 'text', required: true },
      ],
      { modulo: item.modulo, accion: item.accion },
      async (values) => {
        await request({
          endpoint: `/api/auditorias/${item.id}`,
          method: 'PATCH',
          body: { modulo: values.modulo.trim(), accion: values.accion.trim() },
        });
        await loadAll();
        notifySuccess('Auditoria actualizada');
      },
    );
  };

  const handleDeleteAuditoria = async (item) => {
    const confirmed = await confirm({ title: 'Eliminar auditoría', message: `Eliminar auditoría ${item.id}?` }); if (!confirmed) return;
    try {
      await apiDelete(`/api/auditorias/${item.id}`);
      await loadAll();
      notifySuccess('Auditoria eliminada');
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar auditoria');
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
        Acceso restringido: solo superadmin
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        <Skeleton lines={4} className="mx-auto max-w-md" />
      </div>
    );
  }

  const sectionShellClass = 'rounded-[28px] border border-[#eebbbb]/70 bg-white/90 shadow-[0_20px_50px_rgba(106,63,67,0.08)] backdrop-blur';

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-[#eebbbb]/70 bg-[linear-gradient(135deg,#fdf1f1_0%,#fbe3e3_52%,#f9d6d5_100%)] p-5 shadow-[0_24px_70px_rgba(106,63,67,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f6c8c7]/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6a3f43]">
              <Shield className="h-3.5 w-3.5" />
              Panel administrativo
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-[#6a3f43] sm:text-4xl">Panel de Administración</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#6a3f43]/80 sm:text-base">
              Gestiona usuarios, productos, ventas y más desde un solo lugar.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2.5 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        </div>
      </section>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      {!moduleKey && (
        <div className="rounded-2xl border border-[#eebbbb] bg-white/80 px-4 py-3 text-xs text-[#6a3f43]/80 shadow-sm sm:text-sm">
          Resumen: Admins {admins.length} · Vendedores {vendedores.length} · Productos {productos.length} · Proveedores {proveedores.length} · Auditorias {auditorias.length} · Facturacion {formatMoney(informes.facturacion_total)}
        </div>
      )}

      {!moduleKey && (
        <div className="space-y-3">
          {ROLE_GROUPS.map((group) => {
            const isExpanded = expandedRole === group.role;
            return (
              <div key={group.role} className="rounded-[28px] border border-[#eebbbb]/70 bg-white/90 shadow-[0_16px_40px_rgba(106,63,67,0.06)]">
                <button
                  type="button"
                  onClick={() => setExpandedRole(isExpanded ? '' : group.role)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-[#fdf1f1]"
                >
                  <span className="text-sm font-bold uppercase tracking-[0.08em] text-[#6a3f43]">
                    {group.role}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[#6a3f43]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#6a3f43]" />
                  )}
                </button>
                {isExpanded && (
                  <div className="border-t border-[#eebbbb]/50 px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {group.modules.map((mod) => (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => setActiveTab(mod.id)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                            activeTab === mod.id
                              ? 'bg-[#6a3f43] text-[#fdf1f1]'
                              : 'bg-[#fdf1f1] text-[#6a3f43] hover:bg-[#fbe3e3]'
                          }`}
                        >
                          {mod.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'vendedores' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Vendedores</h2>
              <p className="text-sm text-[#6a3f43]/70">Acceso restringido y altas por modal.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.vendedores)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Username</th>
                  <th className="px-3 py-3">Rol</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{item.username}</td>
                    <td className="px-3 py-3">{item.rol}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditVendedor(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteVendedor(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {vendedores.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'admins' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Administradores</h2>
              <p className="text-sm text-[#6a3f43]/70">Acceso y control de admins.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.admins)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Username</th>
                  <th className="px-3 py-3">Rol</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{item.username}</td>
                    <td className="px-3 py-3">{item.rol}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditAdmin(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteAdmin(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'productos' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Productos</h2>
              <p className="text-sm text-[#6a3f43]/70">Inventario y precios con control visual.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.productos)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">Nombre</th>
                  <th className="px-3 py-3 text-right">Costo</th>
                  <th className="px-3 py-3 text-right">Venta</th>
                  <th className="px-3 py-3 text-right">Stock</th>
                  <th className="px-3 py-3 text-right">Min</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.nombre}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.precio_costo)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.precio_venta)}</td>
                    <td className="px-3 py-3 text-right">{item.stock_actual}</td>
                    <td className="px-3 py-3 text-right">{item.stock_minimo}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditProducto(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteProducto(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {productos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'proveedores' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Proveedores</h2>
              <p className="text-sm text-[#6a3f43]/70">Catálogo de contactos y pedidos.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.proveedores)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">Nombre</th>
                  <th className="px-3 py-3">Contacto</th>
                  <th className="px-3 py-3">Telefono</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.nombre}</td>
                    <td className="px-3 py-3">{item.contacto || '-'}</td>
                    <td className="px-3 py-3">{item.telefono || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditProveedor(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteProveedor(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {proveedores.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'clientes_cartera' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Clientes cartera</h2>
              <p className="text-sm text-[#6a3f43]/70">Clientes con cupo y deuda.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.clientes_cartera)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Nombre</th>
                  <th className="px-3 py-3">Documento</th>
                  <th className="px-3 py-3">Telefono</th>
                  <th className="px-3 py-3 text-right">Limite</th>
                  <th className="px-3 py-3 text-right">Deuda</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientesCartera.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{item.nombre}</td>
                    <td className="px-3 py-3">{item.documento || '-'}</td>
                    <td className="px-3 py-3">{item.telefono_whatsapp || '-'}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.limite_credito)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.deuda_total)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditClienteCartera(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteClienteCartera(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientesCartera.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'clientes_tienda' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Clientes tienda</h2>
              <p className="text-sm text-[#6a3f43]/70">Clientes fiados de tienda.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.clientes_tienda)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Nombre</th>
                  <th className="px-3 py-3">Telefono</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientesTienda.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{item.nombre}</td>
                    <td className="px-3 py-3">{item.telefono_whatsapp || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditClienteTienda(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteClienteTienda(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientesTienda.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'clientes_fidelizacion' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Clientes fidelizacion</h2>
              <p className="text-sm text-[#6a3f43]/70">Puntos y contacto.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.clientes_fidelizacion)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Nombre</th>
                  <th className="px-3 py-3">Telefono</th>
                  <th className="px-3 py-3 text-right">Puntos</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientesFidelizacion.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{item.nombre}</td>
                    <td className="px-3 py-3">{item.telefono_whatsapp}</td>
                    <td className="px-3 py-3 text-right">{item.puntos_acumulados}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditClienteFidelizacion(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteClienteFidelizacion(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientesFidelizacion.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'ventas' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Ventas</h2>
              <p className="text-sm text-[#6a3f43]/70">Historial completo de ventas.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.ventas)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Fiado</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3 text-right">Saldo</th>
                  <th className="px-3 py-3">Metodo</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((item) => (
                  <tr key={item.venta_id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.venta_id}</td>
                    <td className="px-3 py-3">{item.cliente_nombre || '-'}</td>
                    <td className="px-3 py-3">{item.es_fiado ? 'Si' : 'No'}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.total)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.saldo_pendiente)}</td>
                    <td className="px-3 py-3">{item.metodo_pago || '-'}</td>
                    <td className="px-3 py-3">{formatDateTime(item.fecha)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditVenta(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteVenta(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {ventas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'pedidos_proveedor' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Pedidos proveedor</h2>
              <p className="text-sm text-[#6a3f43]/70">Solicitudes enviadas a proveedor.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.pedidos_proveedor)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Proveedor</th>
                  <th className="px-3 py-3">Descripcion</th>
                  <th className="px-3 py-3 text-right">Monto</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Creado por</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosProveedor.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{item.proveedor_nombre}</td>
                    <td className="px-3 py-3">{item.descripcion}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.monto_estimado)}</td>
                    <td className="px-3 py-3">{item.estado}</td>
                    <td className="px-3 py-3">{item.creado_por}</td>
                    <td className="px-3 py-3">{formatDateTime(item.fecha_creacion)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditPedidoProveedor(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeletePedidoProveedor(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pedidosProveedor.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'facturas_compra' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Facturas compra</h2>
              <p className="text-sm text-[#6a3f43]/70">Ingresos de factura con detalle.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.facturas_compra)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Proveedor</th>
                  <th className="px-3 py-3 text-right">Subtotal</th>
                  <th className="px-3 py-3 text-right">IVA</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3">Items</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturasCompra.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{item.proveedor_nombre}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.subtotal)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.total_iva)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.total_factura)}</td>
                    <td className="px-3 py-3">{item.items?.length || 0}</td>
                    <td className="px-3 py-3">{formatDateTime(item.fecha_creacion)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditFacturaCompra(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteFacturaCompra(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {facturasCompra.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'gastos' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Gastos</h2>
              <p className="text-sm text-[#6a3f43]/70">Gastos operativos.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.gastos)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Categoria</th>
                  <th className="px-3 py-3">Descripcion</th>
                  <th className="px-3 py-3 text-right">Monto</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Registrado por</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{item.categoria}</td>
                    <td className="px-3 py-3">{item.descripcion}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.monto)}</td>
                    <td className="px-3 py-3">{formatDateTime(item.fecha)}</td>
                    <td className="px-3 py-3">{item.registrado_por}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditGasto(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteGasto(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {gastos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'abonos_cartera' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Abonos cartera</h2>
              <p className="text-sm text-[#6a3f43]/70">Abonos registrados en cartera.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.abonos_cartera)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3 text-right">Monto</th>
                  <th className="px-3 py-3">Metodo</th>
                  <th className="px-3 py-3 text-right">Saldo</th>
                  <th className="px-3 py-3">Referencia</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {abonosCartera.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.id}</td>
                    <td className="px-3 py-3">{clientesCartera.find((c) => c.id === item.cliente_id)?.nombre || item.cliente_id}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.monto)}</td>
                    <td className="px-3 py-3">{item.metodo_pago || '-'}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(item.saldo_cliente)}</td>
                    <td className="px-3 py-3">{item.referencia || '-'}</td>
                    <td className="px-3 py-3">{formatDateTime(item.fecha)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditAbonoCartera(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteAbonoCartera(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {abonosCartera.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'auditorias' && (
        <section className={`${sectionShellClass} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Auditorias</h2>
              <p className="text-sm text-[#6a3f43]/70">Registro de cambios y trazabilidad.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateDialog(CREATE_DIALOGS.auditorias)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                  <th className="px-3 py-3">Modulo</th>
                  <th className="px-3 py-3">Entidad</th>
                  <th className="px-3 py-3">Accion</th>
                  <th className="px-3 py-3">Detalle</th>
                  <th className="px-3 py-3">Usuario</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {auditorias.map((item) => (
                  <tr key={item.id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                    <td className="px-3 py-3 font-semibold">{item.modulo}</td>
                    <td className="px-3 py-3">{item.entidad}</td>
                    <td className="px-3 py-3">{item.accion}</td>
                    <td className="px-3 py-3 text-xs">{item.detalle || '-'}</td>
                    <td className="px-3 py-3">{item.usuario}</td>
                    <td className="px-3 py-3">{formatDateTime(item.fecha)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditAuditoria(item)} className="inline-flex items-center gap-1 rounded-full border border-[#f6c8c7] px-3 py-1.5 text-xs font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button onClick={() => handleDeleteAuditoria(item)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {auditorias.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                      No hay registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'informes' && (
        <section className={`${sectionShellClass} space-y-4 p-4 sm:p-5`}>
          <div>
            <h2 className="text-xl font-bold text-[#6a3f43] sm:text-2xl">Informes por categorias</h2>
            <p className="text-sm text-[#6a3f43]/70">Resumen de desempeño y lectura ejecutiva.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#eebbbb]/60 bg-[#fdf1f1] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#6a3f43]/55">Ventas registradas</p>
              <p className="mt-2 text-2xl font-black text-[#6a3f43]">{informes.ventas_totales}</p>
            </div>
            <div className="rounded-2xl border border-[#eebbbb]/60 bg-[#fdf1f1] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#6a3f43]/55">Facturacion total</p>
              <p className="mt-2 text-2xl font-black text-[#6a3f43]">{formatMoney(informes.facturacion_total)}</p>
            </div>
            <div className="rounded-2xl border border-[#eebbbb]/60 bg-[#fdf1f1] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#6a3f43]/55">Vendedor top</p>
              <p className="mt-2 text-xl font-black text-[#6a3f43]">
                {informes.vendedor_mas_vendedor ? informes.vendedor_mas_vendedor.vendedor : 'Sin datos'}
              </p>
              <p className="text-sm text-[#6a3f43]/75">
                {informes.vendedor_mas_vendedor
                  ? `${informes.vendedor_mas_vendedor.ventas} ventas · ${formatMoney(informes.vendedor_mas_vendedor.total_vendido)}`
                  : 'Necesita ventas con vendedor asignado'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#eebbbb]/60 bg-[#fdf1f1] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#6a3f43]/55">Producto top</p>
              <p className="mt-2 text-xl font-black text-[#6a3f43]">
                {informes.producto_mas_vendido ? informes.producto_mas_vendido.producto : 'Sin datos'}
              </p>
              <p className="text-sm text-[#6a3f43]/75">
                {informes.producto_mas_vendido
                  ? `${informes.producto_mas_vendido.unidades_vendidas} unidades · ${formatMoney(informes.producto_mas_vendido.total_vendido)}`
                  : 'Sin movimientos'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-[#eebbbb]/60 bg-white p-4">
              <h3 className="mb-3 text-base font-bold text-[#6a3f43]">Vendedores con mas ventas</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                      <th className="px-3 py-2">Vendedor</th>
                      <th className="px-3 py-2 text-right">Ventas</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {informes.vendedores_top.map((item) => (
                      <tr key={item.vendedor} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                        <td className="px-3 py-2">{item.vendedor}</td>
                        <td className="px-3 py-2 text-right">{item.ventas}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(item.total_vendido)}</td>
                      </tr>
                    ))}
                    {(!informes.vendedores_top || informes.vendedores_top.length === 0) && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                          No hay datos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-[#eebbbb]/60 bg-white p-4">
              <h3 className="mb-3 text-base font-bold text-[#6a3f43]">Productos menos vendidos</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#eebbbb]/70 text-xs uppercase tracking-[0.18em] text-[#6a3f43]/55">
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Unidades</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {informes.productos_menos_vendidos.map((item) => (
                      <tr key={item.producto_id} className="border-b border-[#fbe3e3] text-[#6a3f43]">
                        <td className="px-3 py-2">{item.producto}</td>
                        <td className="px-3 py-2 text-right">{item.unidades_vendidas}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(item.total_vendido)}</td>
                      </tr>
                    ))}
                    {(!informes.productos_menos_vendidos || informes.productos_menos_vendidos.length === 0) && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-sm text-[#6a3f43]/50">
                          No hay datos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#eebbbb]/60 bg-[#fdf1f1] p-4 text-sm text-[#6a3f43]/80">
            El ranking de vendedores solo incluye ventas guardadas con vendedor asignado.
          </div>
        </section>
      )}


      {createDialog === CREATE_DIALOGS.vendedores && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear vendedor</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateVendedor} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
               <input value={vendedorForm.username} onChange={(e) => setVendedorForm((c) => ({ ...c, username: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Usuario" required />
               <input type="password" value={vendedorForm.password} onChange={(e) => setVendedorForm((c) => ({ ...c, password: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Contraseña" required />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear vendedor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.admins && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear admin</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAdmin} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
               <input value={adminForm.username} onChange={(e) => setAdminForm((c) => ({ ...c, username: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Usuario" required />
               <input type="password" value={adminForm.password} onChange={(e) => setAdminForm((c) => ({ ...c, password: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Contraseña" required />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear admin</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.productos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-4xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear producto</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProducto} className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input value={productoForm.nombre} onChange={(e) => setProductoForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Nombre" required />
              <input value={productoForm.codigo_barras} onChange={(e) => setProductoForm((c) => ({ ...c, codigo_barras: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Código barras" />
              <select value={productoForm.catalogo} onChange={(e) => setProductoForm((c) => ({ ...c, catalogo: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none">
                <option value="tienda">Tienda</option>
                <option value="cartera">Cartera</option>
              </select>
              <input type="number" min="0" step="0.01" value={productoForm.precio_costo} onChange={(e) => setProductoForm((c) => ({ ...c, precio_costo: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Precio costo" />
              <input type="number" min="0" step="0.01" value={productoForm.precio_venta} onChange={(e) => setProductoForm((c) => ({ ...c, precio_venta: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Precio venta" />
              <input type="number" min="0" value={productoForm.stock_actual} onChange={(e) => setProductoForm((c) => ({ ...c, stock_actual: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Stock actual" />
              <input type="number" min="0" value={productoForm.stock_minimo} onChange={(e) => setProductoForm((c) => ({ ...c, stock_minimo: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Stock minimo" />
              <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear producto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.proveedores && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear proveedor</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProveedor} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={proveedorForm.nombre} onChange={(e) => setProveedorForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Nombre" required />
              <input value={proveedorForm.contacto} onChange={(e) => setProveedorForm((c) => ({ ...c, contacto: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Contacto" />
              <input value={proveedorForm.telefono} onChange={(e) => setProveedorForm((c) => ({ ...c, telefono: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Telefono" />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear proveedor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.auditorias && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear auditoria</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAuditoria} className="grid grid-cols-1 gap-3 md:grid-cols-2">
               <input value={auditoriaForm.modulo} onChange={(e) => setAuditoriaForm((c) => ({ ...c, modulo: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Módulo" required />
               <input value={auditoriaForm.entidad} onChange={(e) => setAuditoriaForm((c) => ({ ...c, entidad: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Entidad" required />
               <input value={auditoriaForm.entidad_id} onChange={(e) => setAuditoriaForm((c) => ({ ...c, entidad_id: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="ID entidad" />
               <input value={auditoriaForm.accion} onChange={(e) => setAuditoriaForm((c) => ({ ...c, accion: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Acción" required />
              <textarea value={auditoriaForm.detalle} onChange={(e) => setAuditoriaForm((c) => ({ ...c, detalle: e.target.value }))} className="min-h-28 rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none md:col-span-2" placeholder="Detalle" />
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear auditoria</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {createDialog === CREATE_DIALOGS.clientes_cartera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear cliente cartera</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClienteCartera} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={clienteCarteraForm.nombre} onChange={(e) => setClienteCarteraForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Nombre" required />
              <input value={clienteCarteraForm.documento} onChange={(e) => setClienteCarteraForm((c) => ({ ...c, documento: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Documento (opcional)" />
              <input value={clienteCarteraForm.telefono_whatsapp} onChange={(e) => setClienteCarteraForm((c) => ({ ...c, telefono_whatsapp: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Teléfono (opcional)" />
              <input type="number" min="0" value={clienteCarteraForm.limite_credito} onChange={(e) => setClienteCarteraForm((c) => ({ ...c, limite_credito: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Límite crédito" />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.clientes_tienda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear cliente tienda</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClienteTienda} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={clienteTiendaForm.nombre} onChange={(e) => setClienteTiendaForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Nombre" required />
              <input value={clienteTiendaForm.telefono_whatsapp} onChange={(e) => setClienteTiendaForm((c) => ({ ...c, telefono_whatsapp: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Teléfono (opcional)" />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.clientes_fidelizacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear cliente fidelizacion</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClienteFidelizacion} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={clienteFidelizacionForm.nombre} onChange={(e) => setClienteFidelizacionForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Nombre" required />
              <input value={clienteFidelizacionForm.telefono_whatsapp} onChange={(e) => setClienteFidelizacionForm((c) => ({ ...c, telefono_whatsapp: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Teléfono" />
              <input type="number" min="0" value={clienteFidelizacionForm.puntos_acumulados} onChange={(e) => setClienteFidelizacionForm((c) => ({ ...c, puntos_acumulados: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Puntos" />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.ventas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear venta</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal. Use JSON en 'items' similar a: {'[{"producto_id":1,"cantidad":2,"precio":10000}]'}</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateVenta} className="grid grid-cols-1 gap-3">
               <input value={ventaForm.cliente_id} onChange={(e) => setVentaForm((c) => ({ ...c, cliente_id: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="ID del cliente (opcional)" />
               <textarea value={ventaForm.items_json} onChange={(e) => setVentaForm((c) => ({ ...c, items_json: e.target.value }))} className="min-h-28 rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder='[{"producto_id":1,"cantidad":2}]' />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear venta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.pedidos_proveedor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear pedido proveedor</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePedidoProveedor} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={pedidoProveedorForm.proveedor_id} onChange={(e) => setPedidoProveedorForm((c) => ({ ...c, proveedor_id: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="ID del proveedor" required />
              <input value={pedidoProveedorForm.descripcion} onChange={(e) => setPedidoProveedorForm((c) => ({ ...c, descripcion: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Descripción" required />
              <input type="number" min="0" value={pedidoProveedorForm.monto_estimado} onChange={(e) => setPedidoProveedorForm((c) => ({ ...c, monto_estimado: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Monto estimado" />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear pedido</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.facturas_compra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear factura compra</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal. Items como JSON en 'items'.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateFacturaCompra} className="grid grid-cols-1 gap-3">
               <input value={facturaCompraForm.proveedor_id} onChange={(e) => setFacturaCompraForm((c) => ({ ...c, proveedor_id: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="ID del proveedor" required />
               <textarea value={facturaCompraForm.items_json} onChange={(e) => setFacturaCompraForm((c) => ({ ...c, items_json: e.target.value }))} className="min-h-28 rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder='[{"producto_id":1,"cantidad":2}]' />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear factura</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.gastos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear gasto</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateGasto} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={gastoForm.categoria} onChange={(e) => setGastoForm((c) => ({ ...c, categoria: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Categoria" required />
              <input value={gastoForm.descripcion} onChange={(e) => setGastoForm((c) => ({ ...c, descripcion: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Descripcion" />
              <input type="number" min="0" value={gastoForm.monto} onChange={(e) => setGastoForm((c) => ({ ...c, monto: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Monto" required />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear gasto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialog === CREATE_DIALOGS.abonos_cartera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#6a3f43]">Crear abono cartera</h3>
                <p className="text-sm text-[#6a3f43]/70">Alta rápida desde modal.</p>
              </div>
              <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] p-2 text-[#6a3f43] transition hover:bg-[#fbe3e3]" aria-label="Cerrar modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAbonoCartera} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input type="number" min="1" value={abonoCarteraForm.cliente_id} onChange={(e) => setAbonoCarteraForm((c) => ({ ...c, cliente_id: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="ID del cliente" required />
              <input type="number" min="0" step="0.01" value={abonoCarteraForm.monto} onChange={(e) => setAbonoCarteraForm((c) => ({ ...c, monto: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Monto" required />
              <select value={abonoCarteraForm.metodo_pago} onChange={(e) => setAbonoCarteraForm((c) => ({ ...c, metodo_pago: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select>
              <input value={abonoCarteraForm.referencia} onChange={(e) => setAbonoCarteraForm((c) => ({ ...c, referencia: e.target.value }))} className="rounded-xl border border-[#eebbbb] px-3 py-2 text-sm focus:border-[#eebbbb] focus:outline-none" placeholder="Referencia (opcional)" />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateDialog} className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]">Cancelar</button>
                <button type="submit" className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7]">Crear abono</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {ConfirmModal}
      <EditFormModal
        isOpen={editModalOpen}
        title={editModalTitle}
        fields={editModalFields}
        initialValues={editModalValues}
        onSave={async (values) => {
          await editOnSaveRef.current?.(values);
        }}
        onClose={() => setEditModalOpen(false)}
      />
    </div>
  );
};

export default Admin;
