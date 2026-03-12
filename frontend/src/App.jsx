import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Home,
  LoaderCircle,
  MessageCircle,
  Minus,
  Package,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
const INITIAL_CLIENT_FORM = { nombre: '', documento: '', limite_credito: '' }
const INITIAL_PRODUCT_FORM = {
  nombre: '',
  precio_costo: '',
  precio_venta: '',
  stock_actual: '',
  stock_minimo: '',
}

const SIDEBAR_ITEMS = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'clientes', label: 'Clientes', icon: UsersRound },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { id: 'configuracion', label: 'Configuracion', icon: Settings },
]

const formatMoney = (value) => Number(value ?? 0).toLocaleString('en-US')

const formatDateTime = (value) => {
  if (!value) return 'Sin fecha'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha invalida'

  return date.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

const getUsageColorClass = (percentUsed) => {
  if (percentUsed < 50) return 'bg-emerald-500'
  if (percentUsed < 80) return 'bg-amber-500'
  return 'bg-rose-500'
}

const getStockColorClass = (producto) => {
  if (producto.stock_actual <= producto.stock_minimo) return 'text-rose-700 bg-rose-100 border-rose-200'
  if (producto.stock_actual <= producto.stock_minimo + 5) return 'text-amber-700 bg-amber-100 border-amber-200'
  return 'text-blue-700 bg-blue-100 border-blue-200'
}

const getStockLabel = (producto) => {
  if (producto.stock_actual <= producto.stock_minimo) return 'Critico'
  if (producto.stock_actual <= producto.stock_minimo + 5) return 'Bajo'
  return 'Suficiente'
}

const buildReciboTextFromVenta = (venta) => {
  if (!venta) return ''

  const detalleTexto = (venta.detalles ?? [])
    .map((detalle) => `${detalle.cantidad} ${detalle.nombre_producto} ($${Math.trunc(detalle.subtotal)})`)
    .join(', ')
  const clienteLabel = venta.cliente_nombre ?? 'Mostrador'
  const detalleLabel = detalleTexto || 'Sin productos'

  return `Variedades Angelly - Recibo #${venta.venta_id}: Cliente: ${clienteLabel}. ${detalleLabel}. Total: $${Math.trunc(venta.total)}. Saldo pendiente: $${Math.trunc(venta.saldo_pendiente)}`
}

function App() {
  const [activeSection, setActiveSection] = useState('inicio')

  const [clientes, setClientes] = useState([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [savingCliente, setSavingCliente] = useState(false)
  const [apiErrorClientes, setApiErrorClientes] = useState('')
  const [feedbackCliente, setFeedbackCliente] = useState({ type: '', message: '' })
  const [clientFormState, setClientFormState] = useState(INITIAL_CLIENT_FORM)

  const [productos, setProductos] = useState([])
  const [loadingProductos, setLoadingProductos] = useState(true)
  const [savingProducto, setSavingProducto] = useState(false)
  const [apiErrorProductos, setApiErrorProductos] = useState('')
  const [feedbackProducto, setFeedbackProducto] = useState({ type: '', message: '' })
  const [productFormState, setProductFormState] = useState(INITIAL_PRODUCT_FORM)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingPrecioId, setEditingPrecioId] = useState(null)
  const [editingPrecioValue, setEditingPrecioValue] = useState('')
  const [updatingPrecio, setUpdatingPrecio] = useState(false)
  const [updatingStockId, setUpdatingStockId] = useState(null)

  const [ventas, setVentas] = useState([])
  const [loadingVentas, setLoadingVentas] = useState(true)
  const [apiErrorVentas, setApiErrorVentas] = useState('')

  const [ventasTab, setVentasTab] = useState('nueva')
  const [expandedVentaId, setExpandedVentaId] = useState(null)
  const [ventasSearchTerm, setVentasSearchTerm] = useState('')
  const [clienteSearchTerm, setClienteSearchTerm] = useState('')
  const [carrito, setCarrito] = useState([])
  const [selectedClienteId, setSelectedClienteId] = useState('')
  const [esFiado, setEsFiado] = useState(false)
  const [montoPago, setMontoPago] = useState('')
  const [finalizingVenta, setFinalizingVenta] = useState(false)
  const [feedbackVenta, setFeedbackVenta] = useState({ type: '', message: '' })
  const [reciboVentaTexto, setReciboVentaTexto] = useState('')
  const [telefonoWhatsapp, setTelefonoWhatsapp] = useState('')

  const ventasSearchInputRef = useRef(null)

  const fetchClientes = async () => {
    setLoadingClientes(true)
    setApiErrorClientes('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/clientes`)
      if (!response.ok) throw new Error(`Error API ${response.status}`)
      const payload = await response.json()
      setClientes(Array.isArray(payload) ? payload : [])
    } catch (error) {
      setApiErrorClientes('No fue posible cargar la lista de clientes.')
      setClientes([])
    } finally {
      setLoadingClientes(false)
    }
  }

  const fetchProductos = async () => {
    setLoadingProductos(true)
    setApiErrorProductos('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/productos`)
      if (!response.ok) throw new Error(`Error API ${response.status}`)
      const payload = await response.json()
      setProductos(Array.isArray(payload) ? payload : [])
    } catch (error) {
      setApiErrorProductos('No fue posible cargar la lista de productos.')
      setProductos([])
    } finally {
      setLoadingProductos(false)
    }
  }

  const fetchVentas = async () => {
    setLoadingVentas(true)
    setApiErrorVentas('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/ventas`)
      if (!response.ok) throw new Error(`Error API ${response.status}`)
      const payload = await response.json()
      setVentas(Array.isArray(payload) ? payload : [])
    } catch (error) {
      setApiErrorVentas('No fue posible cargar las ventas.')
      setVentas([])
    } finally {
      setLoadingVentas(false)
    }
  }

  useEffect(() => {
    void fetchClientes()
    void fetchProductos()
    void fetchVentas()
  }, [])

  useEffect(() => {
    if (activeSection !== 'ventas' || ventasTab !== 'nueva') return

    const timer = setTimeout(() => {
      ventasSearchInputRef.current?.focus()
    }, 80)

    return () => clearTimeout(timer)
  }, [activeSection, ventasTab])

  const totalFiado = useMemo(
    () => clientes.reduce((sum, cliente) => sum + Number(cliente.deuda_total ?? 0), 0),
    [clientes],
  )

  const totalVentasHoy = useMemo(() => {
    const hoy = new Date().toDateString()

    return ventas.reduce((sum, venta) => {
      const fechaVenta = new Date(venta.fecha).toDateString()
      if (fechaVenta !== hoy) return sum
      return sum + Number(venta.total ?? 0)
    }, 0)
  }, [ventas])

  const clientesEnMora = useMemo(
    () => clientes.filter((cliente) => Number(cliente.deuda_total ?? 0) > 0).length,
    [clientes],
  )

  const cupoPromedio = useMemo(() => {
    if (clientes.length === 0) return 0

    const totalCupos = clientes.reduce(
      (sum, cliente) => sum + Number(cliente.limite_credito ?? 0),
      0,
    )

    return totalCupos / clientes.length
  }, [clientes])

  const totalProductos = useMemo(() => productos.length, [productos])

  const valorInventario = useMemo(
    () => productos.reduce((sum, item) => sum + Number(item.precio_costo) * Number(item.stock_actual), 0),
    [productos],
  )

  const productosStockBajo = useMemo(
    () => productos.filter((item) => Number(item.stock_actual) <= Number(item.stock_minimo)),
    [productos],
  )

  const filteredProductos = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return productos

    return productos.filter((item) => item.nombre.toLowerCase().includes(query))
  }, [productos, searchTerm])

  const productosVentaFiltrados = useMemo(() => {
    const query = ventasSearchTerm.trim().toLowerCase()

    return productos.filter((item) => {
      if (item.stock_actual <= 0) return false
      if (!query) return true
      return item.nombre.toLowerCase().includes(query)
    })
  }, [productos, ventasSearchTerm])

  const clienteSeleccionado = useMemo(
    () => clientes.find((cliente) => cliente.id === Number(selectedClienteId)) ?? null,
    [clientes, selectedClienteId],
  )

  const creditoDisponibleCliente = useMemo(() => {
    if (!clienteSeleccionado) return 0

    return Math.max(
      Number(clienteSeleccionado.limite_credito ?? 0) - Number(clienteSeleccionado.deuda_total ?? 0),
      0,
    )
  }, [clienteSeleccionado])

  const clientesFiltradosVenta = useMemo(() => {
    const query = clienteSearchTerm.trim().toLowerCase()

    const base = query
      ? clientes.filter((cliente) => (`${cliente.nombre} ${cliente.documento ?? ''}`).toLowerCase().includes(query))
      : clientes

    return base.slice(0, 8)
  }, [clientes, clienteSearchTerm])

  const totalCarrito = useMemo(
    () => carrito.reduce((sum, item) => sum + Number(item.cantidad) * Number(item.precio_venta), 0),
    [carrito],
  )

  const totalItemsCarrito = useMemo(
    () => carrito.reduce((sum, item) => sum + Number(item.cantidad), 0),
    [carrito],
  )

  const cambioCalculado = useMemo(
    () => Number(montoPago || 0) - Number(totalCarrito || 0),
    [montoPago, totalCarrito],
  )

  const montoFaltantePago = useMemo(
    () => Math.max(Number(totalCarrito || 0) - Number(montoPago || 0), 0),
    [montoPago, totalCarrito],
  )

  const excedeLimiteFiado = useMemo(
    () => esFiado && Boolean(clienteSeleccionado) && Number(totalCarrito) > creditoDisponibleCliente,
    [clienteSeleccionado, creditoDisponibleCliente, esFiado, totalCarrito],
  )

  const faltanteCreditoFiado = useMemo(
    () => Math.max(Number(totalCarrito) - creditoDisponibleCliente, 0),
    [creditoDisponibleCliente, totalCarrito],
  )

  const ventaBloqueada = finalizingVenta
    || carrito.length === 0
    || (esFiado ? !clienteSeleccionado || excedeLimiteFiado : montoFaltantePago > 0)

  const handleClientInputChange = (event) => {
    const { name, value } = event.target
    setClientFormState((current) => ({ ...current, [name]: value }))
  }

  const handleProductInputChange = (event) => {
    const { name, value } = event.target
    setProductFormState((current) => ({ ...current, [name]: value }))
  }

  const handleSubmitCliente = async (event) => {
    event.preventDefault()

    if (!clientFormState.nombre || !clientFormState.documento || !clientFormState.limite_credito) {
      setFeedbackCliente({
        type: 'error',
        message: 'Completa nombre, documento y limite de credito.',
      })
      return
    }

    setSavingCliente(true)
    setFeedbackCliente({ type: '', message: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/api/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: clientFormState.nombre,
          documento: clientFormState.documento,
          limite_credito: Number(clientFormState.limite_credito),
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.detail || 'No se pudo guardar el cliente.')
      }

      setFeedbackCliente({ type: 'success', message: 'Cliente registrado correctamente.' })
      setClientFormState(INITIAL_CLIENT_FORM)
      await fetchClientes()
    } catch (error) {
      setFeedbackCliente({ type: 'error', message: String(error.message || error) })
    } finally {
      setSavingCliente(false)
    }
  }

  const handleSubmitProducto = async (event) => {
    event.preventDefault()

    if (!productFormState.nombre || !productFormState.precio_costo || !productFormState.precio_venta) {
      setFeedbackProducto({
        type: 'error',
        message: 'Nombre, precio costo y precio venta son obligatorios.',
      })
      return
    }

    setSavingProducto(true)
    setFeedbackProducto({ type: '', message: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/api/productos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: productFormState.nombre,
          precio_costo: Number(productFormState.precio_costo),
          precio_venta: Number(productFormState.precio_venta),
          stock_actual: Number(productFormState.stock_actual || 0),
          stock_minimo: Number(productFormState.stock_minimo || 0),
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.detail || 'No se pudo guardar el producto.')
      }

      setFeedbackProducto({ type: 'success', message: 'Producto registrado correctamente.' })
      setProductFormState(INITIAL_PRODUCT_FORM)
      await fetchProductos()
    } catch (error) {
      setFeedbackProducto({ type: 'error', message: String(error.message || error) })
    } finally {
      setSavingProducto(false)
    }
  }

  const handleAdjustStock = async (productoId, delta) => {
    setUpdatingStockId(productoId)
    setFeedbackProducto({ type: '', message: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/api/productos/${productoId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.detail || 'No se pudo actualizar el stock.')
      }

      const updated = await response.json()
      setProductos((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setFeedbackProducto({ type: 'error', message: String(error.message || error) })
    } finally {
      setUpdatingStockId(null)
    }
  }

  const startInlineEditing = (producto) => {
    setEditingPrecioId(producto.id)
    setEditingPrecioValue(String(producto.precio_venta))
  }

  const cancelInlineEditing = () => {
    setEditingPrecioId(null)
    setEditingPrecioValue('')
  }

  const saveInlinePrecio = async (productoId) => {
    const nuevoPrecio = Number(editingPrecioValue)

    if (Number.isNaN(nuevoPrecio) || nuevoPrecio < 0) {
      setFeedbackProducto({ type: 'error', message: 'Ingresa un precio valido para guardar.' })
      return
    }

    setUpdatingPrecio(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/productos/${productoId}/precio_venta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio_venta: nuevoPrecio }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.detail || 'No se pudo actualizar el precio de venta.')
      }

      const updated = await response.json()
      setProductos((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      cancelInlineEditing()
    } catch (error) {
      setFeedbackProducto({ type: 'error', message: String(error.message || error) })
    } finally {
      setUpdatingPrecio(false)
    }
  }

  const abrirNuevaVenta = () => {
    setActiveSection('ventas')
    setVentasTab('nueva')
  }

  const addProductoAlCarrito = (producto) => {
    setFeedbackVenta({ type: '', message: '' })
    setReciboVentaTexto('')

    setCarrito((current) => {
      const existente = current.find((item) => item.producto_id === producto.id)

      if (existente) {
        if (existente.cantidad >= producto.stock_actual) {
          setFeedbackVenta({
            type: 'error',
            message: `No hay mas stock disponible para ${producto.nombre}.`,
          })
          return current
        }

        return current.map((item) => (
          item.producto_id === producto.id
            ? { ...item, cantidad: item.cantidad + 1, stock_actual: producto.stock_actual }
            : item
        ))
      }

      return [
        ...current,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          precio_venta: producto.precio_venta,
          stock_actual: producto.stock_actual,
          cantidad: 1,
        },
      ]
    })
  }

  const cambiarCantidadCarrito = (productoId, delta) => {
    setFeedbackVenta({ type: '', message: '' })

    setCarrito((current) => (
      current.flatMap((item) => {
        if (item.producto_id !== productoId) return [item]

        const stockDisponible = Number(
          productos.find((producto) => producto.id === item.producto_id)?.stock_actual ?? item.stock_actual,
        )
        const nuevaCantidad = item.cantidad + delta

        if (nuevaCantidad <= 0) return []

        if (nuevaCantidad > stockDisponible) {
          setFeedbackVenta({
            type: 'error',
            message: `Solo hay ${stockDisponible} unidades disponibles para ${item.nombre}.`,
          })
          return [{ ...item, stock_actual: stockDisponible }]
        }

        return [{ ...item, cantidad: nuevaCantidad, stock_actual: stockDisponible }]
      })
    ))
  }

  const eliminarDelCarrito = (productoId) => {
    setCarrito((current) => current.filter((item) => item.producto_id !== productoId))
  }

  const limpiarCarrito = () => {
    setCarrito([])
    setEsFiado(false)
    setMontoPago('')
    setFeedbackVenta({ type: '', message: '' })
    setReciboVentaTexto('')
  }

  const limpiarClienteVenta = () => {
    setSelectedClienteId('')
    setClienteSearchTerm('')
  }

  const handleClienteSearchInput = (event) => {
    setClienteSearchTerm(event.target.value)
    setSelectedClienteId('')
  }

  const seleccionarClienteVenta = (cliente) => {
    setSelectedClienteId(String(cliente.id))
    setClienteSearchTerm(cliente.nombre)
  }

  const toggleDetalleVenta = (ventaId) => {
    setExpandedVentaId((current) => (current === ventaId ? null : ventaId))
  }

  const handleFinalizarVenta = async () => {
    if (carrito.length === 0) {
      setFeedbackVenta({ type: 'error', message: 'Agrega al menos un producto al carrito.' })
      return
    }

    if (esFiado && !selectedClienteId) {
      setFeedbackVenta({ type: 'error', message: 'Selecciona un cliente para registrar una venta a fiado.' })
      return
    }

    if (esFiado && excedeLimiteFiado) {
      setFeedbackVenta({
        type: 'error',
        message: `El total supera el cupo disponible del cliente por $${formatMoney(faltanteCreditoFiado)}.`,
      })
      return
    }

    if (!esFiado && montoFaltantePago > 0) {
      setFeedbackVenta({
        type: 'error',
        message: `El valor recibido no cubre el total. Faltan $${formatMoney(montoFaltantePago)}.`,
      })
      return
    }

    setFinalizingVenta(true)
    setFeedbackVenta({ type: '', message: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/api/ventas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: selectedClienteId ? Number(selectedClienteId) : null,
          items: carrito.map((item) => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad,
          })),
          es_fiado: esFiado,
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.detail || 'No fue posible registrar la venta.')
      }

      const resumen = payload.resumen_recibo || buildReciboTextFromVenta(payload)
      setReciboVentaTexto(resumen)
      setFeedbackVenta({ type: 'success', message: `Venta #${payload.venta_id} registrada correctamente.` })
      setCarrito([])
      setMontoPago('')
      setEsFiado(false)
      setExpandedVentaId(payload.venta_id)

      await Promise.all([fetchProductos(), fetchClientes(), fetchVentas()])
    } catch (error) {
      setFeedbackVenta({ type: 'error', message: String(error.message || error) })
    } finally {
      setFinalizingVenta(false)
    }
  }

  const handleEnviarWhatsapp = () => {
    if (!reciboVentaTexto) {
      setFeedbackVenta({ type: 'error', message: 'Primero finaliza una venta para generar el recibo.' })
      return
    }

    const telefono = telefonoWhatsapp.replace(/\D/g, '')
    if (!telefono) {
      setFeedbackVenta({ type: 'error', message: 'Ingresa un telefono valido para WhatsApp.' })
      return
    }

    const mensajeCodificado = encodeURIComponent(reciboVentaTexto)
    window.open(`https://wa.me/${telefono}?text=${mensajeCodificado}`)
  }

  const renderInicioModule = () => (
    <>
      <header className="rounded-3xl border border-emerald-100 bg-white px-6 py-6 shadow-sm">
        <p className="text-base font-semibold uppercase tracking-[0.18em] text-emerald-500">
          Inicio
        </p>
        <h2 className="dashboard-title mt-2 text-4xl text-slate-800">Tablero Operativo</h2>
        <p className="mt-2 text-lg text-slate-600">
          Vista rapida del estado comercial para tomar decisiones al instante.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Total Ventas Hoy</p>
          <p className="mt-2 text-4xl font-semibold text-slate-800">${formatMoney(totalVentasHoy)}</p>
          <p className="mt-1 text-sm text-slate-500">{loadingVentas ? 'Actualizando ventas...' : 'Corte de hoy'}</p>
        </article>

        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Alerta Global</p>
          <p className="mt-2 text-4xl font-semibold text-rose-700">{productosStockBajo.length}</p>
          <p className="mt-1 text-sm text-slate-500">Productos con stock bajo</p>
        </article>

        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Cartera Total</p>
          <p className="mt-2 text-4xl font-semibold text-slate-800">${formatMoney(totalFiado)}</p>
          <p className="mt-1 text-sm text-slate-500">Saldo pendiente de clientes</p>
        </article>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-rose-50 p-6 shadow-sm">
        <p className="text-lg font-semibold text-slate-700">Acceso Rapido</p>
        <button
          type="button"
          onClick={abrirNuevaVenta}
          className="mt-4 w-full rounded-3xl border border-amber-300 bg-amber-200 px-6 py-8 text-3xl font-bold text-amber-800 shadow-lg transition hover:bg-amber-300 md:w-auto"
        >
          Nueva Venta
        </button>
      </section>

      {apiErrorVentas ? (
        <section className="rounded-2xl bg-rose-100 px-4 py-3 text-base font-medium text-rose-700">
          {apiErrorVentas}
        </section>
      ) : null}
    </>
  )

  const renderClientesModule = () => (
    <>
      <header className="rounded-3xl border border-rose-100 bg-white px-6 py-6 shadow-sm">
        <p className="text-base font-semibold uppercase tracking-[0.18em] text-rose-400">
          Modulo de Gestion de Clientes
        </p>
        <h2 className="dashboard-title mt-2 text-4xl text-slate-800">
          Control de Fiados y Cupos
        </h2>
        <p className="mt-2 text-lg text-slate-600">
          Visualiza limites, deudas y registra clientes sin friccion.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Total Fiado</p>
          <p className="mt-2 text-4xl font-semibold text-slate-800">${formatMoney(totalFiado)}</p>
        </article>

        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Clientes en Mora</p>
          <p className="mt-2 text-4xl font-semibold text-slate-800">{clientesEnMora}</p>
        </article>

        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Cupo Promedio</p>
          <p className="mt-2 text-4xl font-semibold text-slate-800">${formatMoney(cupoPromedio)}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <article className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-semibold text-slate-800">Registro Rapido de Clientes</h3>

          <form className="mt-5 space-y-4" onSubmit={handleSubmitCliente}>
            <label className="block text-base font-medium text-slate-700" htmlFor="cliente_nombre">
              Nombre
            </label>
            <input
              id="cliente_nombre"
              name="nombre"
              value={clientFormState.nombre}
              onChange={handleClientInputChange}
              placeholder="Ej: Dona Alba"
              className="focus-soft w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
            />

            <label className="block text-base font-medium text-slate-700" htmlFor="cliente_documento">
              Documento
            </label>
            <input
              id="cliente_documento"
              name="documento"
              value={clientFormState.documento}
              onChange={handleClientInputChange}
              placeholder="Ej: 1032456789"
              className="focus-soft w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
            />

            <label className="block text-base font-medium text-slate-700" htmlFor="cliente_limite_credito">
              Limite de Credito
            </label>
            <input
              id="cliente_limite_credito"
              name="limite_credito"
              type="number"
              min="1"
              value={clientFormState.limite_credito}
              onChange={handleClientInputChange}
              placeholder="Ej: 60000"
              className="focus-soft w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
            />

            <button
              type="submit"
              disabled={savingCliente}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-rose-300 bg-rose-100 px-5 py-3 text-lg font-semibold text-rose-700 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingCliente ? <LoaderCircle className="animate-spin" size={20} /> : <Save size={20} />}
              {savingCliente ? 'Guardando...' : 'Guardar'}
            </button>
          </form>

          {feedbackCliente.message ? (
            <p
              className={`mt-4 rounded-2xl px-4 py-3 text-base font-medium ${
                feedbackCliente.type === 'success'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              {feedbackCliente.message}
            </p>
          ) : null}
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-2xl font-semibold text-slate-800">Tabla de Creditos</h3>

          {loadingClientes ? (
            <div className="flex h-52 items-center justify-center gap-2 text-lg text-slate-500">
              <LoaderCircle className="animate-spin" size={22} />
              Cargando clientes desde Neon...
            </div>
          ) : apiErrorClientes ? (
            <div className="rounded-2xl bg-rose-100 px-4 py-4 text-base font-medium text-rose-700">
              {apiErrorClientes}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-left">
                <thead className="bg-slate-100 text-sm uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Deuda Actual</th>
                    <th className="px-4 py-3">Limite Disponible</th>
                  </tr>
                </thead>
                <tbody className="text-base text-slate-700">
                  {clientes.map((cliente) => {
                    const deudaActual = Number(cliente.deuda_total ?? 0)
                    const limiteCredito = Number(cliente.limite_credito ?? 0)
                    const limiteDisponible = Math.max(limiteCredito - deudaActual, 0)
                    const usedPercent = limiteCredito > 0
                      ? Math.min((deudaActual / limiteCredito) * 100, 100)
                      : 0

                    return (
                      <tr key={cliente.id} className="border-t border-slate-100">
                        <td className="px-4 py-4 text-lg font-semibold">{cliente.nombre}</td>
                        <td className="px-4 py-4">{cliente.documento || 'N/A'}</td>
                        <td className="px-4 py-4 text-lg">${formatMoney(deudaActual)}</td>
                        <td className="px-4 py-4">
                          <p className="text-lg font-medium">${formatMoney(limiteDisponible)}</p>
                          <div className="mt-2 h-3 w-full rounded-full bg-slate-200">
                            <div
                              className={`h-3 rounded-full transition-all ${getUsageColorClass(usedPercent)}`}
                              style={{ width: `${usedPercent}%` }}
                            />
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{usedPercent.toFixed(0)}% usado</p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </>
  )

  const renderInventarioModule = () => (
    <>
      <header className="rounded-3xl border border-blue-100 bg-white px-6 py-6 shadow-sm">
        <p className="text-base font-semibold uppercase tracking-[0.18em] text-blue-500">
          Modulo de Inventario
        </p>
        <h2 className="dashboard-title mt-2 text-4xl text-slate-800">
          Control Total de Productos
        </h2>
        <p className="mt-2 text-lg text-slate-600">
          Registra productos, controla stock en tiempo real y ajusta precios con un clic.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Total Productos</p>
          <p className="mt-2 text-4xl font-semibold text-slate-800">{totalProductos}</p>
        </article>

        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Stock Bajo</p>
          <p className="mt-2 text-4xl font-semibold text-rose-700">{productosStockBajo.length}</p>
        </article>

        <article className="kpi-glass rounded-3xl p-5">
          <p className="text-base font-semibold text-slate-500">Valor Inventario</p>
          <p className="mt-2 text-4xl font-semibold text-slate-800">${formatMoney(valorInventario)}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <article className="rounded-3xl border border-blue-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-semibold text-slate-800">Registro Rapido de Productos</h3>

          <form className="mt-5 space-y-4" onSubmit={handleSubmitProducto}>
            <label className="block text-base font-medium text-slate-700" htmlFor="producto_nombre">
              Nombre
            </label>
            <input
              id="producto_nombre"
              name="nombre"
              value={productFormState.nombre}
              onChange={handleProductInputChange}
              placeholder="Ej: Azucar 500g"
              className="focus-soft w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
            />

            <label className="block text-base font-medium text-slate-700" htmlFor="producto_precio_costo">
              Precio Costo
            </label>
            <input
              id="producto_precio_costo"
              name="precio_costo"
              type="number"
              min="0"
              step="0.01"
              value={productFormState.precio_costo}
              onChange={handleProductInputChange}
              className="focus-soft w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
            />

            <label className="block text-base font-medium text-slate-700" htmlFor="producto_precio_venta">
              Precio Venta
            </label>
            <input
              id="producto_precio_venta"
              name="precio_venta"
              type="number"
              min="0"
              step="0.01"
              value={productFormState.precio_venta}
              onChange={handleProductInputChange}
              className="focus-soft w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-base font-medium text-slate-700" htmlFor="producto_stock_actual">
                  Stock Actual
                </label>
                <input
                  id="producto_stock_actual"
                  name="stock_actual"
                  type="number"
                  min="0"
                  value={productFormState.stock_actual}
                  onChange={handleProductInputChange}
                  className="focus-soft mt-1 w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
                />
              </div>

              <div>
                <label className="block text-base font-medium text-slate-700" htmlFor="producto_stock_minimo">
                  Stock Minimo
                </label>
                <input
                  id="producto_stock_minimo"
                  name="stock_minimo"
                  type="number"
                  min="0"
                  value={productFormState.stock_minimo}
                  onChange={handleProductInputChange}
                  className="focus-soft mt-1 w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProducto}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-blue-300 bg-blue-100 px-5 py-3 text-lg font-semibold text-blue-700 transition hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingProducto ? <LoaderCircle className="animate-spin" size={20} /> : <Save size={20} />}
              {savingProducto ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </form>

          {feedbackProducto.message ? (
            <p
              className={`mt-4 rounded-2xl px-4 py-3 text-base font-medium ${
                feedbackProducto.type === 'success'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              {feedbackProducto.message}
            </p>
          ) : null}
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-2xl font-semibold text-slate-800">Inventario de Productos</h3>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar producto por nombre..."
                className="focus-soft w-full rounded-full border border-slate-300 py-3 pl-10 pr-4 text-base"
              />
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
            <p className="text-lg font-semibold text-rose-700">Alerta de Stock Bajo</p>
            {productosStockBajo.length === 0 ? (
              <p className="mt-1 text-base text-slate-600">Todo el inventario esta por encima del minimo.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {productosStockBajo.map((item) => (
                  <span
                    key={`low-${item.id}`}
                    className="rounded-full border border-rose-300 bg-white px-3 py-1 text-sm font-semibold text-rose-700"
                  >
                    {item.nombre} ({item.stock_actual}/{item.stock_minimo})
                  </span>
                ))}
              </div>
            )}
          </div>

          {loadingProductos ? (
            <div className="flex h-52 items-center justify-center gap-2 text-lg text-slate-500">
              <LoaderCircle className="animate-spin" size={22} />
              Cargando productos...
            </div>
          ) : apiErrorProductos ? (
            <div className="rounded-2xl bg-rose-100 px-4 py-4 text-base font-medium text-rose-700">
              {apiErrorProductos}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-left">
                <thead className="bg-slate-100 text-sm uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Costo</th>
                    <th className="px-4 py-3">Precio Venta</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Minimo</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-base text-slate-700">
                  {filteredProductos.map((producto) => (
                    <tr key={producto.id} className="border-t border-slate-100">
                      <td className="px-4 py-4 text-lg font-semibold">{producto.nombre}</td>
                      <td className="px-4 py-4">${formatMoney(producto.precio_costo)}</td>
                      <td className="px-4 py-4">
                        {editingPrecioId === producto.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingPrecioValue}
                              onChange={(event) => setEditingPrecioValue(event.target.value)}
                              className="focus-soft w-28 rounded-xl border border-slate-300 px-2 py-1 text-base"
                            />
                            <button
                              type="button"
                              onClick={() => void saveInlinePrecio(producto.id)}
                              disabled={updatingPrecio}
                              className="rounded-full border border-emerald-300 bg-emerald-100 p-2 text-emerald-700"
                              title="Guardar precio"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelInlineEditing}
                              className="rounded-full border border-slate-300 bg-slate-100 p-2 text-slate-700"
                              title="Cancelar"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startInlineEditing(producto)}
                            className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-base font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            ${formatMoney(producto.precio_venta)}
                            <Pencil size={14} />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${getStockColorClass(producto)}`}
                        >
                          {producto.stock_actual} ({getStockLabel(producto)})
                        </span>
                      </td>
                      <td className="px-4 py-4">{producto.stock_minimo}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleAdjustStock(producto.id, -1)}
                            disabled={updatingStockId === producto.id}
                            className="rounded-full border border-rose-300 bg-rose-100 p-2 text-rose-700 disabled:opacity-60"
                            title="Restar 1"
                          >
                            <X size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAdjustStock(producto.id, 1)}
                            disabled={updatingStockId === producto.id}
                            className="rounded-full border border-emerald-300 bg-emerald-100 p-2 text-emerald-700 disabled:opacity-60"
                            title="Sumar 1"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredProductos.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-lg text-slate-500" colSpan={6}>
                        No hay productos para mostrar con ese filtro.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </>
  )

  const renderVentasModule = () => (
    <>
      <header className="rounded-3xl border border-emerald-100 bg-white px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-base font-semibold uppercase tracking-[0.18em] text-emerald-500">
              Modulo de Ventas
            </p>
            <h2 className="dashboard-title mt-2 text-4xl text-slate-800">Punto de Venta Claro</h2>
            <p className="mt-2 text-lg text-slate-600">
              Separa captura y seguimiento para vender rapido sin perder contexto.
            </p>
          </div>

          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setVentasTab('nueva')}
              className={`rounded-2xl px-5 py-3 text-base font-semibold transition ${
                ventasTab === 'nueva'
                  ? 'bg-rose-100 text-rose-700 shadow-sm'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              Nueva Venta
            </button>
            <button
              type="button"
              onClick={() => setVentasTab('historial')}
              className={`rounded-2xl px-5 py-3 text-base font-semibold transition ${
                ventasTab === 'historial'
                  ? 'bg-rose-100 text-rose-700 shadow-sm'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              Historial
            </button>
          </div>
        </div>
      </header>

      {ventasTab === 'nueva' ? (
        <>
          {apiErrorVentas ? (
            <section className="rounded-2xl bg-rose-100 px-4 py-3 text-base font-medium text-rose-700">
              {apiErrorVentas}
            </section>
          ) : null}

          <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-semibold text-slate-800">Catalogo para Venta</h3>
                  <p className="mt-1 text-sm text-slate-500">Busca y agrega productos sin salir del flujo principal.</p>
                </div>

                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    ref={ventasSearchInputRef}
                    value={ventasSearchTerm}
                    onChange={(event) => setVentasSearchTerm(event.target.value)}
                    placeholder="Buscar producto por nombre..."
                    className="focus-soft w-full rounded-full border border-slate-300 py-3 pl-10 pr-4 text-base"
                  />
                </div>
              </div>

              {loadingProductos ? (
                <div className="flex h-56 items-center justify-center gap-2 text-lg text-slate-500">
                  <LoaderCircle className="animate-spin" size={22} />
                  Cargando productos...
                </div>
              ) : apiErrorProductos ? (
                <div className="rounded-2xl bg-rose-100 px-4 py-4 text-base font-medium text-rose-700">
                  {apiErrorProductos}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-100 text-sm uppercase tracking-[0.14em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3">Precio</th>
                        <th className="px-4 py-3">Stock</th>
                        <th className="px-4 py-3">Accion</th>
                      </tr>
                    </thead>
                    <tbody className="text-base text-slate-700">
                      {productosVentaFiltrados.map((producto) => (
                        <tr key={`venta-${producto.id}`} className="border-t border-slate-100">
                          <td className="px-4 py-4 text-lg font-semibold text-slate-800">{producto.nombre}</td>
                          <td className="px-4 py-4">${formatMoney(producto.precio_venta)}</td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${getStockColorClass(producto)}`}
                            >
                              {producto.stock_actual} | {getStockLabel(producto)}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() => addProductoAlCarrito(producto)}
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              <Plus size={16} />
                              Agregar
                            </button>
                          </td>
                        </tr>
                      ))}

                      {productosVentaFiltrados.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-lg text-slate-500" colSpan={4}>
                            No hay productos disponibles con ese filtro.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Configuracion de la venta
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-800">Modalidad y Cliente</h3>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEsFiado(false)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    !esFiado
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.14em]">Contado</p>
                  <p className="mt-2 text-lg font-semibold">Pago inmediato con cambio en caja.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setEsFiado(true)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    esFiado
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.14em]">Fiado</p>
                  <p className="mt-2 text-lg font-semibold">Registra deuda y valida cupo disponible.</p>
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-base font-semibold text-slate-700" htmlFor="venta_cliente_search">
                    Cliente
                  </label>
                  <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${esFiado ? 'text-amber-700' : 'text-slate-500'}`}>
                    {esFiado ? 'Obligatorio para fiado' : 'Opcional en contado'}
                  </span>
                </div>

                <input
                  id="venta_cliente_search"
                  value={clienteSearchTerm}
                  onChange={handleClienteSearchInput}
                  placeholder="Buscar por nombre o documento"
                  className="focus-soft w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                />

                <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                  {loadingClientes ? (
                    <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-500">
                      <LoaderCircle className="animate-spin" size={18} />
                      Cargando clientes...
                    </div>
                  ) : clientesFiltradosVenta.map((cliente) => (
                    <button
                      key={`cliente-pos-${cliente.id}`}
                      type="button"
                      onClick={() => seleccionarClienteVenta(cliente)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                        Number(selectedClienteId) === cliente.id
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      <span className="font-medium">{cliente.nombre}</span>
                      <span>${formatMoney(cliente.limite_credito)}</span>
                    </button>
                  ))}

                  {!loadingClientes && clientesFiltradosVenta.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-slate-500">Sin coincidencias de cliente.</p>
                  ) : null}
                </div>
              </div>

              {clienteSeleccionado ? (
                <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-800">{clienteSeleccionado.nombre}</p>
                      <p className="mt-1 text-sm text-slate-600">Documento: {clienteSeleccionado.documento || 'No registra'}</p>
                    </div>

                    <button
                      type="button"
                      onClick={limpiarClienteVenta}
                      className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Quitar cliente
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cupo</p>
                      <p className="mt-2 text-xl font-semibold text-slate-800">${formatMoney(clienteSeleccionado.limite_credito)}</p>
                    </div>

                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Deuda</p>
                      <p className="mt-2 text-xl font-semibold text-slate-800">${formatMoney(clienteSeleccionado.deuda_total)}</p>
                    </div>

                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Disponible</p>
                      <p className="mt-2 text-xl font-semibold text-emerald-700">${formatMoney(creditoDisponibleCliente)}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {esFiado && !clienteSeleccionado ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
                  Selecciona un cliente antes de finalizar una venta a fiado.
                </div>
              ) : null}

              {esFiado && clienteSeleccionado && excedeLimiteFiado ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-medium text-rose-700">
                  El total supera el cupo disponible por $${formatMoney(faltanteCreditoFiado)}.
                </div>
              ) : null}

              {esFiado && clienteSeleccionado && !excedeLimiteFiado ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                  Cupo suficiente para aprobar esta venta a fiado.
                </div>
              ) : null}

              {!esFiado ? (
                <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <label className="text-base font-semibold text-slate-700" htmlFor="venta_pago_con">
                    Paga con...
                  </label>
                  <input
                    id="venta_pago_con"
                    value={montoPago}
                    onChange={(event) => setMontoPago(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    className="focus-soft mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg"
                  />
                  <p className={`mt-4 text-4xl font-semibold ${cambioCalculado >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    Cambio: ${formatMoney(cambioCalculado)}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {montoFaltantePago > 0
                      ? `Faltan $${formatMoney(montoFaltantePago)} para completar el pago.`
                      : 'Pago suficiente para cerrar la venta.'}
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-base font-semibold text-amber-800">Venta a fiado</p>
                  <p className="mt-2 text-sm text-amber-800">
                    El total se cargara como deuda del cliente seleccionado y quedara visible en historial.
                  </p>
                </div>
              )}
            </article>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-slate-800">Carrito Actual</h3>
                <p className="mt-1 text-sm text-slate-500">Vista tabular para revisar cantidades, precios y totales por producto.</p>
              </div>

              <button
                type="button"
                onClick={limpiarCarrito}
                disabled={carrito.length === 0}
                className="rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Vaciar venta
              </button>
            </div>

            {carrito.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-lg text-slate-500">
                El carrito esta vacio. Agrega productos desde el catalogo para iniciar la venta.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-100 text-sm uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">Cantidad</th>
                      <th className="px-4 py-3">Precio</th>
                      <th className="px-4 py-3">Total Producto</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="text-base text-slate-700">
                    {carrito.map((item) => (
                      <tr key={item.producto_id} className="border-t border-slate-100">
                        <td className="px-4 py-4 text-lg font-semibold text-slate-800">{item.nombre}</td>
                        <td className="px-4 py-4">
                          <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-2 py-2">
                            <button
                              type="button"
                              onClick={() => cambiarCantidadCarrito(item.producto_id, -1)}
                              className="rounded-full border border-slate-300 bg-slate-100 p-2 text-slate-700"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="min-w-8 text-center text-lg font-semibold">{item.cantidad}</span>
                            <button
                              type="button"
                              onClick={() => cambiarCantidadCarrito(item.producto_id, 1)}
                              className="rounded-full border border-slate-300 bg-slate-100 p-2 text-slate-700"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4">${formatMoney(item.precio_venta)}</td>
                        <td className="px-4 py-4 text-lg font-semibold text-slate-800">
                          ${formatMoney(item.cantidad * item.precio_venta)}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => eliminarDelCarrito(item.producto_id)}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                          >
                            <Trash2 size={16} />
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-2xl font-semibold text-slate-800">Postventa</h3>

              {feedbackVenta.message ? (
                <div
                  className={`mt-4 rounded-2xl px-4 py-4 text-base font-medium ${
                    feedbackVenta.type === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {feedbackVenta.message}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  Cuando cierres la venta, aqui veras el recibo generado para compartirlo o revisarlo.
                </div>
              )}

              {reciboVentaTexto ? (
                <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">Recibo generado</p>
                  <p className="mt-3 text-base leading-7 text-slate-700">{reciboVentaTexto}</p>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <input
                      id="venta_whatsapp"
                      value={telefonoWhatsapp}
                      onChange={(event) => setTelefonoWhatsapp(event.target.value)}
                      placeholder="Telefono WhatsApp para compartir"
                      className="focus-soft w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                    />
                    <button
                      type="button"
                      onClick={handleEnviarWhatsapp}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-3 text-base font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <MessageCircle size={18} />
                      Enviar por WhatsApp
                    </button>
                  </div>
                </div>
              ) : null}
            </article>

            <aside className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-200">Resumen</p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl bg-white/10 px-4 py-4">
                  <p className="text-sm text-slate-300">Productos</p>
                  <p className="mt-2 text-3xl font-semibold">{carrito.length}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-4">
                  <p className="text-sm text-slate-300">Unidades</p>
                  <p className="mt-2 text-3xl font-semibold">{totalItemsCarrito}</p>
                </div>
              </div>

              <div className="mt-6 rounded-3xl bg-white/10 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Total final</p>
                <p className="mt-3 text-5xl font-semibold">${formatMoney(totalCarrito)}</p>
                <p className="mt-2 text-sm text-slate-300">
                  {esFiado ? 'Este valor se registrara como saldo del cliente.' : 'Este valor debe ingresar a caja en esta transaccion.'}
                </p>
              </div>

              {!esFiado ? (
                <div className="mt-5 rounded-2xl border border-white/10 px-4 py-4">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>Recibido</span>
                    <span>${formatMoney(montoPago || 0)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-base font-semibold">
                    <span>Cambio</span>
                    <span className={cambioCalculado >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      ${formatMoney(cambioCalculado)}
                    </span>
                  </div>
                </div>
              ) : clienteSeleccionado ? (
                <div className="mt-5 rounded-2xl border border-white/10 px-4 py-4">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>Cupo disponible</span>
                    <span>${formatMoney(creditoDisponibleCliente)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-base font-semibold">
                    <span>Saldo tras venta</span>
                    <span className="text-amber-300">
                      ${formatMoney(Number(clienteSeleccionado.deuda_total ?? 0) + Number(totalCarrito))}
                    </span>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleFinalizarVenta}
                disabled={ventaBloqueada}
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-lg font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  esFiado
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {finalizingVenta ? <LoaderCircle className="animate-spin" size={20} /> : <Check size={20} />}
                {finalizingVenta ? 'Registrando venta...' : esFiado ? 'Finalizar Venta a Fiado' : 'Finalizar Venta de Contado'}
              </button>

              <button
                type="button"
                onClick={limpiarCarrito}
                className="mt-3 w-full rounded-full border border-white/15 bg-white/5 px-5 py-3 text-base font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Limpiar venta actual
              </button>

              <p className="mt-4 text-sm text-slate-300">
                {carrito.length === 0
                  ? 'Agrega productos para habilitar el cierre de la venta.'
                  : esFiado
                    ? clienteSeleccionado
                      ? excedeLimiteFiado
                        ? 'Reduce el total o cambia de cliente para continuar.'
                        : 'El cliente cumple la condicion de cupo para esta venta.'
                      : 'Selecciona un cliente antes de registrar el fiado.'
                    : montoFaltantePago > 0
                      ? 'Ingresa un valor recibido suficiente para calcular el cambio.'
                      : 'Todo listo para cerrar la venta de contado.'}
              </p>
            </aside>
          </section>
        </>
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold text-slate-800">Historial de Ventas</h3>
              <p className="mt-1 text-sm text-slate-500">Consulta facturas, identifica modalidad y despliega el detalle por producto.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              {loadingVentas ? 'Actualizando historial...' : `${ventas.length} ventas registradas`}
            </div>
          </div>

          {loadingVentas ? (
            <div className="flex h-56 items-center justify-center gap-2 text-lg text-slate-500">
              <LoaderCircle className="animate-spin" size={22} />
              Cargando historial de ventas...
            </div>
          ) : apiErrorVentas ? (
            <div className="rounded-2xl bg-rose-100 px-4 py-4 text-base font-medium text-rose-700">
              {apiErrorVentas}
            </div>
          ) : ventas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-lg text-slate-500">
              Aun no hay ventas registradas.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-left">
                <thead className="bg-slate-100 text-sm uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ID Factura</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Detalle</th>
                  </tr>
                </thead>
                <tbody className="text-base text-slate-700">
                  {ventas.map((venta) => {
                    const abierta = expandedVentaId === venta.venta_id

                    return (
                      <Fragment key={`venta-row-${venta.venta_id}`}>
                        <tr
                          className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50"
                          onClick={() => toggleDetalleVenta(venta.venta_id)}
                        >
                          <td className="px-4 py-4 text-lg font-semibold text-slate-800">#{venta.venta_id}</td>
                          <td className="px-4 py-4">{formatDateTime(venta.fecha)}</td>
                          <td className="px-4 py-4">{venta.cliente_nombre ?? 'Mostrador'}</td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${
                                venta.es_fiado
                                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {venta.es_fiado ? 'Fiado' : 'Contado'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-lg font-semibold text-slate-800">${formatMoney(venta.total)}</td>
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleDetalleVenta(venta.venta_id)
                              }}
                              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              {abierta ? 'Ocultar detalle' : 'Ver detalle'}
                            </button>
                          </td>
                        </tr>

                        {abierta ? (
                          <tr>
                            <td className="bg-slate-50 px-4 py-5" colSpan={6}>
                              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Detalle de productos</p>
                                  <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                                    <table className="min-w-full text-left">
                                      <thead className="bg-slate-100 text-xs uppercase tracking-[0.14em] text-slate-500">
                                        <tr>
                                          <th className="px-4 py-3">Producto</th>
                                          <th className="px-4 py-3">Cantidad</th>
                                          <th className="px-4 py-3">Precio</th>
                                          <th className="px-4 py-3">Subtotal</th>
                                        </tr>
                                      </thead>
                                      <tbody className="text-sm text-slate-700">
                                        {(venta.detalles ?? []).map((detalle) => (
                                          <tr key={`detalle-${venta.venta_id}-${detalle.producto_id}`} className="border-t border-slate-100">
                                            <td className="px-4 py-3 font-medium text-slate-800">{detalle.nombre_producto}</td>
                                            <td className="px-4 py-3">{detalle.cantidad}</td>
                                            <td className="px-4 py-3">${formatMoney(detalle.precio_unitario)}</td>
                                            <td className="px-4 py-3 font-semibold">${formatMoney(detalle.subtotal)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Resumen</p>
                                    <p className="mt-3 text-lg font-semibold text-slate-800">{venta.cliente_nombre ?? 'Mostrador'}</p>
                                    <p className="mt-1 text-sm text-slate-500">{venta.es_fiado ? 'Venta a fiado' : 'Venta de contado'}</p>
                                    <p className="mt-4 text-3xl font-semibold text-slate-800">${formatMoney(venta.total)}</p>
                                    <p className="mt-2 text-sm text-slate-500">
                                      Saldo pendiente registrado: ${formatMoney(venta.saldo_pendiente)}
                                    </p>
                                  </div>

                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Recibo</p>
                                    <p className="mt-3 text-sm leading-6 text-slate-700">{venta.resumen_recibo}</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )

  return (
    <div className="h-screen bg-slate-100 text-slate-800">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-rose-100 bg-white md:flex md:flex-col">
        <div className="border-b border-rose-100 px-7 py-8">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-400">
            Variedades Angelly
          </p>
          <h1 className="dashboard-title mt-3 text-3xl text-slate-800">Dashboard</h1>
          <p className="mt-2 text-base text-slate-500">
            Panel operativo pensado para vision clara y accion rapida.
          </p>
        </div>

        <nav className="space-y-2 px-4 py-6">
          {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id
            const isEnabled = id === 'inicio' || id === 'clientes' || id === 'inventario' || id === 'ventas'

            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (!isEnabled) return
                  setActiveSection(id)
                }}
                className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-lg font-medium transition ${
                  isActive
                    ? 'border border-rose-200 bg-rose-50 text-rose-700'
                    : isEnabled
                      ? 'text-slate-600 hover:border hover:border-rose-100 hover:bg-rose-50/50'
                      : 'cursor-not-allowed text-slate-400'
                }`}
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto border-t border-rose-100 p-5 text-sm text-slate-500">
          Turno actual: Caja Principal
        </div>
      </aside>

      <main className="h-screen overflow-y-auto md:ml-72">
        <div className="mx-auto max-w-7xl space-y-8 px-5 py-6 md:px-10 md:py-8">
          <div className="md:hidden">
            <div className="flex gap-2 overflow-x-auto rounded-2xl border border-rose-100 bg-white p-2">
              {SIDEBAR_ITEMS.filter(({ id }) => id === 'inicio' || id === 'clientes' || id === 'inventario' || id === 'ventas').map(
                ({ id, label, icon: Icon }) => {
                  const isActive = activeSection === id
                  return (
                    <button
                      key={`mobile-${id}`}
                      type="button"
                      onClick={() => setActiveSection(id)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
                        isActive
                          ? 'border-rose-300 bg-rose-100 text-rose-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  )
                },
              )}
            </div>
          </div>

          {activeSection === 'inicio'
            ? renderInicioModule()
            : activeSection === 'inventario'
              ? renderInventarioModule()
              : activeSection === 'ventas'
                ? renderVentasModule()
                : renderClientesModule()}
        </div>
      </main>
    </div>
  )
}

export default App