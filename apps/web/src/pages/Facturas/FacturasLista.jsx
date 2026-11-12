import { Fragment, useState } from 'react';
import { Ban, ChevronDown, ChevronUp, Printer, Search } from 'lucide-react';
import PaymentBadge from '../../components/PaymentBadge';
import SelectBuscable from '../../components/SelectBuscable';
import Skeleton from '../../components/Skeleton';
import { formatDateTime, formatMoney } from '../../utils/format';
import AnularVentaForm from '../Ventas/AnularVentaForm';
import { MEDIOS_PAGO, etiquetaMedio } from './facturasHelpers';

const SELECT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const FECHA = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';

const margen = (factura) => (factura.porcentaje_ganancia ? `${((1 - factura.porcentaje_ganancia) * 100).toFixed(0)}%` : '-');

const Filtros = ({ texto, onTexto, filtros, onFiltro, proveedores }) => (
  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div className="relative sm:col-span-2 lg:col-span-4">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      <label htmlFor="facturas-buscar" className="sr-only">Buscar factura</label>
      <input id="facturas-buscar" type="search" value={texto} onChange={(e) => onTexto(e.target.value)} placeholder="Buscar por número de factura o proveedor" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-rosewood focus:outline-none" />
    </div>
    <div>
      <SelectBuscable
        id="facturas-filtro-proveedor"
        ariaLabel="Filtrar por proveedor"
        value={filtros.proveedorId}
        onChange={(valor) => onFiltro({ proveedorId: valor })}
        opciones={proveedores.map((p) => ({ valor: String(p.id), etiqueta: p.nombre }))}
        placeholder="Todos los proveedores"
      />
    </div>
    <div>
      <label htmlFor="facturas-filtro-medio" className="sr-only">Filtrar por medio de pago</label>
      <select id="facturas-filtro-medio" value={filtros.medio} onChange={(e) => onFiltro({ medio: e.target.value })} className={SELECT}>
        <option value="">Todos los medios</option>
        {MEDIOS_PAGO.map(({ id }) => <option key={id} value={id}>{etiquetaMedio(id)}</option>)}
      </select>
    </div>
    <div>
      <label htmlFor="facturas-filtro-estado" className="sr-only">Filtrar por estado</label>
      <select id="facturas-filtro-estado" value={filtros.estado} onChange={(e) => onFiltro({ estado: e.target.value })} className={SELECT}>
        <option value="todas">Todas</option>
        <option value="vigentes">Vigentes</option>
        <option value="anuladas">Anuladas</option>
      </select>
    </div>
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
      <label htmlFor="facturas-desde" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Desde</label>
      <input id="facturas-desde" type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => onFiltro({ desde: e.target.value })} className={FECHA} />
      <label htmlFor="facturas-hasta" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hasta</label>
      <input id="facturas-hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => onFiltro({ hasta: e.target.value })} className={FECHA} />
    </div>
  </div>
);

