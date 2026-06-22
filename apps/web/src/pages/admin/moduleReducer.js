export const INITIAL_STATE = {
  proveedores: [],
  productos: [],
  admins: [],
  vendedores: [],
  clientesCartera: [],
  clientesTienda: [],
  clientesFidelizacion: [],
  ventas: [],
  pedidosProveedor: [],
  facturasCompra: [],
  gastos: [],
  abonosCartera: [],
  auditorias: [],
  informes: {
    ventas_totales: 0,
    facturacion_total: 0,
    vendedor_mas_vendedor: null,
    vendedores_top: [],
    producto_mas_vendido: null,
    producto_menos_vendido: null,
    productos_mas_vendidos: [],
    productos_menos_vendidos: [],
  },
};

const MODULE_MAP = {
  proveedores: 'proveedores',
  productos: 'productos',
  vendedores: 'vendedores',
  admins: 'admins',
  clientes_cartera: 'clientesCartera',
  clientes_tienda: 'clientesTienda',
  clientes_fidelizacion: 'clientesFidelizacion',
  ventas: 'ventas',
  pedidos_proveedor: 'pedidosProveedor',
  facturas_compra: 'facturasCompra',
  gastos: 'gastos',
  abonos_cartera: 'abonosCartera',
  auditorias: 'auditorias',
};

export function moduleReducer(state, action) {
  switch (action.type) {
    case 'SET_MODULE_DATA': {
      const key = MODULE_MAP[action.module];
      if (!key) return state;
      return { ...state, [key]: action.data };
    }
    case 'SET_INFORMES':
      return { ...state, informes: action.data };
    default:
      return state;
  }
}
