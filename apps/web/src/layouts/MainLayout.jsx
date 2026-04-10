import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../auth/AuthContext';

const MainLayout = () => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const canManageAdmin = isAdmin || isSuperAdmin;
  const showQuickNav = isSuperAdmin;
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const contentOffsetClass = isCollapsed ? 'md:pl-20' : 'md:pl-64';

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      <div className={`min-h-screen transition-[padding] duration-300 ease-in-out ${contentOffsetClass}`}>
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Abrir menú lateral"
                onClick={() => setIsMobileOpen(true)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-700 hover:bg-gray-50 md:hidden"
              >
                <PanelLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Tienda Angelly</p>
                <p className="text-sm font-bold text-rosewood">Panel Principal</p>
              </div>
            </div>

            {canManageAdmin && (
              <span className="hidden rounded-full border border-blush-200 bg-blush-100 px-3 py-1 text-xs font-semibold text-rosewood sm:inline-flex">
                {isSuperAdmin ? 'Modo superadmin' : 'Modo administrador'}
              </span>
            )}
          </div>

          {showQuickNav && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <NavLink
                to="/ventas"
                className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-rosewood text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Ventas
              </NavLink>
              <NavLink
                to="/cartera"
                className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-rosewood text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Cartera
              </NavLink>
            </div>
          )}
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
