import { useEffect, useMemo, useState } from 'react';
import { Save, Search, Trash2, UserRound } from 'lucide-react';
import PaginationControls from '../components/PaginationControls';
import { useAuth } from '../auth/AuthContext';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/httpClient';

const PAGE_SIZE = 10;

const normalizeWhatsapp = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `57${digits}`;
  return digits;
};

const ClientesTienda = () => {
  const { token } = useAuth();

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadClientes = async () => {
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
  };

  useEffect(() => {
    loadClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filteredClientes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return clientes;

    return clientes.filter((cliente) => {
      const nombreCliente = String(cliente.nombre || '').toLowerCase();
      const telefono = String(cliente.telefono_whatsapp || '').toLowerCase();
      return nombreCliente.includes(q) || telefono.includes(q);
    });
  }, [clientes, searchTerm]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredClientes.length / PAGE_SIZE));
  }, [filteredClientes.length]);

  const pagedClientes = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredClientes.slice(start, start + PAGE_SIZE);
  }, [filteredClientes, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const resetForm = () => {
    setNombre('');
    setApellido('');
    setWhatsapp('');
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const n = nombre.trim();
    const a = apellido.trim();
    if (!n || !a) {
      setError('Nombre y apellido son obligatorios');
      return;
    }

    const fullName = `${n} ${a}`.trim();
    const normalizedPhone = normalizeWhatsapp(whatsapp);

    try {
      setSaving(true);

      if (editingId) {
        await apiPatch(`/api/clientes/tienda-fiado/${editingId}`, {
          nombre: fullName,
          telefono_whatsapp: normalizedPhone || null,
        });
      } else {
        await apiPost('/api/clientes/tienda-fiado', {
          nombre: fullName,
          telefono_whatsapp: normalizedPhone || null,
        });
      }

      setSuccess(editingId ? 'Cliente actualizado correctamente' : 'Cliente creado correctamente');
      resetForm();
      await loadClientes();
    } catch (err) {
      setError(err.message || 'No fue posible guardar el cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (cliente) => {
    const fullName = String(cliente.nombre || '').trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts.shift() || '';
    const lastName = parts.join(' ');

    setNombre(firstName);
    setApellido(lastName);
    setWhatsapp(String(cliente.telefono_whatsapp || ''));
    setEditingId(cliente.id);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (cliente) => {
    if (!window.confirm(`¿Eliminar cliente ${cliente.nombre}?`)) return;

    try {
      setError('');
      setSuccess('');

      await apiDelete(`/api/clientes/tienda-fiado/${cliente.id}`);

      setSuccess('Cliente eliminado correctamente');
      await loadClientes();
    } catch (err) {
      setError(err.message || 'No fue posible eliminar el cliente');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <UserRound className="h-8 w-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes de Tienda</h1>
          <p className="text-gray-600">CRUD básico para ventas y fiados de tienda</p>
        </div>
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

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">
          {editingId ? 'Editar cliente' : 'Registrar cliente'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Nombre"
            />
            <input
              type="text"
              value={apellido}
              onChange={(event) => setApellido(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
              placeholder="Apellido"
            />
          </div>

          <input
            type="text"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none"
            placeholder="WhatsApp (+57 por defecto)"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-rosewood px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Guardar'}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-700">Buscar clientes</p>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
            {filteredClientes.length} registros
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 py-3 pl-10 pr-4 text-base focus:border-rosewood focus:outline-none"
            placeholder="Buscar por nombre o WhatsApp"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-3 font-semibold text-gray-700">Nombre</th>
                <th className="px-3 py-3 font-semibold text-gray-700">WhatsApp</th>
                <th className="px-3 py-3 font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="3" className="px-3 py-8 text-center text-gray-500">Cargando clientes...</td>
                </tr>
              )}

              {!loading && pagedClientes.length === 0 && (
                <tr>
                  <td colSpan="3" className="px-3 py-8 text-center text-gray-500">No hay clientes para mostrar.</td>
                </tr>
              )}

              {!loading && pagedClientes.map((cliente) => (
                <tr key={cliente.id} className="border-b border-gray-100">
                  <td className="px-3 py-3 font-medium text-gray-900">{cliente.nombre}</td>
                  <td className="px-3 py-3 text-gray-700">{cliente.telefono_whatsapp || '-'}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(cliente)}
                        className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(cliente)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}
      </section>
    </div>
  );
};

export default ClientesTienda;
