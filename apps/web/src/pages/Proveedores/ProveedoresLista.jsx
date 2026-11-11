import { Pencil, Power, Search, Trash2 } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { telefonoLegible } from '../../utils/whatsapp';

const BOTON = 'rounded-lg border p-1.5 transition';

const EstadoBadge = ({ activo }) => (activo
  ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Activo</span>
  : <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">Inactivo</span>);

const Acciones = ({ proveedor, puedeBorrar, onEditar, onToggle, onBorrar }) => (
  <div className="flex items-center gap-2">
    <button type="button" onClick={() => onEditar(proveedor)} className={`${BOTON} border-gray-300 text-gray-600 hover:bg-gray-100`} title="Editar proveedor" aria-label="Editar proveedor">
      <Pencil className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={() => onToggle(proveedor)}
      className={`${BOTON} ${proveedor.activo ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
      title={proveedor.activo ? 'Desactivar proveedor' : 'Activar proveedor'}
      aria-label={proveedor.activo ? 'Desactivar proveedor' : 'Activar proveedor'}
    >
      <Power className="h-4 w-4" />
    </button>
    {puedeBorrar && (
      <button type="button" onClick={() => onBorrar(proveedor)} className={`${BOTON} border-red-200 text-red-600 hover:bg-red-50`} title="Eliminar proveedor" aria-label="Eliminar proveedor">
        <Trash2 className="h-4 w-4" />
      </button>
    )}
  </div>
);

const Chip = ({ activo, onClick, children }) => (
  <button type="button" aria-pressed={activo} onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${activo ? 'border-rosewood bg-rosewood text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
    {children}
  </button>
);

// Buscador + pestañas Activos/Inactivos + tabla (escritorio) o tarjetas (celular).
const ProveedoresLista = ({ proveedores, loading, vista, onVista, busqueda, onBusqueda, puedeBorrar, onEditar, onToggle, onBorrar }) => {
  const activos = proveedores.filter((p) => p.activo).length;
  const texto = busqueda.trim().toLowerCase();
  const visibles = proveedores
    .filter((p) => (vista === 'activos' ? p.activo : !p.activo))
    .filter((p) => !texto || [p.nombre, p.contacto, p.telefono, telefonoLegible(p.telefono)].some((campo) => String(campo ?? '').toLowerCase().includes(texto)));
  const acciones = { puedeBorrar, onEditar, onToggle, onBorrar };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <label htmlFor="buscar-proveedor" className="sr-only">Buscar proveedor</label>
          <input id="buscar-proveedor" type="search" value={busqueda} onChange={(e) => onBusqueda(e.target.value)} placeholder="Buscar por nombre, contacto o teléfono" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none" />
        </div>
        <div className="flex gap-2" role="group" aria-label="Estado de los proveedores">
          <Chip activo={vista === 'activos'} onClick={() => onVista('activos')}>Activos ({activos})</Chip>
          <Chip activo={vista === 'inactivos'} onClick={() => onVista('inactivos')}>Inactivos ({proveedores.length - activos})</Chip>
        </div>
      </div>

      {loading && <Skeleton lines={3} />}
      {!loading && visibles.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">
          {texto ? 'No se encontraron proveedores con ese criterio.' : vista === 'activos' ? 'No hay proveedores activos.' : 'No hay proveedores inactivos.'}
        </p>
      )}
      {!loading && visibles.length > 0 && (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Nombre', 'Contacto', 'Teléfono', 'Estado', 'Acciones'].map((titulo) => (
                    <th key={titulo} className="px-3 py-3 font-semibold text-gray-700">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((proveedor) => (
                  <tr key={proveedor.id} className="border-b border-gray-100">
                    <td className="px-3 py-3 font-medium text-gray-900">{proveedor.nombre}</td>
                    <td className="px-3 py-3 text-gray-700">{proveedor.contacto || '-'}</td>
                    <td className="px-3 py-3 text-gray-700">{telefonoLegible(proveedor.telefono) || '-'}</td>
                    <td className="px-3 py-3"><EstadoBadge activo={proveedor.activo} /></td>
                    <td className="px-3 py-3"><Acciones proveedor={proveedor} {...acciones} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {visibles.map((proveedor) => (
              <li key={proveedor.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="font-semibold text-gray-900">{proveedor.nombre}</span>
                  <EstadoBadge activo={proveedor.activo} />
                </div>
                <p className="text-sm text-gray-600">Contacto: {proveedor.contacto || '-'}</p>
                <p className="text-sm text-gray-600">Tel: {telefonoLegible(proveedor.telefono) || '-'}</p>
                <div className="mt-3"><Acciones proveedor={proveedor} {...acciones} /></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
};

export default ProveedoresLista;
