import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiPost } from '../api/httpClient';

const TOKEN_STORAGE_KEY = 'angelly.auth.token';
const USER_STORAGE_KEY = 'angelly.auth.user';
const AuthContext = createContext(null);

const parseTokenPayload = (token) => {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;

    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
};

const isTokenExpired = (token) => {
  const payload = parseTokenPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;

  const expirationMs = payload.exp * 1000;
  return Date.now() >= expirationMs;
};

const normalizeUser = (rawUser) => {
  if (!rawUser || typeof rawUser !== 'object') return null;
  if (!rawUser.username || !rawUser.role) return null;

  const normalizedRole = String(rawUser.role).toLowerCase();
  const role = ['superadmin', 'admin', 'vendedor'].includes(normalizedRole)
    ? normalizedRole
    : 'vendedor';
  return {
    username: String(rawUser.username),
    role,
  };
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const clearAuth = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  const persistAuth = (nextToken, nextUser) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedUserRaw = localStorage.getItem(USER_STORAGE_KEY);

    if (!storedToken || !storedUserRaw || isTokenExpired(storedToken)) {
      clearAuth();
      setBootstrapped(true);
      return;
    }

    try {
      const parsedUser = normalizeUser(JSON.parse(storedUserRaw));
      if (!parsedUser) {
        clearAuth();
        setBootstrapped(true);
        return;
      }

      setToken(storedToken);
      setUser(parsedUser);
    } catch (error) {
      clearAuth();
    } finally {
      setBootstrapped(true);
    }
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAuth();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = async ({ username, password }) => {
    const payload = await apiPost('/api/auth/login', { username, password }, { includeAuth: false });

    const nextUser = normalizeUser({
      username: payload.username,
      role: payload.role,
    });

    if (!payload.access_token || !nextUser) {
      throw new Error('Respuesta de autenticación inválida');
    }

    persistAuth(payload.access_token, nextUser);
    return nextUser;
  };

  const logout = () => {
    clearAuth();
  };

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user && !isTokenExpired(token)),
      isSuperAdmin: user?.role === 'superadmin',
      isAdmin: user?.role === 'admin',
      bootstrapped,
      login,
      logout,
    }),
    [token, user, bootstrapped],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
