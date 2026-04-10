import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw, Shield } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiRequest } from '../api/httpClient';

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
  });
};

const TAB_ITEMS = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'vendedores', label: 'Vendedores' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'productos', label: 'Productos' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'fidelizacion', label: 'Fidelizacion' },
  { id: 'auditorias', label: 'Auditorias' },
];

const Admin = () => {
  const { token, isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState('ventas');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clientesTienda, setClientesTienda] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [fidelizacion, setFidelizacion] = useState([]);
  const [auditorias, setAuditorias] = useState([]);

  const [vendedorForm, setVendedorForm] = useState({
    username: '',
    password: '',
  });

  const [ventaForm, setVentaForm] = useState({
    producto_id: '',
    cantidad: '1',
    es_fiado: false,
    fiado_origen: 'tienda',
    cliente_id: '',
    cliente_tienda_id: '',
  });

  const [clienteForm, setClienteForm] = useState({
    nombre: '',
    documento: '',
    telefono_whatsapp: '',
    limite_credito: '',
  });

  const [proveedorForm, setProveedorForm] = useState({
    nombre: '',
    contacto: '',
    telefono: '',
  });

  const [productoForm, setProductoForm] = useState({
    nombre: '',
    precio_costo: '',
    precio_venta: '',
    stock_actual: '',
    stock_minimo: '',
    catalogo: 'tienda',
  });

  const [gastoForm, setGastoForm] = useState({
    categoria: 'servicios',
    descripcion: '',
    monto: '',
  });

  const [fidelizacionForm, setFidelizacionForm] = useState({
    nombre: '',
    telefono_whatsapp: '',
    puntos_acumulados: '0',
  });

  const [auditoriaForm, setAuditoriaForm] = useState({
    modulo: '',
    entidad: '',
    entidad_id: '',
    accion: '',
    detalle: '',
  });

  const notifyError = (message) => {
    setSuccess('');
    setError(message);
  };

  const notifySuccess = (message) => {
    setError('');
    setSuccess(message);
  };

  const request = async ({ endpoint, method = 'GET', body, signal }) => {
    return apiRequest(endpoint, {
      method,
      signal,
      body,
    });
  };

  const loadAll = useCallback(async (signal) => {
    const [
      ventasPayload,
      clientesPayload,
      clientesTiendaPayload,
      proveedoresPayload,
      productosPayload,
      gastosPayload,
      fidelizacionPayload,
      auditoriasPayload,
    ] = await Promise.all([
      request({ endpoint: '/api/ventas', signal }),
      request({ endpoint: '/api/clientes', signal }),
      request({ endpoint: '/api/clientes/tienda-fiado', signal }),
      request({ endpoint: '/api/proveedores', signal }),
      request({ endpoint: '/api/productos', signal }),
      request({ endpoint: '/api/gastos', signal }),
      request({ endpoint: '/api/fidelizacion/clientes', signal }),
      request({ endpoint: '/api/auditorias', signal }),
    ]);

    setVentas(Array.isArray(ventasPayload) ? ventasPayload : []);
    setClientes(Array.isArray(clientesPayload) ? clientesPayload : []);
    setClientesTienda(Array.isArray(clientesTiendaPayload) ? clientesTiendaPayload : []);
    setProveedores(Array.isArray(proveedoresPayload) ? proveedoresPayload : []);
    setProductos(Array.isArray(productosPayload) ? productosPayload : []);
    setGastos(Array.isArray(gastosPayload) ? gastosPayload : []);
    setFidelizacion(Array.isArray(fidelizacionPayload) ? fidelizacionPayload : []);
    setAuditorias(Array.isArray(auditoriasPayload) ? auditoriasPayload : []);

    if (isSuperAdmin) {
      const vendedoresPayload = await request({ endpoint: '/api/usuarios/vendedores', signal });
      setVendedores(Array.isArray(vendedoresPayload) ? vendedoresPayload : []);
    } else {
      setVendedores([]);
    }
  }, [token, isSuperAdmin]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        await loadAll(controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        notifyError(err.message || 'No se pudo cargar el modulo admin');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => controller.abort();
  }, [loadAll, token]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadAll();
      notifySuccess('Datos actualizados');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar');
    } finally {
      setRefreshing(false);
    }
  };

  const ventasCartera = useMemo(
    () => ventas.filter((item) => item.fiado_origen === 'cartera'),
    [ventas],
  );

  const runDelete = async ({ endpoint, successMessage }) => {
    await apiDelete(endpoint);

    await loadAll();
    notifySuccess(successMessage);
  };

  const handleCreateVenta = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const productoId = Number(ventaForm.producto_id);
    const cantidad = Number(ventaForm.cantidad);

    if (!Number.isInteger(productoId) || productoId <= 0) {
      notifyError('Selecciona un producto para la venta');
      return;
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      notifyError('La cantidad debe ser mayor que cero');
      return;
    }

    const payload = {
      items: [{ producto_id: productoId, cantidad }],
      es_fiado: ventaForm.es_fiado,
    };

    if (ventaForm.es_fiado) {
      payload.fiado_origen = ventaForm.fiado_origen;
      if (ventaForm.fiado_origen === 'cartera') {
        payload.cliente_id = Number(ventaForm.cliente_id || 0);
      } else {
        payload.cliente_tienda_id = Number(ventaForm.cliente_tienda_id || 0);
      }
    }

    try {
      await request({ endpoint: '/api/ventas', method: 'POST', body: payload });
      await loadAll();
      setVentaForm({
        producto_id: '',
        cantidad: '1',
        es_fiado: false,
        fiado_origen: 'tienda',
        cliente_id: '',
        cliente_tienda_id: '',
      });
      notifySuccess('Venta creada correctamente');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear la venta');
    }
  };

  const handleEditVenta = async (venta) => {
    if (venta.fiado_origen === 'cartera') {
      notifyError('Las ventas de cartera se editan desde el modulo de cartera');
      return;
    }

    const totalRaw = window.prompt('Nuevo total de la venta', String(venta.total));
    if (totalRaw === null) return;

    const total = Number(totalRaw);
    if (!Number.isFinite(total) || total < 0) {
      notifyError('Total invalido');
      return;
    }

    const payload = {
      total,
      es_fiado: Boolean(venta.es_fiado),
    };

    if (venta.es_fiado) {
      const saldoRaw = window.prompt('Nuevo saldo pendiente', String(venta.saldo_pendiente));
      if (saldoRaw === null) return;
      const saldo = Number(saldoRaw);
      if (!Number.isFinite(saldo) || saldo < 0) {
        notifyError('Saldo invalido');
        return;
      }

      payload.saldo_pendiente = saldo;
      payload.fiado_origen = 'tienda';
      payload.cliente_tienda_id = venta.cliente_tienda_id;
    }

    try {
      await request({
        endpoint: `/api/ventas/${venta.venta_id}`,
        method: 'PATCH',
        body: payload,
      });
      await loadAll();
      notifySuccess('Venta actualizada');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar la venta');
    }
  };

  const handleDeleteVenta = async (venta) => {
    if (!window.confirm(`Eliminar venta #${venta.venta_id}?`)) return;

    try {
      await runDelete({
        endpoint: `/api/ventas/${venta.venta_id}`,
        successMessage: 'Venta eliminada',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar la venta');
    }
  };

  const handleCreateCliente = async (event) => {
    event.preventDefault();

    try {
      await request({
        endpoint: '/api/cartera/clientes',
        method: 'POST',
        body: {
          nombre: clienteForm.nombre.trim(),
          documento: clienteForm.documento.trim() || null,
          telefono_whatsapp: clienteForm.telefono_whatsapp.trim() || null,
          limite_credito: Number(clienteForm.limite_credito),
        },
      });
      await loadAll();
      setClienteForm({ nombre: '', documento: '', telefono_whatsapp: '', limite_credito: '' });
      notifySuccess('Cliente creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear el cliente');
    }
  };

  const handleEditCliente = async (cliente) => {
    const nombre = window.prompt('Nombre', cliente.nombre);
    if (nombre === null) return;
    const documento = window.prompt('Documento', cliente.documento || '');
    if (documento === null) return;
    const telefono = window.prompt('Telefono WhatsApp', cliente.telefono_whatsapp || '');
    if (telefono === null) return;
    const limiteRaw = window.prompt('Limite de credito', String(cliente.limite_credito));
    if (limiteRaw === null) return;
    const limite = Number(limiteRaw);

    if (!Number.isFinite(limite) || limite <= 0) {
      notifyError('Limite de credito invalido');
      return;
    }

    try {
      await request({
        endpoint: `/api/cartera/clientes/${cliente.id}`,
        method: 'PATCH',
        body: {
          nombre: nombre.trim(),
          documento: documento.trim() || null,
          telefono_whatsapp: telefono.trim() || null,
          limite_credito: limite,
        },
      });
      await loadAll();
      notifySuccess('Cliente actualizado');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar el cliente');
    }
  };

  const handleDeleteCliente = async (cliente) => {
    if (!window.confirm(`Eliminar cliente ${cliente.nombre}?`)) return;

    try {
      await runDelete({
        endpoint: `/api/cartera/clientes/${cliente.id}`,
        successMessage: 'Cliente eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar el cliente');
    }
  };

  const handleCreateProveedor = async (event) => {
    event.preventDefault();

    try {
      await request({
        endpoint: '/api/proveedores',
        method: 'POST',
        body: {
          nombre: proveedorForm.nombre.trim(),
          contacto: proveedorForm.contacto.trim() || null,
          telefono: proveedorForm.telefono.trim() || null,
        },
      });
      await loadAll();
      setProveedorForm({ nombre: '', contacto: '', telefono: '' });
      notifySuccess('Proveedor creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear el proveedor');
    }
  };

  const handleEditProveedor = async (item) => {
    const nombre = window.prompt('Nombre', item.nombre);
    if (nombre === null) return;
    const contacto = window.prompt('Contacto', item.contacto || '');
    if (contacto === null) return;
    const telefono = window.prompt('Telefono', item.telefono || '');
    if (telefono === null) return;
    const activoRaw = window.prompt('Activo? (si/no)', item.activo ? 'si' : 'no');
    if (activoRaw === null) return;

    try {
      await request({
        endpoint: `/api/proveedores/${item.id}`,
        method: 'PATCH',
        body: {
          nombre: nombre.trim(),
          contacto: contacto.trim() || null,
          telefono: telefono.trim() || null,
          activo: activoRaw.toLowerCase().startsWith('s'),
        },
      });
      await loadAll();
      notifySuccess('Proveedor actualizado');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar proveedor');
    }
  };

  const handleDeleteProveedor = async (item) => {
    if (!window.confirm(`Eliminar proveedor ${item.nombre}?`)) return;

    try {
      await runDelete({
        endpoint: `/api/proveedores/${item.id}`,
        successMessage: 'Proveedor eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar proveedor');
    }
  };

  const handleCreateVendedor = async (event) => {
    event.preventDefault();

    try {
      await request({
        endpoint: '/api/usuarios/vendedores',
        method: 'POST',
        body: {
          username: vendedorForm.username.trim(),
          password: vendedorForm.password,
          rol: 'vendedor',
        },
      });
      await loadAll();
      setVendedorForm({ username: '', password: '' });
      notifySuccess('Vendedor creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear el vendedor');
    }
  };

  const handleEditVendedor = async (item) => {
    const username = window.prompt('Nuevo username', item.username);
    if (username === null) return;
    const password = window.prompt('Nueva contraseña (deja en blanco para mantener)');
    if (password === null) return;

    const payload = {
      username: username.trim(),
    };
    if (password.trim()) {
      payload.password = password;
    }

    try {
      await request({
        endpoint: `/api/usuarios/vendedores/${item.id}`,
        method: 'PATCH',
        body: payload,
      });
      await loadAll();
      notifySuccess('Credenciales de vendedor actualizadas');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar el vendedor');
    }
  };

  const handleDeleteVendedor = async (item) => {
    if (!window.confirm(`Eliminar vendedor ${item.username}?`)) return;

    try {
      await runDelete({
        endpoint: `/api/usuarios/vendedores/${item.id}`,
        successMessage: 'Vendedor eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar el vendedor');
    }
  };

  const handleCreateProducto = async (event) => {
    event.preventDefault();

    try {
      await request({
        endpoint: '/api/productos',
        method: 'POST',
        body: {
          nombre: productoForm.nombre.trim(),
          precio_costo: Number(productoForm.precio_costo),
          precio_venta: Number(productoForm.precio_venta),
          stock_actual: Number(productoForm.stock_actual || 0),
          stock_minimo: Number(productoForm.stock_minimo || 0),
          catalogo: productoForm.catalogo,
        },
      });
      await loadAll();
      setProductoForm({
        nombre: '',
        precio_costo: '',
        precio_venta: '',
        stock_actual: '',
        stock_minimo: '',
        catalogo: 'tienda',
      });
      notifySuccess('Producto creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear el producto');
    }
  };

  const handleEditProducto = async (item) => {
    const nombre = window.prompt('Nombre', item.nombre);
    if (nombre === null) return;
    const costoRaw = window.prompt('Precio costo', String(item.precio_costo));
    if (costoRaw === null) return;
    const ventaRaw = window.prompt('Precio venta', String(item.precio_venta));
    if (ventaRaw === null) return;
    const stockRaw = window.prompt('Stock actual', String(item.stock_actual));
    if (stockRaw === null) return;
    const minimoRaw = window.prompt('Stock minimo', String(item.stock_minimo));
    if (minimoRaw === null) return;
    const catalogoRaw = window.prompt('Catalogo (tienda/cartera)', item.catalogo || 'tienda');
    if (catalogoRaw === null) return;
    const catalogo = catalogoRaw.trim().toLowerCase();

    try {
      await request({
        endpoint: `/api/productos/${item.id}`,
        method: 'PATCH',
        body: {
          nombre: nombre.trim(),
          precio_costo: Number(costoRaw),
          precio_venta: Number(ventaRaw),
          stock_actual: Number(stockRaw),
          stock_minimo: Number(minimoRaw),
          catalogo: catalogo === 'cartera' ? 'cartera' : 'tienda',
        },
      });
      await loadAll();
      notifySuccess('Producto actualizado');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar producto');
    }
  };

  const handleDeleteProducto = async (item) => {
    if (!window.confirm(`Eliminar producto ${item.nombre}?`)) return;

    try {
      await runDelete({
        endpoint: `/api/productos/${item.id}`,
        successMessage: 'Producto eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar producto');
    }
  };

  const handleCreateGasto = async (event) => {
    event.preventDefault();

    try {
      await request({
        endpoint: '/api/gastos',
        method: 'POST',
        body: {
          categoria: gastoForm.categoria.trim(),
          descripcion: gastoForm.descripcion.trim(),
          monto: Number(gastoForm.monto),
        },
      });
      await loadAll();
      setGastoForm({ categoria: 'servicios', descripcion: '', monto: '' });
      notifySuccess('Gasto creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear gasto');
    }
  };

  const handleEditGasto = async (item) => {
    const categoria = window.prompt('Categoria', item.categoria);
    if (categoria === null) return;
    const descripcion = window.prompt('Descripcion', item.descripcion);
    if (descripcion === null) return;
    const montoRaw = window.prompt('Monto', String(item.monto));
    if (montoRaw === null) return;

    try {
      await request({
        endpoint: `/api/gastos/${item.id}`,
        method: 'PATCH',
        body: {
          categoria: categoria.trim(),
          descripcion: descripcion.trim(),
          monto: Number(montoRaw),
        },
      });
      await loadAll();
      notifySuccess('Gasto actualizado');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar gasto');
    }
  };

  const handleDeleteGasto = async (item) => {
    if (!window.confirm(`Eliminar gasto ${item.descripcion}?`)) return;

    try {
      await runDelete({
        endpoint: `/api/gastos/${item.id}`,
        successMessage: 'Gasto eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar gasto');
    }
  };

  const handleCreateFidelizacion = async (event) => {
    event.preventDefault();

    try {
      await request({
        endpoint: '/api/fidelizacion/clientes',
        method: 'POST',
        body: {
          nombre: fidelizacionForm.nombre.trim(),
          telefono_whatsapp: fidelizacionForm.telefono_whatsapp.trim(),
          puntos_acumulados: Number(fidelizacionForm.puntos_acumulados || 0),
        },
      });
      await loadAll();
      setFidelizacionForm({ nombre: '', telefono_whatsapp: '', puntos_acumulados: '0' });
      notifySuccess('Cliente de fidelizacion creado');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear cliente de fidelizacion');
    }
  };

  const handleEditFidelizacion = async (item) => {
    const nombre = window.prompt('Nombre', item.nombre);
    if (nombre === null) return;
    const telefono = window.prompt('Telefono WhatsApp', item.telefono_whatsapp);
    if (telefono === null) return;
    const puntosRaw = window.prompt('Puntos acumulados', String(item.puntos_acumulados));
    if (puntosRaw === null) return;

    try {
      await request({
        endpoint: `/api/fidelizacion/clientes/${item.id}`,
        method: 'PATCH',
        body: {
          nombre: nombre.trim(),
          telefono_whatsapp: telefono.trim(),
          puntos_acumulados: Number(puntosRaw),
        },
      });
      await loadAll();
      notifySuccess('Cliente de fidelizacion actualizado');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar fidelizacion');
    }
  };

  const handleDeleteFidelizacion = async (item) => {
    if (!window.confirm(`Eliminar cliente ${item.nombre}?`)) return;

    try {
      await runDelete({
        endpoint: `/api/fidelizacion/clientes/${item.id}`,
        successMessage: 'Cliente de fidelizacion eliminado',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar cliente de fidelizacion');
    }
  };

  const handleCreateAuditoria = async (event) => {
    event.preventDefault();

    try {
      await request({
        endpoint: '/api/auditorias',
        method: 'POST',
        body: {
          modulo: auditoriaForm.modulo.trim(),
          entidad: auditoriaForm.entidad.trim(),
          entidad_id: auditoriaForm.entidad_id ? Number(auditoriaForm.entidad_id) : null,
          accion: auditoriaForm.accion.trim(),
          detalle: auditoriaForm.detalle.trim() || null,
        },
      });
      await loadAll();
      setAuditoriaForm({ modulo: '', entidad: '', entidad_id: '', accion: '', detalle: '' });
      notifySuccess('Auditoria creada');
    } catch (err) {
      notifyError(err.message || 'No se pudo crear auditoria');
    }
  };

  const handleEditAuditoria = async (item) => {
    const modulo = window.prompt('Modulo', item.modulo);
    if (modulo === null) return;
    const entidad = window.prompt('Entidad', item.entidad);
    if (entidad === null) return;
    const entidadIdRaw = window.prompt('Entidad ID (opcional)', item.entidad_id ? String(item.entidad_id) : '');
    if (entidadIdRaw === null) return;
    const accion = window.prompt('Accion', item.accion);
    if (accion === null) return;
    const detalle = window.prompt('Detalle', item.detalle || '');
    if (detalle === null) return;

    try {
      await request({
        endpoint: `/api/auditorias/${item.id}`,
        method: 'PATCH',
        body: {
          modulo: modulo.trim(),
          entidad: entidad.trim(),
          entidad_id: entidadIdRaw.trim() ? Number(entidadIdRaw) : undefined,
          accion: accion.trim(),
          detalle: detalle.trim() || null,
        },
      });
      await loadAll();
      notifySuccess('Auditoria actualizada');
    } catch (err) {
      notifyError(err.message || 'No se pudo actualizar auditoria');
    }
  };

  const handleDeleteAuditoria = async (item) => {
    if (!window.confirm(`Eliminar auditoria #${item.id}?`)) return;

    try {
      await runDelete({
        endpoint: `/api/auditorias/${item.id}`,
        successMessage: 'Auditoria eliminada',
      });
    } catch (err) {
      notifyError(err.message || 'No se pudo eliminar auditoria');
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
        Cargando modulo admin...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-rosewood" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Modulo Admin</h1>
            <p className="text-gray-600">CRUD centralizado por tablas de cada modulo</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {success}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TAB_ITEMS.filter((tab) => (tab.id !== 'vendedores' ? true : isSuperAdmin)).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-rosewood text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'ventas' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Ventas - CRUD</h2>

          <form onSubmit={handleCreateVenta} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
            <select
              value={ventaForm.producto_id}
              onChange={(event) => setVentaForm((current) => ({ ...current, producto_id: event.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Producto</option>
              {productos.map((item) => (
                <option key={item.id} value={item.id}>{item.nombre}</option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={ventaForm.cantidad}
              onChange={(event) => setVentaForm((current) => ({ ...current, cantidad: event.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Cantidad"
            />
            <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={ventaForm.es_fiado}
                onChange={(event) => setVentaForm((current) => ({ ...current, es_fiado: event.target.checked }))}
              />
              Fiado
            </label>
            <select
              disabled={!ventaForm.es_fiado}
              value={ventaForm.fiado_origen}
              onChange={(event) => setVentaForm((current) => ({ ...current, fiado_origen: event.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="tienda">Origen tienda</option>
              <option value="cartera">Origen cartera</option>
            </select>
            {ventaForm.es_fiado && ventaForm.fiado_origen === 'cartera' ? (
              <select
                value={ventaForm.cliente_id}
                onChange={(event) => setVentaForm((current) => ({ ...current, cliente_id: event.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Cliente cartera</option>
                {clientes.map((item) => (
                  <option key={item.id} value={item.id}>{item.nombre}</option>
                ))}
              </select>
            ) : (
              <select
                value={ventaForm.cliente_tienda_id}
                onChange={(event) => setVentaForm((current) => ({ ...current, cliente_tienda_id: event.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Cliente tienda</option>
                {clientesTienda.map((item) => (
                  <option key={item.id} value={item.id}>{item.nombre}</option>
                ))}
              </select>
            )}

            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">
              Crear venta
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Saldo</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((item) => (
                  <tr key={item.venta_id} className="border-b border-gray-100">
                    <td className="px-3 py-2">#{item.venta_id}</td>
                    <td className="px-3 py-2">{item.cliente_nombre || 'Mostrador'}</td>
                    <td className="px-3 py-2">{item.es_fiado ? `Fiado (${item.fiado_origen || '-'})` : 'Contado'}</td>
                    <td className="px-3 py-2">{formatMoney(item.total)}</td>
                    <td className="px-3 py-2">{formatMoney(item.saldo_pendiente)}</td>
                    <td className="px-3 py-2">{formatDateTime(item.fecha)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditVenta(item)} className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">Editar</button>
                        <button onClick={() => handleDeleteVenta(item)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Ventas de cartera activas en el libro contable: {ventasCartera.length}. Esas se gestionan en Cartera.
          </p>
        </section>
      )}

      {activeTab === 'vendedores' && isSuperAdmin && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Vendedores - Credenciales</h2>

          <form onSubmit={handleCreateVendedor} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              value={vendedorForm.username}
              onChange={(e) => setVendedorForm((c) => ({ ...c, username: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Username"
            />
            <input
              type="password"
              value={vendedorForm.password}
              onChange={(e) => setVendedorForm((c) => ({ ...c, password: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Contraseña"
            />
            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">
              Crear vendedor
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{item.id}</td>
                    <td className="px-3 py-2">{item.username}</td>
                    <td className="px-3 py-2">{item.rol}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditVendedor(item)} className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">Editar</button>
                        <button onClick={() => handleDeleteVendedor(item)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'clientes' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Clientes de Cartera - CRUD</h2>
          <form onSubmit={handleCreateCliente} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
            <input value={clienteForm.nombre} onChange={(e) => setClienteForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Nombre" />
            <input value={clienteForm.documento} onChange={(e) => setClienteForm((c) => ({ ...c, documento: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Documento" />
            <input value={clienteForm.telefono_whatsapp} onChange={(e) => setClienteForm((c) => ({ ...c, telefono_whatsapp: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="WhatsApp" />
            <input type="number" min="1" value={clienteForm.limite_credito} onChange={(e) => setClienteForm((c) => ({ ...c, limite_credito: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Limite" />
            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">Crear</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Telefono</th>
                  <th className="px-3 py-2 text-right">Limite</th>
                  <th className="px-3 py-2 text-right">Deuda</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{item.nombre}</td>
                    <td className="px-3 py-2">{item.documento || '-'}</td>
                    <td className="px-3 py-2">{item.telefono_whatsapp || '-'}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.limite_credito)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.deuda_total)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditCliente(item)} className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">Editar</button>
                        <button onClick={() => handleDeleteCliente(item)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'proveedores' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Proveedores - CRUD</h2>
          <form onSubmit={handleCreateProveedor} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
            <input value={proveedorForm.nombre} onChange={(e) => setProveedorForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Nombre" />
            <input value={proveedorForm.contacto} onChange={(e) => setProveedorForm((c) => ({ ...c, contacto: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Contacto" />
            <input value={proveedorForm.telefono} onChange={(e) => setProveedorForm((c) => ({ ...c, telefono: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Telefono" />
            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">Crear</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Contacto</th>
                  <th className="px-3 py-2">Telefono</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{item.nombre}</td>
                    <td className="px-3 py-2">{item.contacto || '-'}</td>
                    <td className="px-3 py-2">{item.telefono || '-'}</td>
                    <td className="px-3 py-2">{item.activo ? 'Si' : 'No'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditProveedor(item)} className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">Editar</button>
                        <button onClick={() => handleDeleteProveedor(item)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'productos' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Productos - CRUD</h2>
          <form onSubmit={handleCreateProducto} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
            <input value={productoForm.nombre} onChange={(e) => setProductoForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Nombre" />
            <input type="number" min="0" value={productoForm.precio_costo} onChange={(e) => setProductoForm((c) => ({ ...c, precio_costo: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Costo" />
            <input type="number" min="0" value={productoForm.precio_venta} onChange={(e) => setProductoForm((c) => ({ ...c, precio_venta: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Venta" />
            <input type="number" min="0" value={productoForm.stock_actual} onChange={(e) => setProductoForm((c) => ({ ...c, stock_actual: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Stock" />
            <input type="number" min="0" value={productoForm.stock_minimo} onChange={(e) => setProductoForm((c) => ({ ...c, stock_minimo: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Min" />
            <select value={productoForm.catalogo} onChange={(e) => setProductoForm((c) => ({ ...c, catalogo: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="tienda">Tienda</option>
              <option value="cartera">Cartera</option>
            </select>
            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">Crear</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Catalogo</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2 text-right">Venta</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{item.nombre}</td>
                    <td className="px-3 py-2">{item.catalogo || 'tienda'}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.precio_costo)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.precio_venta)}</td>
                    <td className="px-3 py-2 text-right">{item.stock_actual}</td>
                    <td className="px-3 py-2 text-right">{item.stock_minimo}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditProducto(item)} className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">Editar</button>
                        <button onClick={() => handleDeleteProducto(item)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'gastos' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Gastos - CRUD</h2>
          <form onSubmit={handleCreateGasto} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
            <input value={gastoForm.categoria} onChange={(e) => setGastoForm((c) => ({ ...c, categoria: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Categoria" />
            <input value={gastoForm.descripcion} onChange={(e) => setGastoForm((c) => ({ ...c, descripcion: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Descripcion" />
            <input type="number" min="1" value={gastoForm.monto} onChange={(e) => setGastoForm((c) => ({ ...c, monto: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Monto" />
            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">Crear</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Descripcion</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Registrado por</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{item.categoria}</td>
                    <td className="px-3 py-2">{item.descripcion}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.monto)}</td>
                    <td className="px-3 py-2">{formatDateTime(item.fecha)}</td>
                    <td className="px-3 py-2">{item.registrado_por}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditGasto(item)} className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">Editar</button>
                        <button onClick={() => handleDeleteGasto(item)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'fidelizacion' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Fidelizacion - CRUD</h2>
          <form onSubmit={handleCreateFidelizacion} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
            <input value={fidelizacionForm.nombre} onChange={(e) => setFidelizacionForm((c) => ({ ...c, nombre: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Nombre" />
            <input value={fidelizacionForm.telefono_whatsapp} onChange={(e) => setFidelizacionForm((c) => ({ ...c, telefono_whatsapp: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="WhatsApp" />
            <input type="number" min="0" value={fidelizacionForm.puntos_acumulados} onChange={(e) => setFidelizacionForm((c) => ({ ...c, puntos_acumulados: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Puntos" />
            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">Crear</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">WhatsApp</th>
                  <th className="px-3 py-2 text-right">Puntos</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {fidelizacion.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{item.nombre}</td>
                    <td className="px-3 py-2">{item.telefono_whatsapp}</td>
                    <td className="px-3 py-2 text-right">{item.puntos_acumulados}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditFidelizacion(item)} className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">Editar</button>
                        <button onClick={() => handleDeleteFidelizacion(item)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'auditorias' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Auditorias - CRUD</h2>
          <form onSubmit={handleCreateAuditoria} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
            <input value={auditoriaForm.modulo} onChange={(e) => setAuditoriaForm((c) => ({ ...c, modulo: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Modulo" />
            <input value={auditoriaForm.entidad} onChange={(e) => setAuditoriaForm((c) => ({ ...c, entidad: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Entidad" />
            <input value={auditoriaForm.entidad_id} onChange={(e) => setAuditoriaForm((c) => ({ ...c, entidad_id: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Entidad ID" />
            <input value={auditoriaForm.accion} onChange={(e) => setAuditoriaForm((c) => ({ ...c, accion: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Accion" />
            <input value={auditoriaForm.detalle} onChange={(e) => setAuditoriaForm((c) => ({ ...c, detalle: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Detalle" />
            <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">Crear</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Modulo</th>
                  <th className="px-3 py-2">Entidad</th>
                  <th className="px-3 py-2">Accion</th>
                  <th className="px-3 py-2">Detalle</th>
                  <th className="px-3 py-2">Usuario</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {auditorias.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{item.id}</td>
                    <td className="px-3 py-2">{item.modulo}</td>
                    <td className="px-3 py-2">{item.entidad}{item.entidad_id ? ` #${item.entidad_id}` : ''}</td>
                    <td className="px-3 py-2">{item.accion}</td>
                    <td className="px-3 py-2">{item.detalle || '-'}</td>
                    <td className="px-3 py-2">{item.usuario}</td>
                    <td className="px-3 py-2">{formatDateTime(item.fecha)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditAuditoria(item)} className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">Editar</button>
                        <button onClick={() => handleDeleteAuditoria(item)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
        <div className="inline-flex items-center gap-2">
          <Database className="h-4 w-4" />
          El modulo Admin centraliza tablas y operaciones CRUD de ventas, clientes, proveedores, productos, gastos, fidelizacion y auditorias.
        </div>
      </section>
    </div>
  );
};

export default Admin;
