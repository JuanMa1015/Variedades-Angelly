import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Gift,
  Wallet,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const Sidebar = ({
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const menuItems = [
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      description: 'Resumen del negocio',
    },
    {
      label: 'Admin',
      path: '/admin',
      icon: Shield,
      description: 'Tablas y CRUD centralizado',
    },
    {
      label: 'Inventario',
      path: '/inventario',
      icon: Package,
      description: 'Gestión de Stock',
    },
    {
      label: 'Ventas',
      path: '/ventas',
      icon: ShoppingCart,
      description: 'Punto de Venta',
    },
    {
      label: 'Proveedores',
      path: '/proveedores',
      icon: Truck,
      description: 'Gestión de Proveedores',
    },
    {
      label: 'Fidelización',
      path: '/fidelizacion',
      icon: Gift,
      description: 'Clientes para Bonos',
    },
    {
      label: 'Gastos',
      path: '/gastos',
      icon: Wallet,
      description: 'Control de egresos',
    },
  ];

  const visibleItems =
    user?.role === 'vendedor'
      ? menuItems.filter((item) => item.path !== '/admin')
      : menuItems;

  const isActive = (path) => location.pathname === path;

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
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-40 h-screen bg-white border-r border-gray-200
          transition-all duration-300 ease-in-out flex flex-col
          w-72 ${isCollapsed ? 'md:w-20' : 'md:w-64'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
      >
      {/* Logo / Header */}
      <div className="h-16 flex items-center justify-between border-b border-gray-200 px-4 md:justify-center md:px-0">
        <div className={`transition-all duration-300 ${isCollapsed ? 'md:hidden' : 'block'}`}>
          <h2 className="text-lg font-bold text-rosewood">Angelly</h2>
        </div>
        {isCollapsed && (
          <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-blush-100 text-sm font-bold text-rosewood md:flex">
            A
          </div>
        )}

        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 md:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 px-2 py-4 space-y-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                ${
                  active
                    ? 'bg-blush-100 text-rosewood font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }
              `}
              title={isCollapsed ? item.label : ''}
              onClick={onCloseMobile}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <div className={`flex flex-1 flex-col ${isCollapsed ? 'md:hidden' : ''}`}>
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-xs text-gray-500">{item.description}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Badge */}
      <div className="px-3 pb-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 flex items-center gap-2">
          <Shield className="w-4 h-4 text-rosewood" />
          <div className={`${isCollapsed ? 'md:hidden' : ''}`}>
            <div>
              <p className="text-xs font-bold text-gray-800">{user?.username ?? 'Usuario'}</p>
              <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500">
                {user?.role === 'admin' ? 'ADMIN' : 'VENDEDOR'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Collapse Button */}
      <div className="border-t border-gray-200 p-2 space-y-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors duration-200"
          title="Cerrar sesión"
        >
          <LogOut className="w-5 h-5" />
          <span className={`${isCollapsed ? 'md:hidden' : ''} text-sm font-medium`}>Cerrar sesión</span>
        </button>

        <button
          onClick={onToggleCollapse}
          className="hidden w-full items-center justify-center gap-2 rounded-lg bg-blush-100 px-4 py-3 text-rosewood transition-colors duration-200 hover:bg-blush-200 md:flex"
          title={isCollapsed ? 'Expandir' : 'Contraer'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
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
