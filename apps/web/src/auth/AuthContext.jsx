/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiPost } from '../api/httpClient';

const TOKEN_STORAGE_KEY = 'angelly.auth.token';
const USER_STORAGE_KEY = 'angelly.auth.user';
const REMEMBER_KEY = 'angelly.auth.remember';
const AuthContext = createContext(null);

const parseTokenPayload = (token) => {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;

    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
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

const getStorage = () => (localStorage.getItem(REMEMBER_KEY) === 'true' ? localStorage : sessionStorage);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const refreshTimerRef = useRef(null);

  const clearAuth = useCallback(() => {
    [localStorage, sessionStorage].forEach((s) => {
      s.removeItem(TOKEN_STORAGE_KEY);
      s.removeItem(USER_STORAGE_KEY);
      s.removeItem(REMEMBER_KEY);
    });
    setToken(null);
    setUser(null);
  }, []);

  const persistAuth = useCallback((nextToken, nextUser, rememberMe) => {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(TOKEN_STORAGE_KEY, nextToken);
    storage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY, 'true');
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const storage = getStorage();
    const storedToken = storage.getItem(TOKEN_STORAGE_KEY);
    const storedUserRaw = storage.getItem(USER_STORAGE_KEY);

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
    } catch {
      clearAuth();
    } finally {
      setBootstrapped(true);
    }
  }, [clearAuth]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAuth();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [clearAuth]);

  const login = useCallback(async ({ username, password, rememberMe }) => {
    const payload = await apiPost('/api/auth/login', { username, password }, { includeAuth: false });

    const nextUser = normalizeUser({
      username: payload.username,
      role: payload.role,
    });

    if (!payload.access_token || !nextUser) {
      throw new Error('Respuesta de autenticación inválida');
    }

    persistAuth(payload.access_token, nextUser, rememberMe);
    return nextUser;
  }, [persistAuth]);

  const logout = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    clearAuth();
  }, [clearAuth]);

  // Auto-refresh: when token is close to expiring, refresh it proactively
  useEffect(() => {
    if (!token) return;

    const payload = parseTokenPayload(token);
    if (!payload || typeof payload.exp !== 'number') return;

    const expirationMs = payload.exp * 1000;
    const now = Date.now();
    const timeUntilExpiry = expirationMs - now;
    const refreshBuffer = 5 * 60 * 1000; // 5 minutes before expiry
    const refreshIn = Math.max(0, timeUntilExpiry - refreshBuffer);

    if (timeUntilExpiry <= 0) {
      const doRefresh = async () => {
        try {
          const payload2 = await apiPost('/api/auth/refresh', {}, { includeAuth: true });
          if (payload2.access_token) {
            persistAuth(payload2.access_token, user);
          }
        } catch {
          clearAuth();
        }
      };
      doRefresh();
      return;
    }

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const payload2 = await apiPost('/api/auth/refresh', {}, { includeAuth: true });
        if (payload2.access_token) {
          persistAuth(payload2.access_token, user);
        }
      } catch {
        // Silently fail; the 401 interceptor will handle it later
      }
    }, refreshIn);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [token, user, persistAuth, clearAuth]);

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
    [token, user, bootstrapped, login, logout],
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
