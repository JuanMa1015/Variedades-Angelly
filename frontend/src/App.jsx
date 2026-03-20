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
import Fidelizacion from './pages/Fidelizacion';
import Login from './pages/Login';
import Admin from './pages/Admin';
import './App.css';

const LandingRedirect = () => {
  const { isAuthenticated, user, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const target = user?.role ? '/dashboard' : '/login';
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
            <Route element={<PrivateRoute allowedRoles={['admin']} />}>
              <Route path="/cartera" element={<Cartera />} />
              <Route path="/admin" element={<Admin />} />
            </Route>

            <Route element={<PrivateRoute allowedRoles={['admin', 'vendedor']} />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/fidelizacion" element={<Fidelizacion />} />
              <Route path="/gastos" element={<Gastos />} />
              <Route path="/ventas" element={<Ventas />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<LandingRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
