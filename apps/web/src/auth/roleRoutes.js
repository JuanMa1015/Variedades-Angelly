export const ROLE_DEFAULT_ROUTES = {
  vendedor: '/ventas',
  admin: '/cartera/venta',
  superadmin: '/admin/vendedores',
};

export const getDefaultRouteForRole = (role) => {
  return ROLE_DEFAULT_ROUTES[role] ?? '/login';
};
