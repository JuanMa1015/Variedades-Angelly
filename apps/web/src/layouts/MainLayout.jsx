import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PanelLeft, Shield } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../auth/AuthContext';

const MODULE_LABELS = [
  { path: '/admin/admins', label: 'Gerencia · Admins' },
  { path: '/admin/vendedores', label: 'Gerencia · Vendedores' },
  { path: '/admin/productos', label: 'Gerencia · Productos' },
  { path: '/admin/proveedores', label: 'Gerencia · Proveedores' },
  { path: '/admin/clientes-cartera', label: 'Gerencia · Clientes cartera' },
  { path: '/admin/clientes-tienda', label: 'Gerencia · Clientes tienda' },
  { path: '/admin/clientes-fidelizacion', label: 'Gerencia · Clientes fidelización' },
  { path: '/admin/ventas', label: 'Gerencia · Ventas' },
  { path: '/admin/pedidos-proveedor', label: 'Gerencia · Pedidos proveedor' },
  { path: '/admin/facturas-compra', label: 'Gerencia · Facturas compra' },
  { path: '/admin/abonos-cartera', label: 'Gerencia · Abonos cartera' },
  { path: '/admin/gastos', label: 'Gerencia · Gastos' },
  { path: '/admin/auditorias', label: 'Gerencia · Auditorias' },
  { path: '/admin/informes', label: 'Gerencia · Informes' },
  { path: '/admin', label: 'Gerencia' },
  { path: '/cartera', label: 'Cartera' },
  { path: '/ventas', label: 'Ventas' },
  { path: '/inventario', label: 'Inventario' },
  { path: '/proveedores', label: 'Proveedores' },
  { path: '/facturas', label: 'Facturas' },
  { path: '/gastos', label: 'Gastos' },
  { path: '/fidelizacion', label: 'Fidelización' },
  { path: '/clientes', label: 'Clientes' },
  { path: '/dashboard', label: 'Gerencia' },
];

const MainLayout = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const contentOffsetClass = isCollapsed ? 'md:pl-0' : 'md:pl-[18rem]';
  const currentModule = MODULE_LABELS.find((item) => location.pathname.startsWith(item.path))?.label ?? 'Panel';

  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    document.body.style.overflow = '';
    return undefined;
  }, [isMobileOpen]);

  return (
    <div className="min-h-screen bg-[#fdf1f1]">
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      <div className={`min-h-screen transition-[padding] duration-300 ease-in-out ${contentOffsetClass}`}>
        <header className="sticky top-0 z-20 border-b border-blush-300 bg-blush-50/92 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Abrir menú lateral"
                onClick={() => setIsMobileOpen(true)}
                className="inline-flex items-center justify-center rounded-full border border-blush-300 p-2 text-rosewood hover:bg-blush-50 md:hidden"
              >
                <PanelLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label={isCollapsed ? 'Abrir sidebar' : 'Cerrar sidebar'}
                onClick={() => setIsCollapsed((prev) => !prev)}
                className="hidden items-center justify-center rounded-full border border-blush-300 bg-white px-3 py-2 text-rosewood shadow-sm hover:bg-blush-50 md:inline-flex"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-rosewood sm:text-base">Tienda Angelly</p>
                <p className="text-xs text-[#8b5a5f] sm:text-sm">Sistema de gestion</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-blush-300 bg-white px-3 py-2 text-sm text-rosewood shadow-sm">
                <Shield className="h-4 w-4 text-[#a9646a]" />
                <span className="font-semibold">{user?.username ?? 'Usuario'}</span>
              </div>
              <div className="rounded-xl border border-blush-300 bg-blush-50 px-3 py-2 text-sm font-semibold text-rosewood">
                {currentModule}
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-screen overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
