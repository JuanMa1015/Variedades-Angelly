import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UsuariosPantalla from '../usuarios/UsuariosPantalla';

const http = vi.hoisted(() => ({ apiGet: vi.fn(), apiRequest: vi.fn() }));
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('../../../api/httpClient', () => ({ apiGet: http.apiGet, apiRequest: http.apiRequest }));
vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));
vi.mock('../../../components/useConfirm', () => ({ default: () => ({ confirm: confirmMock, ConfirmModal: null }) }));
vi.mock('../components/CreateDialogs/CreateVendedorDialog', () => ({
  default: ({ isOpen, onCreated }) => (isOpen ? <button onClick={() => onCreated('Vendedor creado')}>simular-alta</button> : null),
}));
vi.mock('../components/CreateDialogs/CreateAdminDialog', () => ({ default: () => null }));
vi.mock('../../../components/EditFormModal', () => ({
  default: ({ isOpen, title, onSave }) => (isOpen ? (
    <div>
      <span>{title}</span>
      <button onClick={() => onSave({ username: ' nuevo ', password: 'ClaveNueva2026' })}>guardar-edicion</button>
      <button onClick={() => onSave({ username: 'sin_clave', password: '' })}>guardar-sin-clave</button>
    </div>
  ) : null),
}));

const USUARIOS = [
  { id: 1, username: 'ana', rol: 'vendedor', activo: true },
  { id: 2, username: 'bruno', rol: 'vendedor', activo: false },
];

describe('UsuariosPantalla', () => {
  beforeEach(() => {
    http.apiGet.mockReset().mockResolvedValue(USUARIOS);
    http.apiRequest.mockReset().mockResolvedValue({});
    confirmMock.mockReset().mockResolvedValue(true);
  });

  it('muestra cada usuario con su estado y solo ofrece cerrar sesiones a los activos', async () => {
    render(<UsuariosPantalla tipo="vendedores" />);

    expect((await screen.findAllByText('ana')).length).toBeGreaterThan(0);
    expect(http.apiGet).toHaveBeenCalledWith('/api/superadmin/usuarios/vendedores', expect.anything());
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactivo').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Cerrar sesiones' })).toHaveLength(2); // tabla + tarjeta de ana
    expect(screen.getAllByRole('button', { name: 'Reactivar' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /borrar|eliminar/i })).not.toBeInTheDocument();
  });

  it('desactivar pide confirmar y usa DELETE; si no confirma no hace nada', async () => {
    render(<UsuariosPantalla tipo="vendedores" />);
    await screen.findAllByText('ana');

    confirmMock.mockResolvedValueOnce(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(http.apiRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
    await waitFor(() => expect(http.apiRequest).toHaveBeenCalledWith('/api/superadmin/usuarios/vendedores/1', { method: 'DELETE' }));
    expect(await screen.findByText('ana fue desactivado')).toBeInTheDocument();
    expect(http.apiGet).toHaveBeenCalledTimes(2); // recargo la lista
  });

  it('reactivar usa PUT y cerrar sesiones usa POST', async () => {
    render(<UsuariosPantalla tipo="vendedores" />);
    await screen.findAllByText('bruno');

    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivar' })[0]);
    await waitFor(() => expect(http.apiRequest).toHaveBeenCalledWith('/api/superadmin/usuarios/vendedores/2/reactivar', { method: 'PUT' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesiones' })[0]);
    await waitFor(() => expect(http.apiRequest).toHaveBeenCalledWith('/api/superadmin/usuarios/vendedores/1/cerrar-sesiones', { method: 'POST' }));
    expect(await screen.findByText('Se cerraron las sesiones de ana')).toBeInTheDocument();
  });

  it('un error del servidor se muestra y no se da por hecho', async () => {
    http.apiRequest.mockRejectedValueOnce(new Error('No puedes desactivar tu propia cuenta'));
    render(<UsuariosPantalla tipo="admins" />);
    await screen.findAllByText('ana');

    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]);

    expect(await screen.findByText('No puedes desactivar tu propia cuenta')).toBeInTheDocument();
    expect(screen.queryByText('ana fue desactivado')).not.toBeInTheDocument();
    expect(http.apiGet).toHaveBeenCalledWith('/api/superadmin/usuarios/admins', expect.anything());
  });

  it('editar manda la clave solo si se escribio y avisa que cierra sesiones', async () => {
    render(<UsuariosPantalla tipo="vendedores" />);
    await screen.findAllByText('ana');

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    fireEvent.click(screen.getByText('guardar-edicion'));
    await waitFor(() => expect(http.apiRequest).toHaveBeenCalledWith('/api/superadmin/usuarios/vendedores/1', { method: 'PATCH', body: { username: 'nuevo', password: 'ClaveNueva2026' } }));
    expect(await screen.findByText('nuevo fue actualizado y se cerraron sus sesiones')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    fireEvent.click(screen.getByText('guardar-sin-clave'));
    await waitFor(() => expect(http.apiRequest).toHaveBeenCalledWith('/api/superadmin/usuarios/vendedores/1', { method: 'PATCH', body: { username: 'sin_clave' } }));
  });

  it('busca por usuario, avisa si no hay coincidencias y recarga al crear', async () => {
    render(<UsuariosPantalla tipo="vendedores" />);
    await screen.findAllByText('ana');

    fireEvent.change(screen.getByLabelText('Buscar usuario'), { target: { value: 'bru' } });
    expect(screen.queryByText('ana')).not.toBeInTheDocument();
    expect(screen.getAllByText('bruno').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Buscar usuario'), { target: { value: 'zzz' } });
    expect(screen.getByText('Ningún usuario coincide con la búsqueda.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Crear vendedor/ }));
    fireEvent.click(screen.getByText('simular-alta'));
    expect(await screen.findByText('Vendedor creado')).toBeInTheDocument();
    expect(http.apiGet).toHaveBeenCalledTimes(2);
  });
});
