import { PencilLine, Trash2 } from 'lucide-react';

const actionButtonClass = 'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition';
const editButtonClass = `${actionButtonClass} border-blush-300 text-rosewood hover:bg-blush-50`;
const deleteButtonClass = `${actionButtonClass} border-red-200 text-red-700 hover:bg-red-50`;

const AdminTable = ({ columns, data, onEdit, onDelete, minWidth }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm" style={minWidth ? { minWidth } : undefined}>
      <thead>
        <tr className="border-b border-blush-300/70 text-xs uppercase tracking-[0.18em] text-rosewood/55">
          {columns.map((col) => (
            <th key={col.key} className={`px-3 py-3 ${col.align === 'right' ? 'text-right' : ''}`}>
              {col.label}
            </th>
          ))}
          {(onEdit || onDelete) && <th className="px-3 py-3">Acciones</th>}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={columns.length + ((onEdit || onDelete) ? 1 : 0)} className="px-3 py-8 text-center text-sm text-rosewood/50">
              No hay registros
            </td>
          </tr>
        ) : (
          data.map((item) => (
            <tr key={item.id ?? item.venta_id} className="border-b border-blush-50 text-rosewood">
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-3 ${col.align === 'right' ? 'text-right' : ''} ${col.mono ? 'font-semibold' : ''}`}>
                  {col.render ? col.render(item) : item[col.key] ?? '-'}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {onEdit && (
                      <button onClick={() => onEdit(item)} className={editButtonClass}>
                        <PencilLine className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(item)} className={deleteButtonClass}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Borrar
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export default AdminTable;
