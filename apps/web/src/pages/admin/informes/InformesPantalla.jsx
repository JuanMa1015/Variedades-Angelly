import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../../api/httpClient';
import { useAuth } from '../../../auth/AuthContext';
import ErrorMessage from '../../../components/ErrorMessage';
import Skeleton from '../../../components/Skeleton';
import { formatMoney } from '../../../utils/format';

const VACIO = {
  ventas_totales: 0,
  facturacion_total: 0,
  vendedor_mas_vendedor: null,
  vendedores_top: [],
  producto_mas_vendido: null,
  productos_menos_vendidos: [],
};

const InformesPantalla = () => {
  const { token } = useAuth();
  const [informes, setInformes] = useState(VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async (signal) => {
    if (!token) return;
    setLoading(true);
    try {
      const datos = await apiGet('/api/superadmin/informes', { signal });
      if (signal?.aborted) return;
      setInformes({
        ventas_totales: Number(datos?.ventas_totales || 0),
        facturacion_total: Number(datos?.facturacion_total || 0),
        vendedor_mas_vendedor: datos?.vendedor_mas_vendedor || null,
        vendedores_top: Array.isArray(datos?.vendedores_top) ? datos.vendedores_top : [],
        producto_mas_vendido: datos?.producto_mas_vendido || null,
        productos_menos_vendidos: Array.isArray(datos?.productos_menos_vendidos) ? datos.productos_menos_vendidos : [],
      });
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'No fue posible cargar los informes');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    void cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorMessage message={error} />
        <button type="button" onClick={() => cargar()} className="rounded-full bg-rosewood px-4 py-2 text-sm font-semibold text-white">Reintentar</button>
      </div>
    );
  }
  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
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
  );
};

export default InformesPantalla;
