import { Navigate, useParams } from 'react-router-dom';
import AuditoriasPantalla from './admin/auditorias/AuditoriasPantalla';
import InformesPantalla from './admin/informes/InformesPantalla';
import UsuariosPantalla from './admin/usuarios/UsuariosPantalla';

// Gerencia solo tiene pantallas propias para lo que es de gerencia; lo demas se maneja en las pantallas de tienda y cartera.
const Admin = ({ moduleKey: moduleKeyProp }) => {
  const { moduleKey: moduleKeyParam } = useParams();
  const moduleKey = moduleKeyProp ?? moduleKeyParam ?? null;

  if (moduleKey === 'vendedores' || moduleKey === 'admins') return <UsuariosPantalla tipo={moduleKey} />;
  if (moduleKey === 'auditorias') return <AuditoriasPantalla />;
  if (moduleKey === 'informes') return <InformesPantalla />;
  return <Navigate to="/admin" replace />;
};

export default Admin;
