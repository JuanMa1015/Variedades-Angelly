import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Admin from '../../Admin';
import Gerencia from '../Gerencia';

const http = vi.hoisted(() => ({ apiGet: vi.fn(), apiRequest: vi.fn() }));

vi.mock('../../../api/httpClient', () => ({ apiGet: http.apiGet, apiRequest: http.apiRequest }));
vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));
vi.mock('../auditorias/AuditoriasPantalla', () => ({ default: () => <div>pantalla-auditorias</div> }));
vi.mock('../usuarios/UsuariosPantalla', () => ({ default: ({ tipo }) => <div>pantalla-usuarios-{tipo}</div> }));
vi.mock('../informes/InformesPantalla', () => ({ default: () => <div>pantalla-informes</div> }));

const enRuta = (ruta) => render(
  <MemoryRouter initialEntries={[ruta]}>
    <Routes>
      <Route path="/admin" element={<Gerencia />} />
      <Route path="/admin/:moduleKey" element={<Admin />} />
    </Routes>
  </MemoryRouter>,
);

describe('Gerencia', () => {
  beforeEach(() => {
    http.apiGet.mockReset().mockResolvedValue({});
  });

  it('la portada manda a las pantallas reales y no carga datos ni tablas', () => {
    enRuta('/admin');

    const control = within(screen.getByRole('region', { name: 'Control' }));
    expect(control.getByRole('link', { name: /Vendedores/ })).toHaveAttribute('href', '/admin/vendedores');
    expect(control.getByRole('link', { name: /Auditorías/ })).toHaveAttribute('href', '/admin/auditorias');
    const tienda = within(screen.getByRole('region', { name: 'Tienda' }));
    expect(tienda.getByRole('link', { name: /Caja/ })).toHaveAttribute('href', '/caja');
    expect(tienda.getByRole('link', { name: /Inventario/ })).toHaveAttribute('href', '/inventario');
    const cartera = within(screen.getByRole('region', { name: 'Cartera' }));
    expect(cartera.getByRole('link', { name: /Cobrar/ })).toHaveAttribute('href', '/cartera/cobrar');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(http.apiGet).not.toHaveBeenCalled();
    expect(http.apiRequest).not.toHaveBeenCalled();
  });

  it('cada ruta de gerencia abre su pantalla', () => {
    const casos = [['/admin/vendedores', 'pantalla-usuarios-vendedores'], ['/admin/admins', 'pantalla-usuarios-admins'], ['/admin/auditorias', 'pantalla-auditorias'], ['/admin/informes', 'pantalla-informes']];
    casos.forEach(([ruta, texto]) => {
      const { unmount } = enRuta(ruta);
      expect(screen.getByText(texto)).toBeInTheDocument();
      unmount();
    });
  });

  it('las tablas CRUD viejas ya no existen: esas rutas vuelven a la portada', () => {
    ['/admin/productos', '/admin/gastos', '/admin/ventas', '/admin/abonos-cartera'].forEach((ruta) => {
      const { unmount } = enRuta(ruta);
      expect(screen.getByRole('heading', { name: 'Gerencia' })).toBeInTheDocument();
      unmount();
    });
  });
});
