import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import PrivateRoute from './auth/PrivateRoute';
import { useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import { getDefaultRouteForRole } from './auth/roleRoutes';
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider, useToast } from './components/ToastContext'
import ToastContainer from './components/ToastContainer'
import './App.css';

const Caja = lazy(() => import('./pages/Caja'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Cartera = lazy(() => import('./pages/Cartera'));
const Gastos = lazy(() => import('./pages/Gastos'));
const Inventario = lazy(() => import('./pages/Inventario'));
const Ventas = lazy(() => import('./pages/Ventas'));
const Proveedores = lazy(() => import('./pages/Proveedores'));
const Facturas = lazy(() => import('./pages/Facturas'));
const Fidelizacion = lazy(() => import('./pages/Fidelizacion'));
const ClientesTienda = lazy(() => import('./pages/ClientesTienda'));
const Admin = lazy(() => import('./pages/Admin'));
const VendedoresAdmin = lazy(() => import('./pages/admin/Vendedores'));
const AdminsAdmin = lazy(() => import('./pages/admin/Admins'));
const ProductosAdmin = lazy(() => import('./pages/admin/Productos'));
const ProveedoresAdmin = lazy(() => import('./pages/admin/Proveedores'));
const AuditoriasAdmin = lazy(() => import('./pages/admin/Auditorias'));
const InformesAdmin = lazy(() => import('./pages/admin/Informes'));
const ClientesCartera = lazy(() => import('./pages/admin/ClientesCartera'));
const ClientesTiendaAdmin = lazy(() => import('./pages/admin/ClientesTienda'));
const ClientesFidelizacionAdmin = lazy(() => import('./pages/admin/ClientesFidelizacion'));
const VentasAdmin = lazy(() => import('./pages/admin/VentasAdmin'));
const PedidosProveedor = lazy(() => import('./pages/admin/PedidosProveedor'));
const FacturasCompra = lazy(() => import('./pages/admin/FacturasCompra'));
const GastosAdmin = lazy(() => import('./pages/admin/GastosAdmin'));
const AbonosCartera = lazy(() => import('./pages/admin/AbonosCartera'));

const LandingRedirect = () => {
  const { isAuthenticated, user, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const target = getDefaultRouteForRole(user?.role);
  return <Navigate to={target} replace />;
};

const ToastContainerWrapper = () => {
  const { toasts, removeToast } = useToast();
  return <ToastContainer toasts={toasts} onRemove={removeToast} />;
};

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-[#fdf1f1]">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#eebbbb] border-t-[#6a3f43]" />
                <p className="mt-4 text-sm text-[#6a3f43]/70">Cargando...</p>
              </div>
            </div>
          }>
          <Routes>
            <Route path="/" element={<LandingRedirect />} />
            <Route path="/login" element={<Login />} />

        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout />}>
            <Route element={<PrivateRoute allowedRoles={['superadmin']} />}>
              <Route path="/admin" element={<Navigate to="/admin/vendedores" replace />} />
              <Route path="/admin/admins" element={<AdminsAdmin />} />
              <Route path="/admin/vendedores" element={<VendedoresAdmin />} />
              <Route path="/admin/productos" element={<ProductosAdmin />} />
              <Route path="/admin/clientes-cartera" element={<ClientesCartera />} />
              <Route path="/admin/clientes-tienda" element={<ClientesTiendaAdmin />} />
              <Route path="/admin/clientes-fidelizacion" element={<ClientesFidelizacionAdmin />} />
              <Route path="/admin/ventas" element={<VentasAdmin />} />
              <Route path="/admin/proveedores" element={<ProveedoresAdmin />} />
              <Route path="/admin/pedidos-proveedor" element={<PedidosProveedor />} />
              <Route path="/admin/facturas-compra" element={<FacturasCompra />} />
              <Route path="/admin/gastos" element={<GastosAdmin />} />
              <Route path="/admin/abonos-cartera" element={<AbonosCartera />} />
              <Route path="/admin/auditorias" element={<AuditoriasAdmin />} />
              <Route path="/admin/informes" element={<InformesAdmin />} />
            </Route>

            <Route element={<PrivateRoute allowedRoles={['admin', 'superadmin']} />}>
              <Route path="/cartera" element={<Navigate to="/cartera/venta" replace />} />
              <Route path="/cartera/dashboard" element={<Cartera />} />
              <Route path="/cartera/clientes" element={<Cartera />} />
              <Route path="/cartera/venta" element={<Cartera />} />
              <Route path="/cartera/productos" element={<Cartera />} />
              <Route path="/cartera/cobrar" element={<Cartera />} />
            </Route>

            <Route element={<PrivateRoute allowedRoles={['vendedor', 'superadmin']} />}>
              <Route path="/caja" element={<Caja />} />
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/fidelizacion" element={<Fidelizacion />} />
              <Route path="/ventas" element={<Ventas />} />
              <Route path="/clientes" element={<ClientesTienda />} />
              <Route path="/facturas" element={<Facturas />} />
              <Route path="/gastos" element={<Gastos />} />
              <Route path="/dashboard" element={<Dashboard />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<LandingRedirect />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    <ToastContainerWrapper />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
