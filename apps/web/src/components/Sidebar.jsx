import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Gift,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Shield,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const Sidebar = ({ isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const currentModule = (() => {
    if (location.pathname.startsWith('/admin')) return 'Gerencia';
    if (location.pathname.startsWith('/cartera')) return 'Cartera';
    if (['/caja', '/ventas', '/clientes', '/inventario', '/proveedores', '/fidelizacion', '/facturas', '/gastos', '/dashboard'].some((path) => location.pathname.startsWith(path))) {
      return 'Ventas';
    }
    return 'Panel';
  })();

  const sections = (() => {
    const vendedorItems = [
      { label: 'Caja', path: '/caja', icon: Wallet, description: 'Apertura y cierre de caja' },
      { label: 'Ventas', path: '/ventas', icon: ShoppingCart, description: 'Punto de Venta' },
      { label: 'Gastos', path: '/gastos', icon: Receipt, description: 'Gastos operativos' },
      { label: 'Clientes', path: '/clientes', icon: Users, description: 'Clientes de tienda' },
      { label: 'Inventario', path: '/inventario', icon: Package, description: 'Gestión de Stock' },
      { label: 'Proveedores', path: '/proveedores', icon: Truck, description: 'Gestión de Proveedores' },
      { label: 'Fidelización', path: '/fidelizacion', icon: Gift, description: 'Clientes para Bonos' },
    ];

    const adminItems = [
      { label: 'Dashboard', path: '/cartera/dashboard', icon: LayoutDashboard, description: 'Resumen de cartera' },
      { label: 'Clientes', path: '/cartera/clientes', icon: Users, description: 'Registro de clientes' },
      { label: 'Venta cartera', path: '/cartera/venta', icon: ShoppingCart, description: 'Registrar ventas' },
      { label: 'Productos', path: '/cartera/productos', icon: Package, description: 'Agregar productos cartera' },
      { label: 'Cobrar', path: '/cartera/cobrar', icon: Wallet, description: 'Cobros y abonos' },
    ];

    if (user?.role === 'superadmin') {
      return [
        {
          title: 'Vendedor',
          items: [
            { label: 'Productos', path: '/admin/productos', icon: Package, description: 'CRUD de productos' },
            { label: 'Proveedores', path: '/admin/proveedores', icon: Truck, description: 'CRUD de proveedores' },
            { label: 'Gastos', path: '/admin/gastos', icon: Receipt, description: 'Gastos operativos' },
            { label: 'Pedidos proveedor', path: '/admin/pedidos-proveedor', icon: Receipt, description: 'Pedidos enviados' },
          ],
        },
        {
          title: 'Cartera',
          items: [
            { label: 'Ventas', path: '/admin/ventas', icon: ShoppingCart, description: 'Historial de ventas' },
            { label: 'Clientes cartera', path: '/admin/clientes-cartera', icon: Users, description: 'Clientes con cupo' },
            { label: 'Abonos cartera', path: '/admin/abonos-cartera', icon: Wallet, description: 'Abonos registrados' },
          ],
        },
        {
          title: 'SuperAdmin',
          items: [
            { label: 'Admins', path: '/admin/admins', icon: Shield, description: 'CRUD de usuarios admin' },
            { label: 'Vendedores', path: '/admin/vendedores', icon: Shield, description: 'CRUD de usuarios vendedores' },
            { label: 'Clientes tienda', path: '/admin/clientes-tienda', icon: Users, description: 'Clientes de tienda' },
            { label: 'Clientes fidelización', path: '/admin/clientes-fidelizacion', icon: Gift, description: 'Programa de puntos' },
            { label: 'Facturas compra', path: '/admin/facturas-compra', icon: Receipt, description: 'Facturas de compra' },
            { label: 'Auditorías', path: '/admin/auditorias', icon: Shield, description: 'Historial de acciones' },
            { label: 'Informes', path: '/admin/informes', icon: BarChart3, description: 'Ventas y rankings' },
          ],
        },
      ];
    }

    if (user?.role === 'admin') {
      return [{ title: 'Admin', items: adminItems }];
    }

    if (user?.role === 'vendedor') {
      return [{ title: 'Vendedor', items: vendedorItems }];
    }

    return [];
  })();

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
    onCloseMobile();
  };

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú lateral"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[1px] md:hidden"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-dvh flex-col border-r border-blush-300 bg-[linear-gradient(180deg,#fdf1f1_0%,#fbe3e3_50%,#f9d6d5_100%)] shadow-[0_28px_80px_rgba(106,63,67,0.12)] backdrop-blur transition-all duration-300 ease-in-out w-[min(88vw,19rem)] md:w-[18rem] lg:w-[19rem] ${isMobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'} ${isCollapsed ? 'md:-translate-x-full md:opacity-0 md:pointer-events-none' : 'md:translate-x-0 md:opacity-100 md:pointer-events-auto'}`}>
        <div className="flex h-16 items-center justify-between border-b border-blush-300 px-4">
          <div className={`${isCollapsed ? 'md:hidden' : 'block'}`}>
            <h2 className="text-lg font-black tracking-tight text-rosewood">Angelly</h2>
            <p className="text-[11px] uppercase tracking-[0.22em] text-rosewood/80">Panel operativo</p>
          </div>

          {isCollapsed && (
            <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#a9646a] text-sm font-black text-white md:flex">
              A
            </div>
          )}

          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onCloseMobile}
            className="inline-flex items-center justify-center rounded-full border border-blush-300 p-2 text-rosewood hover:bg-blush-50 md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {user?.role === 'superadmin' && (
            <div className="mx-1 rounded-2xl border border-[#e6b4b7] bg-white/70 px-3 py-2 text-xs text-rosewood shadow-sm">
              <p className="uppercase tracking-[0.18em] text-rosewood/80">Módulo activo</p>
              <p className="mt-1 text-sm font-bold">{currentModule}</p>
            </div>
          )}
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="px-3 text-xs font-bold uppercase text-rosewood/80/90">{section.title}</div>
              <div className="space-y-2">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`group flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${
                        active
                          ? 'border border-blush-300 bg-white/75 text-rosewood shadow-sm'
                          : 'border border-transparent text-rosewood/75 hover:border-blush-300 hover:bg-white/55'
                      }`}
                      title={isCollapsed ? item.label : ''}
                      onClick={onCloseMobile}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0 text-rosewood/80 transition group-hover:text-rosewood" />
                      <div className={`flex flex-1 flex-col ${isCollapsed ? 'md:hidden' : ''}`}>
                        <span className="text-sm font-semibold">{item.label}</span>
                        <span className="text-xs text-rosewood/60">{item.description}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-blush-300 p-2">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/80 px-4 py-3 text-rosewood transition-colors duration-200 hover:bg-white"
            title="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
            <span className={`${isCollapsed ? 'md:hidden' : ''} text-sm font-medium`}>Cerrar sesión</span>
          </button>

          <button
            onClick={onToggleCollapse}
            className="hidden w-full items-center justify-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-rosewood transition-colors duration-200 hover:bg-white md:flex"
            title={isCollapsed ? 'Expandir' : 'Contraer'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm font-medium">Contraer</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
