import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, RefreshCw, Shield } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiPatch, apiRequest } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import useConfirm from '../components/useConfirm';
import Skeleton from '../components/Skeleton';
import EditFormModal from '../components/EditFormModal';
import { formatDateTime, formatMoney } from '../utils/format';
import AdminSection from './admin/components/AdminSection';
import AdminTable from './admin/components/AdminTable';
import CreateVendedorDialog from './admin/components/CreateDialogs/CreateVendedorDialog';
import CreateAdminDialog from './admin/components/CreateDialogs/CreateAdminDialog';
import CreateProductoDialog from './admin/components/CreateDialogs/CreateProductoDialog';
import CreateProveedorDialog from './admin/components/CreateDialogs/CreateProveedorDialog';
import CreateAuditoriaDialog from './admin/components/CreateDialogs/CreateAuditoriaDialog';
import CreateClienteCarteraDialog from './admin/components/CreateDialogs/CreateClienteCarteraDialog';
import CreateClienteTiendaDialog from './admin/components/CreateDialogs/CreateClienteTiendaDialog';
import CreateClienteFidelizacionDialog from './admin/components/CreateDialogs/CreateClienteFidelizacionDialog';
import CreateVentaDialog from './admin/components/CreateDialogs/CreateVentaDialog';
import CreatePedidoProveedorDialog from './admin/components/CreateDialogs/CreatePedidoProveedorDialog';
import CreateFacturaCompraDialog from './admin/components/CreateDialogs/CreateFacturaCompraDialog';
import CreateGastoDialog from './admin/components/CreateDialogs/CreateGastoDialog';
import CreateAbonoCarteraDialog from './admin/components/CreateDialogs/CreateAbonoCarteraDialog';

