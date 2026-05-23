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
import VendedoresAdmin from './pages/admin/Vendedores';
import AdminsAdmin from './pages/admin/Admins';
import ProductosAdmin from './pages/admin/Productos';
import ProveedoresAdmin from './pages/admin/Proveedores';
import AuditoriasAdmin from './pages/admin/Auditorias';
import InformesAdmin from './pages/admin/Informes';
import ClientesCartera from './pages/admin/ClientesCartera';
import ClientesTiendaAdmin from './pages/admin/ClientesTienda';
import ClientesFidelizacionAdmin from './pages/admin/ClientesFidelizacion';
import VentasAdmin from './pages/admin/VentasAdmin';
import PedidosProveedor from './pages/admin/PedidosProveedor';
import FacturasCompra from './pages/admin/FacturasCompra';
import GastosAdmin from './pages/admin/GastosAdmin';
import AbonosCartera from './pages/admin/AbonosCartera';
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
    </BrowserRouter>
  );
}

export default App;
