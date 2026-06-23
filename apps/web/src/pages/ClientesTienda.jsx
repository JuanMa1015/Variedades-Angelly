import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import PaginationControls from '../components/PaginationControls';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/httpClient';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import useConfirm from '../components/useConfirm';
import Skeleton from '../components/Skeleton';
import Modal from '../components/Modal';

const PAGE_SIZE = 10;
const CLIENTES_PAGE_SIZE = 20;
const MONEY_FORMATTER = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const formatMoney = (value) => MONEY_FORMATTER.format(Number(value || 0));
const formatMoneyMsg = (value) => `$${Math.round(Number(value || 0)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

const DEBT_LEVELS = {
  verde: { max: 200000, label: 'Al día', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  amarillo: { max: 400000, label: 'Alerta', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' },
  rojo: { max: Infinity, label: 'Moroso', dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500' },
};
const nivelDeuda = (deuda) => {
  const monto = Number(deuda || 0);
  if (monto <= DEBT_LEVELS.verde.max) return DEBT_LEVELS.verde;
  if (monto <= DEBT_LEVELS.amarillo.max) return DEBT_LEVELS.amarillo;
  return DEBT_LEVELS.rojo;
};
const DEUDA_MAX_REF = 400000;

const isValidPhone = (value) => {
  const raw = String(value || '').replace(/\D/g, '');
  if (!raw) return true;
  return raw.length === 7 || raw.length === 10 || (raw.length === 12 && raw.startsWith('57'));
};

const normalizeWhatsappNumber = (rawValue) => {
  const digits = String(rawValue || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('57')) return digits;
  if (digits.length === 10) return `57${digits}`;
  if (digits.length === 7) return `57601${digits}`;
  return '';
};

const ClientesTienda = () => {
  const { token } = useAuth();
  const { confirm, ConfirmModal } = useConfirm();

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('clientes');

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [deudaEdit, setDeudaEdit] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [resumen, setResumen] = useState({ clientes_totales: 0, clientes_con_deuda: 0, deuda_total: 0, clientes_alto_riesgo: 0, clientes_riesgo_medio: 0, saldo_promedio: 0 });

  const [cobroClientes, setCobroClientes] = useState([]);
  const [cobroLoading, setCobroLoading] = useState(false);
  const [cobroSearch, setCobroSearch] = useState('');
  const [cobroPage, setCobroPage] = useState(1);
  const [cobroTotalPages, setCobroTotalPages] = useState(1);
  const [expandedCobroClientes, setExpandedCobroClientes] = useState([]);

  const [selectedClienteAbono, setSelectedClienteAbono] = useState(null);
  const [abonoMonto, setAbonoMonto] = useState('');
  const [abonoMetodo, setAbonoMetodo] = useState('efectivo');
  const [savingAbono, setSavingAbono] = useState(false);

  const [selectedClienteDetalle, setSelectedClienteDetalle] = useState(null);
  const [detalleMovimientos, setDetalleMovimientos] = useState([]);
  const [detallePage, setDetallePage] = useState(1);
  const [detalleTotalPages, setDetalleTotalPages] = useState(1);
  const [detalleLoading, setDetalleLoading] = useState(false);

  const loadClientes = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      const payload = await apiGet('/api/clientes/tienda-fiado');
      setClientes(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err.message || 'No fue posible cargar clientes de tienda');
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadResumen = useCallback(async () => {
    if (!token) return;
    try {
      const payload = await apiGet('/api/clientes/tienda/resumen');
      setResumen(typeof payload === 'object' && payload ? payload : { clientes_totales: 0, clientes_con_deuda: 0, deuda_total: 0, clientes_alto_riesgo: 0, clientes_riesgo_medio: 0, saldo_promedio: 0 });
    } catch {
      // silently fail
    }
  }, [token]);

  const loadCobroClientes = useCallback(async () => {
    if (!token) return;
    try {
      setCobroLoading(true);
      const searchParam = cobroSearch.trim() || undefined;
      const payload = await apiGet(`/api/clientes/tienda/cobro?page=${cobroPage}&limit=${CLIENTES_PAGE_SIZE}${searchParam ? `&search=${encodeURIComponent(searchParam)}` : ''}`);
      setCobroClientes(Array.isArray(payload?.data) ? payload.data : []);
      setCobroTotalPages(Math.max(1, Number(payload?.total_pages ?? 1)));
    } catch {
      setCobroClientes([]);
      setCobroTotalPages(1);
    } finally {
      setCobroLoading(false);
    }
  }, [token, cobroPage, cobroSearch]);

  useEffect(() => {
    loadClientes();
    loadResumen();
    loadCobroClientes();
  }, [loadClientes, loadResumen, loadCobroClientes]);

  const filteredClientes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((cliente) => {
      const nombreCliente = String(cliente.nombre || '').toLowerCase();
      const telefono = String(cliente.telefono_whatsapp || '').toLowerCase();
      return nombreCliente.includes(q) || telefono.includes(q);
    });
  }, [clientes, searchTerm]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredClientes.length / PAGE_SIZE)), [filteredClientes.length]);
  const pagedClientes = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredClientes.slice(start, start + PAGE_SIZE);
  }, [filteredClientes, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const resetForm = () => {
    setNombre('');
    setApellido('');
    setWhatsapp('');
    setDeudaEdit('');
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const n = nombre.trim();
    const a = apellido.trim();
    if (!n || !a) { setError('Nombre y apellido son obligatorios'); return; }

    const rawPhone = String(whatsapp || '').replace(/\D/g, '');
    if (rawPhone && !isValidPhone(whatsapp)) { setError('El número WhatsApp debe tener 7 (Bogotá), 10 (nacional) o 12 (con 57) dígitos'); return; }

    const fullName = `${n} ${a}`.trim();
    const phoneToSave = rawPhone || null;

    try {
      setSaving(true);
      if (editingId) {
        const patchPayload = { nombre: fullName, telefono_whatsapp: phoneToSave };
        const deudaParsed = Number(deudaEdit);
        if (editingId && deudaEdit !== '' && Number.isFinite(deudaParsed) && deudaParsed >= 0) {
          patchPayload.deuda_total = deudaParsed;
        }
        await apiPatch(`/api/clientes/tienda-fiado/${editingId}`, patchPayload);
      } else {
        await apiPost('/api/clientes/tienda-fiado', { nombre: fullName, telefono_whatsapp: phoneToSave });
      }
      setSuccess(editingId ? 'Cliente actualizado correctamente' : 'Cliente creado correctamente');
      resetForm();
      await Promise.all([loadClientes(), loadResumen(), loadCobroClientes()]);
    } catch (err) {
      setError(err.message || 'No fue posible guardar el cliente');
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => { resetForm(); setError(''); setSuccess(''); setIsModalOpen(true); };

  const openEditModal = (cliente) => {
    const fullName = String(cliente.nombre || '').trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts.shift() || '';
    const lastName = parts.join(' ');
    setNombre(firstName);
    setApellido(lastName);
    setWhatsapp(String(cliente.telefono_whatsapp || ''));
    setDeudaEdit(String(cliente.deuda_total ?? ''));
    setEditingId(cliente.id);
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const handleDelete = async (cliente) => {
    const confirmed = await confirm({ title: 'Eliminar cliente', message: `¿Eliminar cliente ${cliente.nombre}?` });
    if (!confirmed) return;
    try {
      setError(''); setSuccess('');
      await apiDelete(`/api/clientes/tienda-fiado/${cliente.id}`);
      setSuccess('Cliente eliminado correctamente');
      await Promise.all([loadClientes(), loadResumen(), loadCobroClientes()]);
    } catch (err) {
      setError(err.message || 'No fue posible eliminar el cliente');
    }
  };

  const toggleCobroCliente = (clienteId) => {
    setExpandedCobroClientes((current) =>
      current.includes(clienteId) ? current.filter((id) => id !== clienteId) : [...current, clienteId],
    );
  };

  const handleAbrirWhatsapp = async (cliente) => {
    const telefono = normalizeWhatsappNumber(cliente?.telefono_whatsapp);
    if (!telefono) { setError('Este cliente no tiene un WhatsApp válido'); return; }

    const deuda = Number(cliente?.deuda_total || 0);
    const nombre = String(cliente?.nombre || '').trim();

    const lineas = [];
    lineas.push(`Hola ${nombre}, un saludo de Tienda Angelly.`);
    lineas.push('');
    lineas.push(`Tu saldo pendiente es de ${formatMoneyMsg(deuda)}.`);
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
    setError(''); setSuccess('');
    setSelectedClienteAbono(cliente);
    setAbonoMonto('');
    setAbonoMetodo('efectivo');
  };

  const handleConfirmAbono = async (event) => {
    event?.preventDefault();
    if (!selectedClienteAbono) return;

    const monto = Number(abonoMonto || 0);
    if (!Number.isFinite(monto) || monto <= 0) { setError('Ingresa un monto válido mayor a 0'); return; }
    if (monto > Number(selectedClienteAbono.deuda_total)) { setError('El abono supera la deuda actual del cliente'); return; }

    try {
      setSavingAbono(true);
      await apiPost(`/api/clientes/tienda/${selectedClienteAbono.id}/abonos`, { monto, metodo_pago: abonoMetodo });
      setSuccess('Abono registrado correctamente');
      setSelectedClienteAbono(null);
      setAbonoMonto('');
      await Promise.all([loadClientes(), loadResumen(), loadCobroClientes()]);
    } catch (err) {
      setError(err.message || 'No fue posible registrar el abono');
    } finally {
      setSavingAbono(false);
    }
  };

  const handleSaldarDeuda = async (cliente) => {
    const deuda = Number(cliente.deuda_total || 0);
    if (deuda <= 0) { setError('El cliente no tiene deuda'); return; }
    const confirmed = await confirm({ title: 'Saldar deuda', message: `¿Saldar toda la deuda de ${cliente.nombre} por ${formatMoney(deuda)}?` });
    if (!confirmed) return;

    try {
      setSavingAbono(true);
      await apiPost(`/api/clientes/tienda/${cliente.id}/abonos`, { monto: deuda, metodo_pago: 'efectivo' });
      setSuccess(`Deuda de ${cliente.nombre} saldada correctamente`);
      await Promise.all([loadClientes(), loadResumen(), loadCobroClientes()]);
    } catch (err) {
      setError(err.message || 'No fue posible saldar la deuda');
    } finally {
      setSavingAbono(false);
    }
  };

  const handleVerDetalle = async (cliente) => {
    setError(''); setSuccess('');
    setSelectedClienteDetalle(cliente);
    setDetallePage(1);
    await loadMovimientos(cliente.id, 1);
  };

  const loadMovimientos = async (clienteId, page) => {
    try {
      setDetalleLoading(true);
      const payload = await apiGet(`/api/clientes/tienda/${clienteId}/movimientos?page=${page}&limit=5`);
      setDetalleMovimientos(Array.isArray(payload?.data) ? payload.data : []);
      setDetalleTotalPages(Math.max(1, Number(payload?.total_pages ?? 1)));
    } catch {
      setDetalleMovimientos([]);
      setDetalleTotalPages(1);
    } finally {
      setDetalleLoading(false);
    }
  };

  const handleDetallePageChange = async (page) => {
    setDetallePage(page);
    if (selectedClienteDetalle) await loadMovimientos(selectedClienteDetalle.id, page);
  };

  const tabs = [
    { key: 'clientes', label: 'Clientes', icon: UserRound },
    { key: 'cobrar', label: 'Cobrar', icon: ChevronDown },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <UserRound className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes de Tienda</h1>
          <p className="text-gray-600">Gestión de ventas, fiados y cobros</p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      <SuccessMessage message={success} onDismiss={() => setSuccess('')} />

      {/* Dashboard resumen */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Clientes totales</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{resumen.clientes_totales}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Clientes con deuda</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{resumen.clientes_con_deuda}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Deuda total</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{formatMoney(resumen.deuda_total)}</p>
        </div>
      </div>

      {/* Riesgo semaforo */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-red-50 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-red-700">Clientes morosos</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{resumen.clientes_alto_riesgo}</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-amber-700">Clientes en alerta</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{resumen.clientes_riesgo_medio}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-emerald-700">Saldo promedio con deuda</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(resumen.saldo_promedio)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveTab(tab.key); setError(''); setSuccess(''); }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition border-b-2 ${
                activeTab === tab.key ? 'border-rosewood text-rosewood' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'clientes' && (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Registrar cliente</h2>
                <p className="text-sm text-gray-600">Agrega un nuevo cliente de tienda / fiado.</p>
              </div>
              <button type="button" onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                <Plus className="h-4 w-4" />
                Nuevo cliente
              </button>
            </div>
          </section>

          <Modal isOpen={isModalOpen} onClose={resetForm} title={editingId ? 'Editar cliente' : 'Nuevo cliente'}>
            {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Nombre" />
                <input type="text" value={apellido} onChange={(e) => setApellido(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Apellido" />
              </div>
              <div>
                <input type="text" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${whatsapp && !isValidPhone(whatsapp) ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-rosewood'}`} placeholder="WhatsApp — 10 dígitos (57 se agrega automático)" />
                {whatsapp && !isValidPhone(whatsapp) && <p className="mt-1 text-xs text-red-600">Debe tener 7 (Bogotá), 10 (nacional) o 12 (con 57) dígitos</p>}
              </div>
              {editingId && (
                <div>
                  <input type="text" inputMode="numeric" value={deudaEdit} onChange={(e) => setDeudaEdit(e.target.value.replace(/\D/g, ''))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Deuda total (opcional)" />
                </div>
              )}
              <button type="submit" disabled={saving} className="w-full rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Guardar'}
              </button>
            </form>
          </Modal>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-700">Buscar clientes</p>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{filteredClientes.length} registros</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded-xl border-2 border-gray-200 py-3 pl-10 pr-4 text-base focus:border-rosewood focus:outline-none" placeholder="Buscar por nombre o WhatsApp" />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 font-semibold text-gray-700">Nombre</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">WhatsApp</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Deuda</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Estado</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan="5" className="px-3 py-8"><Skeleton lines={1} /></td></tr>}
                  {!loading && pagedClientes.length === 0 && <tr><td colSpan="5" className="px-3 py-8 text-center text-gray-500">No hay clientes para mostrar.</td></tr>}
                  {!loading && pagedClientes.map((cliente) => {
                    const deuda = Number(cliente.deuda_total || 0);
                    const nivel = nivelDeuda(deuda);
                    return (
                      <tr key={cliente.id} className="border-b border-gray-100">
                        <td className="px-3 py-3 font-medium text-gray-900">{cliente.nombre}</td>
                        <td className="px-3 py-3 text-gray-700">{cliente.telefono_whatsapp || '-'}</td>
                        <td className="px-3 py-3 text-gray-700">{formatMoney(deuda)}</td>
                        <td className="px-3 py-3">
                          {deuda > 0 ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${nivel.bg} ${nivel.text}`}>
                              <span className={`h-2 w-2 rounded-full ${nivel.dot}`} />
                              {nivel.label}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Sin deuda</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleVerDetalle(cliente)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">Ver detalles</button>
                            <button type="button" onClick={() => openEditModal(cliente)} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Editar</button>
                            <button type="button" onClick={() => handleDelete(cliente)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && <PaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />}
          </section>
        </>
      )}

      {activeTab === 'cobrar' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Cobrar fiados de tienda</h2>
                <p className="text-sm text-gray-600">Administra los cobros, abonos y deudas de clientes.</p>
              </div>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input type="text" value={cobroSearch} onChange={(e) => { setCobroSearch(e.target.value); setCobroPage(1); }} placeholder="Buscar por nombre o WhatsApp" className="w-full rounded-xl border-2 border-gray-200 py-3 pl-10 pr-4 text-base focus:border-rosewood focus:outline-none" />
            </div>
          </div>

          {cobroLoading && <div className="rounded-2xl border border-gray-200 bg-white p-10 shadow-sm"><Skeleton lines={3} /></div>}

          {!cobroLoading && cobroClientes.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600 shadow-sm">
              {cobroSearch ? 'No se encontraron clientes con deuda' : 'No hay clientes con deuda para cobrar'}
            </div>
          )}

          {!cobroLoading && cobroClientes.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {cobroClientes.map((cliente) => {
                const deuda = Number(cliente.deuda_total || 0);
                const nivel = nivelDeuda(deuda);
                const expanded = expandedCobroClientes.includes(cliente.id);
                return (
                  <article key={cliente.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-gray-900">{cliente.nombre}</p>
                        <p className="mt-1 text-sm text-gray-600">Deuda actual: {formatMoney(deuda)}</p>
                      </div>
                      <button type="button" onClick={() => handleAbrirWhatsapp(cliente)} disabled={!cliente.telefono_whatsapp} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
                        WhatsApp
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => toggleCobroCliente(cliente.id)} className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90">
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {expanded ? 'Ocultar detalles' : 'Ver detalles'}
                      </button>
                      <button type="button" onClick={() => handleRegistrarAbono(cliente)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100">Registrar abono</button>
                      <button type="button" onClick={() => handleSaldarDeuda(cliente)} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50">Saldar deuda</button>
                    </div>

                    {expanded && (
                      <div className="mt-4 space-y-3 rounded-2xl bg-gray-50 p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-gray-200 bg-white p-3">
                            <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">Saldo pendiente</p>
                            <p className={`mt-1 text-lg font-bold ${nivel.text}`}>{formatMoney(deuda)}</p>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white p-3">
                            <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">WhatsApp</p>
                            <p className="mt-1 text-lg font-bold text-gray-900">{cliente.telefono_whatsapp || 'Sin número'}</p>
                          </div>
                        </div>

                        <button type="button" onClick={() => handleVerDetalle(cliente)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white">Ver historial</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {cobroTotalPages > 1 && (
            <PaginationControls currentPage={cobroPage} totalPages={cobroTotalPages} onPageChange={setCobroPage} />
          )}
        </section>
      )}

      {/* Modal de abono */}
      {selectedClienteAbono && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-gray-900">Registrar abono</h3>
              <button type="button" onClick={() => setSelectedClienteAbono(null)} className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              Cliente: <span className="font-semibold text-gray-900">{selectedClienteAbono.nombre}</span>
              <br />
              Deuda actual: <span className="font-semibold text-rosewood">{formatMoney(selectedClienteAbono.deuda_total)}</span>
            </p>
            <form className="space-y-4" onSubmit={handleConfirmAbono}>
              <input type="text" inputMode="numeric" value={abonoMonto} onChange={(e) => setAbonoMonto(e.target.value.replace(/\D/g, ''))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none" placeholder="Monto del abono" />
              <div className="grid grid-cols-2 gap-2">
                {['efectivo', 'transferencia'].map((met) => (
                  <button key={met} type="button" onClick={() => setAbonoMetodo(met)} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${abonoMetodo === met ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                    {met === 'efectivo' ? '💵 Efectivo' : '📱 Transferencia'}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSelectedClienteAbono(null)} className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={savingAbono} className="flex-1 rounded-xl bg-rosewood px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300">
                  {savingAbono ? 'Guardando...' : 'Confirmar abono'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de detalle / historial */}
      {selectedClienteDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedClienteDetalle.nombre}</h3>
                <p className="text-sm text-gray-500">
                  Deuda total: <span className="font-bold text-rosewood">{formatMoney(selectedClienteDetalle.deuda_total)}</span>
                </p>
              </div>
              <button type="button" onClick={() => { setSelectedClienteDetalle(null); setDetalleMovimientos([]); }} className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>

            {detalleLoading && <div className="py-8 text-center text-sm text-gray-500">Cargando movimientos...</div>}

            {!detalleLoading && detalleMovimientos.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-500">No hay movimientos registrados.</div>
            )}

            {!detalleLoading && detalleMovimientos.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-300 font-semibold text-gray-700">
                      <th className="py-2 pr-2">Fecha</th>
                      <th className="py-2 pr-2">Cant</th>
                      <th className="py-2 pr-2">Producto</th>
                      <th className="py-2 pr-2 text-right">P.Unit</th>
                      <th className="py-2 pr-2 text-right">Total</th>
                      <th className="py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleMovimientos.map((mov) => {
                      const isAbono = mov.tipo === 'Abono';
                      return (
                        <tr key={`${mov.tipo}-${mov.id}`} className={`border-b ${isAbono ? 'bg-emerald-50/50' : ''}`}>
                          <td className="py-2 pr-2 text-gray-600">{new Date(mov.fecha).toLocaleDateString()}</td>
                          <td className="py-2 pr-2 text-gray-700">{isAbono ? '-' : mov.cantidad}</td>
                          <td className="py-2 pr-2 font-medium text-gray-900">{isAbono ? 'ABONO' : mov.articulo}</td>
                          <td className="py-2 pr-2 text-right text-gray-700">{isAbono ? '-' : formatMoney(mov.precio_unitario || 0)}</td>
                          <td className={`py-2 pr-2 text-right font-semibold ${isAbono ? 'text-emerald-700' : 'text-gray-900'}`}>
                            {isAbono ? `-${formatMoney(mov.monto)}` : formatMoney(mov.monto)}
                          </td>
                          <td className={`py-2 text-right font-semibold ${isAbono ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {mov.saldo !== null ? formatMoney(mov.saldo) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {detalleTotalPages > 1 && (
              <div className="mt-4">
                <PaginationControls currentPage={detallePage} totalPages={detalleTotalPages} onPageChange={handleDetallePageChange} />
              </div>
            )}
          </div>
        </div>
      )}

      {ConfirmModal}
    </div>
  );
};

export default ClientesTienda;
