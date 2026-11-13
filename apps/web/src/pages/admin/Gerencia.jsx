import { Link } from 'react-router-dom';
import {
  BarChart3, FileText, Gift, LayoutDashboard, Package, Receipt, Shield, ShieldCheck, ShoppingCart, Truck, Users, Wallet,
} from 'lucide-react';
import usePageTitle from '../../hooks/usePageTitle';

// El superadmin no tiene tablas propias de cada modulo: entra a las MISMAS pantallas que usan el vendedor y el admin.
const GRUPOS_GERENCIA = [
  {
    titulo: 'Control',
    descripcion: 'Quién usa el sistema y qué hace.',
    accesos: [
      { texto: 'Vendedores', ruta: '/admin/vendedores', icono: Users, detalle: 'Altas, claves, desactivar y cerrar sesiones' },
      { texto: 'Administradores', ruta: '/admin/admins', icono: Shield, detalle: 'Quienes manejan la cartera' },
      { texto: 'Auditorías', ruta: '/admin/auditorias', icono: ShieldCheck, detalle: 'Historial de todo lo que se hace' },
      { texto: 'Informes', ruta: '/admin/informes', icono: BarChart3, detalle: 'Ventas y rankings' },
    ],
  },
  {
    titulo: 'Tienda',
    descripcion: 'Lo mismo que ve el vendedor.',
    accesos: [
      { texto: 'Dashboard', ruta: '/dashboard', icono: LayoutDashboard, detalle: 'Resumen de la tienda' },
      { texto: 'Caja', ruta: '/caja', icono: Wallet, detalle: 'Turnos, ingresos y gastos' },
      { texto: 'Ventas', ruta: '/ventas', icono: ShoppingCart, detalle: 'Punto de venta' },
      { texto: 'Inventario', ruta: '/inventario', icono: Package, detalle: 'Productos y stock' },
      { texto: 'Proveedores', ruta: '/proveedores', icono: Truck, detalle: 'Proveedores y pedidos' },
      { texto: 'Facturas', ruta: '/facturas', icono: FileText, detalle: 'Facturas de compra' },
      { texto: 'Gastos', ruta: '/gastos', icono: Receipt, detalle: 'Gastos operativos' },
      { texto: 'Clientes', ruta: '/clientes', icono: Users, detalle: 'Fiado de la tienda' },
      { texto: 'Fidelización', ruta: '/fidelizacion', icono: Gift, detalle: 'Puntos y bonos' },
    ],
  },
  {
    titulo: 'Cartera',
    descripcion: 'Lo mismo que ve el administrador.',
    accesos: [
      { texto: 'Dashboard', ruta: '/cartera/dashboard', icono: LayoutDashboard, detalle: 'Resumen de cartera' },
      { texto: 'Clientes', ruta: '/cartera/clientes', icono: Users, detalle: 'Registro y deuda' },
      { texto: 'Venta', ruta: '/cartera/venta', icono: ShoppingCart, detalle: 'Registrar ventas' },
      { texto: 'Productos', ruta: '/cartera/productos', icono: Package, detalle: 'Catálogo de cartera' },
      { texto: 'Cobrar', ruta: '/cartera/cobrar', icono: Wallet, detalle: 'Cobros y abonos' },
    ],
  },
];

const Gerencia = () => {
  usePageTitle('Gerencia');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gerencia</h1>
        <p className="text-sm text-gray-600">Control del sistema y acceso directo a las pantallas de la tienda y de la cartera.</p>
      </div>
      {GRUPOS_GERENCIA.map((grupo) => (
        <section key={grupo.titulo} aria-label={grupo.titulo} className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{grupo.titulo}</h2>
            <p className="text-sm text-gray-500">{grupo.descripcion}</p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {grupo.accesos.map((acceso) => {
              const Icon = acceso.icono;
              return (
                <li key={acceso.ruta}>
                  <Link to={acceso.ruta} className="flex h-full items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-rosewood hover:shadow-md">
                    <span className="rounded-xl bg-blush-50 p-2 text-rosewood"><Icon className="h-5 w-5" /></span>
                    <span>
                      <span className="block font-semibold text-gray-900">{acceso.texto}</span>
                      <span className="block text-sm text-gray-500">{acceso.detalle}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default Gerencia;
