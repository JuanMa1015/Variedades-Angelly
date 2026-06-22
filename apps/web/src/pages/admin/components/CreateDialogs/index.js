import { lazy } from 'react';

export const CreateVendedorDialog = lazy(() => import('./CreateVendedorDialog'));
export const CreateAdminDialog = lazy(() => import('./CreateAdminDialog'));
export const CreateProductoDialog = lazy(() => import('./CreateProductoDialog'));
export const CreateProveedorDialog = lazy(() => import('./CreateProveedorDialog'));
export const CreateAuditoriaDialog = lazy(() => import('./CreateAuditoriaDialog'));
export const CreateClienteCarteraDialog = lazy(() => import('./CreateClienteCarteraDialog'));
export const CreateClienteTiendaDialog = lazy(() => import('./CreateClienteTiendaDialog'));
export const CreateClienteFidelizacionDialog = lazy(() => import('./CreateClienteFidelizacionDialog'));
export const CreateVentaDialog = lazy(() => import('./CreateVentaDialog'));
export const CreatePedidoProveedorDialog = lazy(() => import('./CreatePedidoProveedorDialog'));
export const CreateFacturaCompraDialog = lazy(() => import('./CreateFacturaCompraDialog'));
export const CreateGastoDialog = lazy(() => import('./CreateGastoDialog'));
export const CreateAbonoCarteraDialog = lazy(() => import('./CreateAbonoCarteraDialog'));

export const DIALOG_MAP = {
  vendedores: CreateVendedorDialog,
  admins: CreateAdminDialog,
  productos: CreateProductoDialog,
  proveedores: CreateProveedorDialog,
  auditorias: CreateAuditoriaDialog,
  clientes_cartera: CreateClienteCarteraDialog,
  clientes_tienda: CreateClienteTiendaDialog,
  clientes_fidelizacion: CreateClienteFidelizacionDialog,
  ventas: CreateVentaDialog,
  pedidos_proveedor: CreatePedidoProveedorDialog,
  facturas_compra: CreateFacturaCompraDialog,
  gastos: CreateGastoDialog,
  abonos_cartera: CreateAbonoCarteraDialog,
};
