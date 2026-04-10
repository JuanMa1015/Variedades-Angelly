import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import PrivateRoute from './auth/PrivateRoute';
import { useAuth } from './auth/AuthContext';
import Dashboard from './pages/Dashboard';
import Cartera from './pages/Cartera';
import Gastos from './pages/Gastos';
import Inventario from './pages/Inventario';
import Ventas from './pages/Ventas';
import Proveedores from './pages/Proveedores';
import Facturas from './pages/Facturas';
import Fidelizacion from './pages/Fidelizacion';
import ClientesTienda from './pages/ClientesTienda';
import Login from './pages/Login';
import Admin from './pages/Admin';
import { getDefaultRouteForRole } from './auth/roleRoutes';
import './App.css';

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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout />}>
            <Route element={<PrivateRoute allowedRoles={['superadmin']} />}>
              <Route path="/admin" element={<Admin />} />
              <Route path="/gastos" element={<Gastos />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/facturas" element={<Facturas />} />
            </Route>

            <Route element={<PrivateRoute allowedRoles={['admin', 'superadmin']} />}>
              <Route path="/cartera" element={<Navigate to="/cartera/venta" replace />} />
              <Route path="/cartera/dashboard" element={<Cartera />} />
              <Route path="/cartera/clientes" element={<Cartera />} />
              <Route path="/cartera/venta" element={<Cartera />} />
              <Route path="/cartera/productos" element={<Cartera />} />
              <Route path="/cartera/cobrar" element={<Cartera />} />
            </Route>

            <Route element={<PrivateRoute allowedRoles={['superadmin', 'vendedor']} />}>
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/fidelizacion" element={<Fidelizacion />} />
              <Route path="/ventas" element={<Ventas />} />
              <Route path="/clientes" element={<ClientesTienda />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<LandingRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
