import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import PrivateRoute from './auth/PrivateRoute';
import { useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import { getDefaultRouteForRole } from './auth/roleRoutes';
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider, useToast } from './components/ToastContext'
import ToastContainer from './components/ToastContainer'
import CookieBanner from './components/CookieBanner'
import usePageTitle from './hooks/usePageTitle'
import { trackPageview } from './utils/analytics'
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
const Privacidad = lazy(() => import('./pages/Privacidad'));
const Terminos = lazy(() => import('./pages/Terminos'));
const Gracias = lazy(() => import('./pages/Gracias'));
const NotFound = lazy(() => import('./pages/NotFound'));

const LandingRedirect = () => {
  usePageTitle();
  const { isAuthenticated, user, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return (
      <div className="flex h-screen items-center justify-center bg-blush-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blush-300 border-t-rosewood" />
          <p className="mt-4 text-sm text-rosewood/70">Inicializando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const target = getDefaultRouteForRole(user?.role);
  return <Navigate to={target} replace />;
};

const ErrorBoundaryWithReset = ({ children }) => {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
};

const ToastContainerWrapper = () => {
  const { toasts, removeToast } = useToast();
  return <ToastContainer toasts={toasts} onRemove={removeToast} />;
};

const spinner = (
  <div className="flex h-screen items-center justify-center bg-blush-50">
    <div className="text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blush-300 border-t-rosewood" />
      <p className="mt-4 text-sm text-rosewood/70">Cargando...</p>
    </div>
  </div>
);

const Titled = ({ title, children }) => {
  usePageTitle(title);
  return children;
};

// Registra pageviews en navegaciones SPA. La vista inicial la cuentan los
// propios scripts de analitica; aqui solo notificamos cambios de ruta.
const PageViewTracker = () => {
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== previousPath.current) {
      previousPath.current = location.pathname;
      trackPageview(location.pathname);
    }
  }, [location.pathname]);

  return null;
};

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <ErrorBoundaryWithReset>
          <PageViewTracker />
          <Suspense fallback={spinner}>
            <Routes>
              <Route path="/" element={<LandingRedirect />} />
              <Route
                path="/login"
                element={
                  <Titled title="Iniciar sesion">
                    <Login />
                  </Titled>
                }
              />

              {/* Rutas publicas (legales / cliente) */}
              <Route path="/privacidad" element={<Privacidad />} />
              <Route path="/terminos" element={<Terminos />} />
              <Route path="/gracias" element={<Gracias />} />
              <Route path="*" element={<NotFound />} />

              <Route element={<PrivateRoute />}>
                <Route element={<MainLayout />}>
                  <Route element={<PrivateRoute allowedRoles={['superadmin']} />}>
                    <Route path="/admin" element={<Navigate to="/admin/vendedores" replace />} />
                    <Route path="/admin/:moduleKey" element={<Admin />} />
                  </Route>

                  <Route element={<PrivateRoute allowedRoles={['admin', 'superadmin']} />}>
                    <Route path="/cartera" element={<Navigate to="/cartera/venta" replace />} />
                    <Route path="/cartera/dashboard" element={<Titled title="Cartera · Dashboard"><Cartera /></Titled>} />
                    <Route path="/cartera/clientes" element={<Titled title="Cartera · Clientes"><Cartera /></Titled>} />
                    <Route path="/cartera/venta" element={<Titled title="Cartera · Venta"><Cartera /></Titled>} />
                    <Route path="/cartera/productos" element={<Titled title="Cartera · Productos"><Cartera /></Titled>} />
                    <Route path="/cartera/cobrar" element={<Titled title="Cartera · Cobros"><Cartera /></Titled>} />
                  </Route>

                  <Route element={<PrivateRoute allowedRoles={['vendedor', 'superadmin']} />}>
                    <Route path="/caja" element={<Titled title="Caja"><Caja /></Titled>} />
                    <Route path="/proveedores" element={<Titled title="Proveedores"><Proveedores /></Titled>} />
                    <Route path="/inventario" element={<Titled title="Inventario"><Inventario /></Titled>} />
                    <Route path="/fidelizacion" element={<Titled title="Fidelización"><Fidelizacion /></Titled>} />
                    <Route path="/ventas" element={<Titled title="Punto de Venta"><Ventas /></Titled>} />
                    <Route path="/clientes" element={<Titled title="Clientes de tienda"><ClientesTienda /></Titled>} />
                    <Route path="/facturas" element={<Titled title="Facturas de compra"><Facturas /></Titled>} />
                    <Route path="/gastos" element={<Titled title="Gastos"><Gastos /></Titled>} />
                    <Route path="/dashboard" element={<Titled title="Dashboard"><Dashboard /></Titled>} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </Suspense>
          <CookieBanner />
          <ToastContainerWrapper />
        </ErrorBoundaryWithReset>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
