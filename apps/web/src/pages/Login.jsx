import { useEffect, useState } from 'react';
import { Lock, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getDefaultRouteForRole } from '../auth/roleRoutes';

const Login = () => {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;

    const redirectPath = getDefaultRouteForRole(user?.role);
    navigate(redirectPath, { replace: true });
  }, [isAuthenticated, navigate, user?.role]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError('Debes ingresar usuario y contraseña');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const nextUser = await login({
        username: username.trim(),
        password,
      });

      const fallbackPath = getDefaultRouteForRole(nextUser?.role);
      const targetPath = typeof location.state?.from === 'string' ? location.state.from : fallbackPath;
      navigate(targetPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-white to-blush-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-8 pt-8 pb-6 text-center border-b border-gray-100">
          <p className="text-xs font-semibold tracking-[0.22em] uppercase text-rosewood">Tienda Angelly</p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">Iniciar Sesión</h1>
          <p className="mt-2 text-gray-600">Accede con tu usuario de administrador o vendedor.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2">
              Usuario
            </label>
            <div className="relative">
              <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-rosewood"
                placeholder="Ej: angelly_admin"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-rosewood"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 font-medium text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-rosewood text-white font-bold text-lg hover:bg-opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Validando...' : 'Entrar al Sistema'}
          </button>

          <div className="text-xs text-gray-500 rounded-xl bg-gray-50 px-4 py-3 leading-relaxed">
            Usa tus credenciales autorizadas. Si no las tienes, solicítalas al administrador.
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