const ROLE_GROUPS = [
  {
    role: 'Vendedor',
      modules: [
        { id: 'productos', label: 'Productos' },
        { id: 'proveedores', label: 'Proveedores' },
        { id: 'facturas_compra', label: 'Facturas compra' },
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

const Admin = ({ moduleKey: moduleKeyProp }) => {
  const { moduleKey: moduleKeyParam } = useParams();
  const moduleKey = (moduleKeyProp ?? moduleKeyParam ?? null)?.replace(/-/g, '_');
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

  const [createDialog, setCreateDialog] = useState(null);

  useEffect(() => {
    if (moduleKey) {
      setActiveTab(moduleKey);
    }
  }, [moduleKey]);

  const notifyError = useCallback((message) => {
    setSuccess('');
    setError(message);
  }, []);

  const notifySuccess = useCallback((message) => {
    setError('');
    setSuccess(message);
  }, []);

  const openCreateDialog = useCallback((dialogKey) => {
    setError('');
    setSuccess('');
    setCreateDialog(dialogKey);
  }, []);

  const closeCreateDialog = useCallback(() => {
    setCreateDialog(null);
  }, []);

  const request = useCallback(async ({ endpoint, method = 'GET', body, signal }) => {
    return apiRequest(endpoint, {
      method,
      signal,
      body,
    });
  }, []);

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
        request({ endpoint: '/api/superadmin/facturas-compra', signal }),
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
  }, [request]);

  const handleCreated = useCallback((message) => {
    loadAll();
    notifySuccess(message);
    closeCreateDialog();
  }, [loadAll, notifySuccess, closeCreateDialog]);

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
  }, [token, isSuperAdmin, loadAll, notifyError]);

  const handleRefresh = useCallback(async () => {
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
  }, [loadAll, notifySuccess, notifyError]);

  const runDelete = useCallback(async ({ endpoint, successMessage }) => {
    await apiDelete(endpoint);

    await loadAll();
    notifySuccess(successMessage);
  }, [loadAll, notifySuccess]);

  const openEditModal = useCallback((title, fields, initialValues, onSave) => {
    setEditModalTitle(title);
    setEditModalFields(fields);
    setEditModalValues(initialValues);
    editOnSaveRef.current = onSave;
    setEditModalOpen(true);
  }, []);

  const handleEditClienteCartera = useCallback((item) => {
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
  }, [openEditModal, request, loadAll, notifySuccess]);

  const handleDeleteClienteCartera = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar cliente', message: `Eliminar cliente ${item.nombre}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/cartera/clientes/${item.id}`,
        successMessage: 'Cliente eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar cliente');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditClienteTienda = useCallback((item) => {
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
  }, [openEditModal, request, loadAll, notifySuccess]);

  const handleDeleteClienteTienda = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar cliente', message: `Eliminar cliente ${item.nombre}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/clientes/tienda-fiado/${item.id}`,
        successMessage: 'Cliente tienda eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar cliente tienda');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditClienteFidelizacion = useCallback((item) => {
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
  }, [openEditModal, notifyError, request, loadAll, notifySuccess]);

  const handleDeleteClienteFidelizacion = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar cliente', message: `Eliminar cliente ${item.nombre}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/fidelizacion/clientes/${item.id}`,
        successMessage: 'Cliente fidelizacion eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar cliente fidelizacion');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditVenta = useCallback((item) => {
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
  }, [openEditModal, notifyError, request, loadAll, notifySuccess]);

  const handleDeleteVenta = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar venta', message: `Eliminar venta ${item.venta_id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/ventas/${item.venta_id}`,
        successMessage: 'Venta eliminada',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar venta');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditPedidoProveedor = useCallback((item) => {
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
  }, [openEditModal, notifyError, request, loadAll, notifySuccess]);

  const handleDeletePedidoProveedor = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar pedido', message: `Eliminar pedido ${item.id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/proveedores/pedidos/${item.id}`,
        successMessage: 'Pedido eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar pedido');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditFacturaCompra = useCallback((item) => {
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
  }, [openEditModal, notifyError, request, loadAll, notifySuccess]);

  const handleDeleteFacturaCompra = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar factura', message: `Eliminar factura ${item.id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/facturas-compra/${item.id}`,
        successMessage: 'Factura eliminada',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar factura');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditGasto = useCallback((item) => {
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
  }, [openEditModal, notifyError, request, loadAll, notifySuccess]);

  const handleDeleteGasto = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar gasto', message: `Eliminar gasto ${item.id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/gastos/${item.id}`,
        successMessage: 'Gasto eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar gasto');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditAbonoCartera = useCallback((item) => {
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
  }, [openEditModal, notifyError, request, loadAll, notifySuccess]);

  const handleDeleteAbonoCartera = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar abono', message: `Eliminar abono ${item.id}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/cartera/abonos/${item.id}`,
        successMessage: 'Abono eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar abono');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditAdmin = useCallback((item) => {
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
  }, [openEditModal, request, loadAll, notifySuccess]);

  const handleDeleteAdmin = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar admin', message: `Eliminar admin ${item.username}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/superadmin/usuarios/admins/${item.id}`,
        successMessage: 'Admin eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar admin');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditVendedor = useCallback((item) => {
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
  }, [openEditModal, request, loadAll, notifySuccess]);

  const handleDeleteVendedor = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar vendedor', message: `Eliminar vendedor ${item.username}?` }); if (!confirmed) return;
    try {
      await runDelete({
        endpoint: `/api/superadmin/usuarios/vendedores/${item.id}`,
        successMessage: 'Vendedor eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar vendedor');
    }
  }, [confirm, runDelete, notifyError]);

  const handleEditProducto = useCallback((item) => {
    openEditModal(
      'Editar producto',
      [
      { name: 'nombre', label: 'Nombre', type: 'text', required: true },
      { name: 'contacto', label: 'Contacto', type: 'text' },
      { name: 'telefono', label: 'Telefono', type: 'text' },
      { name: 'activo', label: 'Activo', type: 'checkbox' },
    ],
    { nombre: item.nombre, contacto: item.contacto ?? '', telefono: item.telefono ?? '', activo: item.activo ?? true },
    async (values) => {
      await request({
        endpoint: `/api/proveedores/${item.id}`,
        method: 'PATCH',
        body: { nombre: values.nombre.trim(), contacto: values.contacto.trim() || null, telefono: values.telefono.trim() || null, activo: values.activo },
      });
        await loadAll();
        notifySuccess('Producto actualizado');
      },
    );
  }, [openEditModal, notifyError, request, loadAll, notifySuccess]);

  const handleDeleteProducto = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar producto', message: `Eliminar producto ${item.nombre}?` }); if (!confirmed) return;
    try {
      await apiDelete(`/api/productos/${item.id}`);
      await loadAll();
      notifySuccess('Producto eliminado');
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar producto');
    }
  }, [confirm, loadAll, notifySuccess, notifyError]);

  const handleToggleProductoActivo = useCallback(async (item) => {
    try {
      await apiPatch(`/api/productos/${item.id}`, { activo: !item.activo });
      await loadAll();
      notifySuccess(item.activo ? 'Producto desactivado' : 'Producto activado');
    } catch (err) {
      notifyError(err.message || 'Error al cambiar estado');
    }
  }, [loadAll, notifySuccess, notifyError]);

  const handleToggleProveedorActivo = useCallback(async (item) => {
    try {
      await apiRequest(`/api/proveedores/${item.id}/toggle-activo`, { method: 'PUT' });
      await loadAll();
      notifySuccess(item.activo ? 'Proveedor desactivado' : 'Proveedor activado');
    } catch (err) {
      notifyError(err.message || 'Error al cambiar estado');
    }
  }, [loadAll, notifySuccess, notifyError]);

  const handleEditProveedor = useCallback((item) => {
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
  }, [openEditModal, request, loadAll, notifySuccess]);

  const handleDeleteProveedor = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar proveedor', message: `Eliminar permanentemente ${item.nombre}?` }); if (!confirmed) return;
    try {
      await apiDelete(`/api/proveedores/${item.id}`);
      await loadAll();
      notifySuccess('Proveedor eliminado');
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar proveedor');
    }
  }, [confirm, loadAll, notifySuccess, notifyError]);

  const handleEditAuditoria = useCallback((item) => {
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
  }, [openEditModal, request, loadAll, notifySuccess]);

  const handleDeleteAuditoria = useCallback(async (item) => {
    const confirmed = await confirm({ title: 'Eliminar auditoría', message: `Eliminar auditoría ${item.id}?` }); if (!confirmed) return;
    try {
      await apiDelete(`/api/auditorias/${item.id}`);
      await loadAll();
      notifySuccess('Auditoria eliminada');
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar auditoria');
    }
  }, [confirm, loadAll, notifySuccess, notifyError]);

  const tabSections = useMemo(() => [
    { key: 'vendedores', title: 'Vendedores', desc: 'Acceso restringido y altas por modal.', data: vendedores, createDialog: 'vendedores',
      columns: [
        { key: 'id', label: 'ID', mono: true }, { key: 'username', label: 'Username' }, { key: 'rol', label: 'Rol' },
      ], onEdit: handleEditVendedor, onDelete: handleDeleteVendedor, minWidth: '640px' },
    { key: 'admins', title: 'Administradores', desc: 'Acceso y control de admins.', data: admins, createDialog: 'admins',
      columns: [
        { key: 'id', label: 'ID', mono: true }, { key: 'username', label: 'Username' }, { key: 'rol', label: 'Rol' },
      ], onEdit: handleEditAdmin, onDelete: handleDeleteAdmin, minWidth: '640px' },
    { key: 'productos', title: 'Productos', desc: 'Inventario y precios con control visual.', data: productos, createDialog: 'productos',
      columns: [
        { key: 'nombre', label: 'Nombre', mono: true },
        { key: 'proveedor_nombre', label: 'Proveedor' },
        { key: 'precio_costo', label: 'Costo', align: 'right', render: (i) => formatMoney(i.precio_costo) },
        { key: 'precio_venta', label: 'Venta', align: 'right', render: (i) => formatMoney(i.precio_venta) },
        { key: 'stock_actual', label: 'Stock', align: 'right' }, { key: 'stock_minimo', label: 'Min', align: 'right' },
        { key: 'activo', label: 'Activo', align: 'right', render: (i) => i.activo ? '✅' : '❌' },
      ], onEdit: handleEditProducto, onDelete: handleDeleteProducto, onToggle: handleToggleProductoActivo, minWidth: '900px' },
    { key: 'proveedores', title: 'Proveedores', desc: 'Catálogo de contactos y pedidos.', data: proveedores, createDialog: 'proveedores',
      columns: [
        { key: 'nombre', label: 'Nombre', mono: true }, { key: 'contacto', label: 'Contacto' }, { key: 'telefono', label: 'Telefono' },
        { key: 'activo', label: 'Activo', align: 'right', render: (i) => i.activo ? '✅' : '❌' },
      ], onEdit: handleEditProveedor, onDelete: handleDeleteProveedor, onToggle: handleToggleProveedorActivo, minWidth: '760px' },
    { key: 'clientes_cartera', title: 'Clientes cartera', desc: 'Clientes con cupo y deuda.', data: clientesCartera, createDialog: 'clientes_cartera',
      columns: [
        { key: 'id', label: 'ID', mono: true }, { key: 'nombre', label: 'Nombre' }, { key: 'documento', label: 'Documento' },
        { key: 'telefono_whatsapp', label: 'Telefono' },
        { key: 'limite_credito', label: 'Limite', align: 'right', render: (i) => formatMoney(i.limite_credito) },
        { key: 'deuda_total', label: 'Deuda', align: 'right', render: (i) => formatMoney(i.deuda_total) },
      ], onEdit: handleEditClienteCartera, onDelete: handleDeleteClienteCartera, minWidth: '860px' },
    { key: 'clientes_tienda', title: 'Clientes tienda', desc: 'Clientes fiados de tienda.', data: clientesTienda, createDialog: 'clientes_tienda',
      columns: [
        { key: 'id', label: 'ID', mono: true }, { key: 'nombre', label: 'Nombre' }, { key: 'telefono_whatsapp', label: 'Telefono' },
      ], onEdit: handleEditClienteTienda, onDelete: handleDeleteClienteTienda, minWidth: '520px' },
    { key: 'clientes_fidelizacion', title: 'Clientes fidelización', desc: 'Puntos y contacto.', data: clientesFidelizacion, createDialog: 'clientes_fidelizacion',
      columns: [
        { key: 'id', label: 'ID', mono: true }, { key: 'nombre', label: 'Nombre' }, { key: 'telefono_whatsapp', label: 'Telefono' },
        { key: 'puntos_acumulados', label: 'Puntos', align: 'right' },
      ], onEdit: handleEditClienteFidelizacion, onDelete: handleDeleteClienteFidelizacion, minWidth: '620px' },
    { key: 'ventas', title: 'Ventas', desc: 'Historial completo de ventas.', data: ventas, createDialog: 'ventas',
      columns: [
        { key: 'venta_id', label: 'ID', mono: true },
        { key: 'cliente_nombre', label: 'Cliente', render: (i) => i.cliente_nombre || '-' },
        { key: 'es_fiado', label: 'Fiado', render: (i) => i.es_fiado ? 'Sí' : 'No' },
        { key: 'total', label: 'Total', align: 'right', render: (i) => formatMoney(i.total) },
        { key: 'saldo_pendiente', label: 'Saldo', align: 'right', render: (i) => formatMoney(i.saldo_pendiente) },
        { key: 'metodo_pago', label: 'Metodo' },
        { key: 'fecha', label: 'Fecha', render: (i) => formatDateTime(i.fecha) },
      ], onEdit: handleEditVenta, onDelete: handleDeleteVenta, minWidth: '920px' },
    { key: 'pedidos_proveedor', title: 'Pedidos proveedor', desc: 'Solicitudes enviadas a proveedor.', data: pedidosProveedor, createDialog: 'pedidos_proveedor',
      columns: [
        { key: 'id', label: 'ID', mono: true }, { key: 'proveedor_nombre', label: 'Proveedor' }, { key: 'descripcion', label: 'Descripcion' },
        { key: 'monto_estimado', label: 'Monto', align: 'right', render: (i) => formatMoney(i.monto_estimado) },
        { key: 'estado', label: 'Estado' }, { key: 'creado_por', label: 'Creado por' },
        { key: 'fecha_creacion', label: 'Fecha', render: (i) => formatDateTime(i.fecha_creacion) },
      ], onEdit: handleEditPedidoProveedor, onDelete: handleDeletePedidoProveedor, minWidth: '900px' },
    { key: 'facturas_compra', title: 'Facturas compra', desc: 'Ingresos de factura con detalle.', data: facturasCompra, createDialog: 'facturas_compra',
      columns: [
        { key: 'id', label: 'ID', mono: true }, { key: 'numero_factura', label: 'No. Factura' },
        { key: 'proveedor_nombre', label: 'Proveedor' },
        { key: 'subtotal', label: 'Subtotal', align: 'right', render: (i) => formatMoney(i.subtotal) },
        { key: 'total_iva', label: 'IVA', align: 'right', render: (i) => formatMoney(i.total_iva) },
        { key: 'total_factura', label: 'Total', align: 'right', render: (i) => formatMoney(i.total_factura) },
        { key: 'items', label: 'Items', render: (i) => i.items?.length || 0 },
        { key: 'fecha_creacion', label: 'Fecha', render: (i) => formatDateTime(i.fecha_creacion) },
      ], onEdit: handleEditFacturaCompra, onDelete: handleDeleteFacturaCompra, minWidth: '1100px' },
    { key: 'gastos', title: 'Gastos', desc: 'Gastos operativos.', data: gastos, createDialog: 'gastos',
      columns: [
        { key: 'id', label: 'ID', mono: true }, { key: 'categoria', label: 'Categoria' }, { key: 'descripcion', label: 'Descripcion' },
        { key: 'monto', label: 'Monto', align: 'right', render: (i) => formatMoney(i.monto) },
        { key: 'fecha', label: 'Fecha', render: (i) => formatDateTime(i.fecha) },
        { key: 'registrado_por', label: 'Registrado por' },
      ], onEdit: handleEditGasto, onDelete: handleDeleteGasto, minWidth: '880px' },
    { key: 'abonos_cartera', title: 'Abonos cartera', desc: 'Abonos registrados en cartera.', data: abonosCartera, createDialog: 'abonos_cartera',
      columns: [
        { key: 'id', label: 'ID', mono: true },
        { key: 'cliente', label: 'Cliente', render: (i) => clientesCartera.find((c) => c.id === i.cliente_id)?.nombre || i.cliente_id },
        { key: 'monto', label: 'Monto', align: 'right', render: (i) => formatMoney(i.monto) },
        { key: 'metodo_pago', label: 'Metodo' },
        { key: 'saldo_cliente', label: 'Saldo', align: 'right', render: (i) => formatMoney(i.saldo_cliente) },
        { key: 'referencia', label: 'Referencia' },
        { key: 'fecha', label: 'Fecha', render: (i) => formatDateTime(i.fecha) },
      ], onEdit: handleEditAbonoCartera, onDelete: handleDeleteAbonoCartera, minWidth: '1000px' },
    { key: 'auditorias', title: 'Auditorías', desc: 'Registro de cambios y trazabilidad.', data: auditorias, createDialog: 'auditorias',
      columns: [
        { key: 'modulo', label: 'Modulo', mono: true }, { key: 'entidad', label: 'Entidad' }, { key: 'accion', label: 'Accion' },
        { key: 'detalle', label: 'Detalle' }, { key: 'usuario', label: 'Usuario' },
        { key: 'fecha', label: 'Fecha', render: (i) => formatDateTime(i.fecha) },
      ], onEdit: handleEditAuditoria, onDelete: handleDeleteAuditoria, minWidth: '1000px' },
  ], [
    vendedores, admins, productos, proveedores,
    clientesCartera, clientesTienda, clientesFidelizacion,
    ventas, pedidosProveedor, facturasCompra, gastos, abonosCartera, auditorias,
    handleEditVendedor, handleDeleteVendedor,
    handleEditAdmin, handleDeleteAdmin,
    handleEditProducto, handleDeleteProducto,
    handleEditProveedor, handleDeleteProveedor,
    handleEditClienteCartera, handleDeleteClienteCartera,
    handleEditClienteTienda, handleDeleteClienteTienda,
    handleEditClienteFidelizacion, handleDeleteClienteFidelizacion,
    handleEditVenta, handleDeleteVenta,
    handleEditPedidoProveedor, handleDeletePedidoProveedor,
    handleEditFacturaCompra, handleDeleteFacturaCompra,
    handleEditGasto, handleDeleteGasto,
    handleEditAbonoCartera, handleDeleteAbonoCartera,
    handleEditAuditoria, handleDeleteAuditoria,
  ]);

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

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-blush-300/70 bg-[linear-gradient(135deg,#fdf1f1_0%,#fbe3e3_52%,#f9d6d5_100%)] p-5 shadow-[0_24px_70px_rgba(106,63,67,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blush-300/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-rosewood">
              <Shield className="h-3.5 w-3.5" />
              Panel administrativo
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-rosewood sm:text-4xl">Panel de Administración</h1>
            <p className="mt-2 max-w-2xl text-sm text-rosewood/80 sm:text-base">
              Gestiona usuarios, productos, ventas y más desde un solo lugar.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-blush-300 px-4 py-2.5 text-sm font-semibold text-rosewood transition hover:bg-blush-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        </div>
      </section>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      {!moduleKey && (
        <div className="rounded-2xl border border-blush-300 bg-white/80 px-4 py-3 text-xs text-rosewood/80 shadow-sm sm:text-sm">
          Resumen: Admins {admins.length} · Vendedores {vendedores.length} · Productos {productos.length} · Proveedores {proveedores.length} · Auditorias {auditorias.length} · Facturacion {formatMoney(informes.facturacion_total)}
        </div>
      )}

      {!moduleKey && (
        <div className="space-y-3">
          {ROLE_GROUPS.map((group) => {
            const isExpanded = expandedRole === group.role;
            return (
              <div key={group.role} className="rounded-[28px] border border-blush-300/70 bg-white/90 shadow-[0_16px_40px_rgba(106,63,67,0.06)]">
                <button
                  type="button"
                  onClick={() => setExpandedRole(isExpanded ? '' : group.role)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-blush-50"
                >
                  <span className="text-sm font-bold uppercase tracking-[0.08em] text-rosewood">
                    {group.role}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-rosewood" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-rosewood" />
                  )}
                </button>
                {isExpanded && (
                  <div className="border-t border-blush-300/50 px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {group.modules.map((mod) => (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => setActiveTab(mod.id)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                            activeTab === mod.id
                              ? 'bg-rosewood text-blush-50'
                              : 'bg-blush-50 text-rosewood hover:bg-blush-50'
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

      {tabSections.map((section) => (
        activeTab === section.key && (
          <AdminSection
            key={section.key}
            title={section.title}
            description={section.desc}
            onCreate={() => openCreateDialog(section.createDialog)}
          >
            <AdminTable
              columns={section.columns}
              data={section.data}
              onEdit={section.onEdit}
              onDelete={section.onDelete}
              onToggle={section.onToggle}
              minWidth={section.minWidth}
            />
          </AdminSection>
        )
      ))}

      {activeTab === 'informes' && (
        <section className={`rounded-[28px] border border-blush-300/70 bg-white/90 p-4 shadow-[0_20px_50px_rgba(106,63,67,0.08)] backdrop-blur sm:p-5 space-y-4`}>
          <div>
            <h2 className="text-xl font-bold text-rosewood sm:text-2xl">Informes por categorias</h2>
            <p className="text-sm text-rosewood/70">Resumen de desempeño y lectura ejecutiva.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-blush-300/60 bg-blush-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-rosewood/55">Ventas registradas</p>
              <p className="mt-2 text-2xl font-black text-rosewood">{informes.ventas_totales}</p>
            </div>
            <div className="rounded-2xl border border-blush-300/60 bg-blush-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-rosewood/55">Facturacion total</p>
              <p className="mt-2 text-2xl font-black text-rosewood">{formatMoney(informes.facturacion_total)}</p>
            </div>
            <div className="rounded-2xl border border-blush-300/60 bg-blush-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-rosewood/55">Vendedor top</p>
              <p className="mt-2 text-xl font-black text-rosewood">
                {informes.vendedor_mas_vendedor ? informes.vendedor_mas_vendedor.vendedor : 'Sin datos'}
              </p>
              <p className="text-sm text-rosewood/75">
                {informes.vendedor_mas_vendedor
                  ? `${informes.vendedor_mas_vendedor.ventas} ventas · ${formatMoney(informes.vendedor_mas_vendedor.total_vendido)}`
                  : 'Necesita ventas con vendedor asignado'}
              </p>
            </div>
            <div className="rounded-2xl border border-blush-300/60 bg-blush-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-rosewood/55">Producto top</p>
              <p className="mt-2 text-xl font-black text-rosewood">
                {informes.producto_mas_vendido ? informes.producto_mas_vendido.producto : 'Sin datos'}
              </p>
              <p className="text-sm text-rosewood/75">
                {informes.producto_mas_vendido
                  ? `${informes.producto_mas_vendido.unidades_vendidas} unidades · ${formatMoney(informes.producto_mas_vendido.total_vendido)}`
                  : 'Sin movimientos'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-blush-300/60 bg-white p-4">
              <h3 className="mb-3 text-base font-bold text-rosewood">Vendedores con mas ventas</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-blush-300/70 text-xs uppercase tracking-[0.18em] text-rosewood/55">
                      <th className="px-3 py-2">Vendedor</th>
                      <th className="px-3 py-2 text-right">Ventas</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {informes.vendedores_top.map((item) => (
                      <tr key={item.vendedor} className="border-b border-blush-50 text-rosewood">
                        <td className="px-3 py-2">{item.vendedor}</td>
                        <td className="px-3 py-2 text-right">{item.ventas}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(item.total_vendido)}</td>
                      </tr>
                    ))}
                    {(!informes.vendedores_top || informes.vendedores_top.length === 0) && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-sm text-rosewood/50">
                          No hay datos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-blush-300/60 bg-white p-4">
              <h3 className="mb-3 text-base font-bold text-rosewood">Productos menos vendidos</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-blush-300/70 text-xs uppercase tracking-[0.18em] text-rosewood/55">
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Unidades</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {informes.productos_menos_vendidos.map((item) => (
                      <tr key={item.producto_id} className="border-b border-blush-50 text-rosewood">
                        <td className="px-3 py-2">{item.producto}</td>
                        <td className="px-3 py-2 text-right">{item.unidades_vendidas}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(item.total_vendido)}</td>
                      </tr>
                    ))}
                    {(!informes.productos_menos_vendidos || informes.productos_menos_vendidos.length === 0) && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-sm text-rosewood/50">
                          No hay datos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-blush-300/60 bg-blush-50 p-4 text-sm text-rosewood/80">
            El ranking de vendedores solo incluye ventas guardadas con vendedor asignado.
          </div>
        </section>
      )}


      <CreateVendedorDialog isOpen={createDialog === CREATE_DIALOGS.vendedores} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateAdminDialog isOpen={createDialog === CREATE_DIALOGS.admins} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateProductoDialog isOpen={createDialog === CREATE_DIALOGS.productos} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateProveedorDialog isOpen={createDialog === CREATE_DIALOGS.proveedores} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateAuditoriaDialog isOpen={createDialog === CREATE_DIALOGS.auditorias} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateClienteCarteraDialog isOpen={createDialog === CREATE_DIALOGS.clientes_cartera} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateClienteTiendaDialog isOpen={createDialog === CREATE_DIALOGS.clientes_tienda} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateClienteFidelizacionDialog isOpen={createDialog === CREATE_DIALOGS.clientes_fidelizacion} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateVentaDialog isOpen={createDialog === CREATE_DIALOGS.ventas} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreatePedidoProveedorDialog isOpen={createDialog === CREATE_DIALOGS.pedidos_proveedor} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateFacturaCompraDialog isOpen={createDialog === CREATE_DIALOGS.facturas_compra} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateGastoDialog isOpen={createDialog === CREATE_DIALOGS.gastos} onClose={closeCreateDialog} onCreated={handleCreated} />
      <CreateAbonoCarteraDialog isOpen={createDialog === CREATE_DIALOGS.abonos_cartera} onClose={closeCreateDialog} onCreated={handleCreated} />
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