const Detalle = ({ factura }) => (
  <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-gray-500">
          {['Producto', 'Cant.', 'Precio unit.', 'IVA', 'Total línea', 'Venta sugerida'].map((titulo) => <th key={titulo} className="px-2 py-1 font-semibold">{titulo}</th>)}
        </tr>
      </thead>
      <tbody>
        {factura.items.map((item, i) => (
          <tr key={`${item.producto_id}-${i}`} className="border-t border-gray-200 text-gray-800">
            <td className="px-2 py-1 font-medium">{item.nombre_producto}</td>
            <td className="px-2 py-1">{item.cantidad}</td>
            <td className="px-2 py-1">{formatMoney(item.precio_unitario)}</td>
            <td className="px-2 py-1">{item.aplica_iva ? 'Sí' : 'No'}</td>
            <td className="px-2 py-1 font-semibold">{formatMoney(item.precio_total)}</td>
            <td className="px-2 py-1">{item.precio_venta_sugerido ? formatMoney(item.precio_venta_sugerido) : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="mt-2 text-xs text-gray-500">Registrada por {factura.creado_por} · {formatDateTime(factura.fecha_creacion)}{factura.anulada && factura.anulada_por ? ` · Anulada por ${factura.anulada_por}${factura.autorizada_por ? ` (autorizó ${factura.autorizada_por})` : ''}` : ''}</p>
  </div>
);

const Estado = ({ factura }) => factura.anulada && (
  <>
    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Anulada</span>
    {factura.motivo_anulacion && <span className="block text-xs font-normal text-red-700">Motivo: {factura.motivo_anulacion}</span>}
  </>
);

const Medio = ({ factura }) => (['efectivo', 'transferencia', 'tarjeta'].includes(factura.medio_pago)
  ? <PaymentBadge method={factura.medio_pago} compact />
  : <span className="text-xs text-gray-500">{etiquetaMedio(factura.medio_pago)}</span>);

const Acciones = ({ factura, abierta, onToggleDetalle, onPrint, anulacion }) => (
  <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => onToggleDetalle(factura.id)} aria-expanded={abierta} aria-label={`${abierta ? 'Ocultar' : 'Ver'} detalle de la factura ${factura.id}`} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-200">
      {abierta ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
      Detalle
    </button>
    <button type="button" onClick={() => onPrint(factura)} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-200">
      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
      Ticket
    </button>
    {!factura.anulada && (
      <button type="button" onClick={() => anulacion.onToggle(factura.id)} aria-label={`Anular factura ${factura.id}`} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
        Anular
      </button>
    )}
  </div>
);

const FormularioAnular = ({ factura, anulacion }) => (
  <AnularVentaForm pideAutorizacion={anulacion.pideAutorizacion} saving={anulacion.saving} error={anulacion.error} onSubmit={(datos) => anulacion.onAnular(factura, datos)} onCancel={() => anulacion.onToggle(factura.id)} />
);

// `anulacion`: { id (factura abierta), pideAutorizacion, saving, error, onToggle, onAnular }.
const FacturasLista = ({ facturas, loading, hayFiltros, texto, onTexto, filtros, onFiltro, proveedores, onPrint, anulacion }) => {
  const [detalleId, setDetalleId] = useState(null);
  const alternarDetalle = (id) => setDetalleId((actual) => (actual === id ? null : id));

  return (
    <>
      <Filtros texto={texto} onTexto={onTexto} filtros={filtros} onFiltro={onFiltro} proveedores={proveedores} />
      {loading && <Skeleton lines={3} />}
      {!loading && facturas.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">{hayFiltros ? 'No se encontraron facturas con ese criterio.' : 'No hay facturas registradas.'}</p>
      )}
      {!loading && facturas.length > 0 && (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Factura', 'No. Factura', 'Proveedor', 'Pagada con', 'Subtotal', 'IVA', 'Encomienda', 'Total', 'Margen', 'Items', 'Acción'].map((titulo) => (
                    <th key={titulo} className="px-3 py-3 font-semibold text-gray-700">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facturas.map((factura) => (
                  <Fragment key={factura.id}>
                    <tr className={`border-b border-gray-100 ${factura.anulada ? 'bg-gray-50/60 text-gray-400' : ''}`}>
                      <td className="px-3 py-3 font-semibold text-gray-900">#{factura.id}<Estado factura={factura} /></td>
                      <td className="px-3 py-3 text-gray-700">{factura.numero_factura || '-'}</td>
                      <td className="px-3 py-3 text-gray-700">{factura.proveedor_nombre}</td>
                      <td className="px-3 py-3"><Medio factura={factura} /></td>
                      <td className="px-3 py-3 text-gray-700">{formatMoney(factura.subtotal)}</td>
                      <td className="px-3 py-3 text-gray-700">{formatMoney(factura.total_iva)}</td>
                      <td className="px-3 py-3 text-gray-700">{factura.encomienda ? formatMoney(factura.encomienda) : '-'}</td>
                      <td className={`px-3 py-3 font-semibold ${factura.anulada ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatMoney(factura.total_factura)}</td>
                      <td className="px-3 py-3 text-gray-700">{margen(factura)}</td>
                      <td className="px-3 py-3 text-gray-700">{factura.items.length}</td>
                      <td className="px-3 py-3"><Acciones factura={factura} abierta={detalleId === factura.id} onToggleDetalle={alternarDetalle} onPrint={onPrint} anulacion={anulacion} /></td>
                    </tr>
                    {detalleId === factura.id && (
                      <tr className="border-b border-gray-100"><td colSpan="11" className="px-3 pb-3"><Detalle factura={factura} /></td></tr>
                    )}
                    {anulacion.id === factura.id && (
                      <tr className="border-b border-gray-100"><td colSpan="11" className="px-3 pb-3"><FormularioAnular factura={factura} anulacion={anulacion} /></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {facturas.map((factura) => (
              <li key={factura.id} className={`rounded-xl border p-4 shadow-sm ${factura.anulada ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-200 bg-white'}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="font-semibold text-gray-900">#{factura.id} - {factura.proveedor_nombre}<Estado factura={factura} /></span>
                  <Medio factura={factura} />
                </div>
                {factura.numero_factura && (
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="text-gray-500">No. Factura:</span><span className="font-semibold text-gray-900">{factura.numero_factura}</span></div>
                )}
                <div className="mb-1 flex items-center justify-between text-sm"><span className="text-gray-500">Subtotal:</span><span className="text-gray-900">{formatMoney(factura.subtotal)}</span></div>
                <div className="mb-1 flex items-center justify-between text-sm"><span className="text-gray-500">IVA:</span><span className="text-gray-900">{formatMoney(factura.total_iva)}</span></div>
                {factura.encomienda ? (
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="text-gray-500">Encomienda:</span><span className="text-gray-900">{formatMoney(factura.encomienda)}</span></div>
                ) : null}
                <div className="mb-1 flex items-center justify-between text-sm"><span className="text-gray-500">Margen:</span><span className="text-gray-900">{margen(factura)}</span></div>
                <div className="mb-3 flex items-center justify-between text-sm"><span className="text-gray-500">Total ({factura.items.length} ítems):</span><span className={`font-semibold ${factura.anulada ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatMoney(factura.total_factura)}</span></div>
                <Acciones factura={factura} abierta={detalleId === factura.id} onToggleDetalle={alternarDetalle} onPrint={onPrint} anulacion={anulacion} />
                {detalleId === factura.id && <div className="mt-3"><Detalle factura={factura} /></div>}
                {anulacion.id === factura.id && <FormularioAnular factura={factura} anulacion={anulacion} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
};

export default FacturasLista;
