const TOKEN_STORAGE_KEY = 'angelly.auth.token';
const REFRESH_TOKEN_KEY = 'angelly.auth.refresh_token';
const USER_STORAGE_KEY = 'angelly.auth.user';
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

let isRefreshing = false;
let refreshPromise = null;

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const buildUrl = (endpoint) => {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  return `${API_BASE_URL}${endpoint}`;
};

const notifyUnauthorized = () => {
  try {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  } catch {
    // No-op for non-browser contexts.
  }
};

const tryRefreshToken = async () => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const response = await fetch(buildUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
};

const performRequest = async (endpoint, options) => {
  const { method = 'GET', body, headers = {}, signal, includeAuth = true } = options;

  const nextHeaders = { ...headers };

  if (includeAuth) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token && !nextHeaders.Authorization) {
      nextHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const hasJsonBody = body !== undefined;
  if (hasJsonBody && !nextHeaders['Content-Type']) {
    nextHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(buildUrl(endpoint), {
    method,
    headers: nextHeaders,
    body: hasJsonBody ? JSON.stringify(body) : undefined,
    signal,
  });

  const payload = await response.json().catch(() => null);
  return { response, payload };
};

export const apiRequest = async (endpoint, options = {}) => {
  let result = await performRequest(endpoint, options);

  if (result.response.status === 401 && options.includeAuth !== false) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = tryRefreshToken().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    const newToken = await refreshPromise;

    if (newToken) {
      result = await performRequest(endpoint, options);
    }

    if (!newToken || result.response.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      notifyUnauthorized();
    }
  }

  if (!result.response.ok) {
    const message = result.payload?.detail || result.payload?.message || 'No se pudo completar la solicitud';
    throw new ApiError(message, result.response.status, result.payload);
  }

  return result.payload;
};

export const apiGet = (endpoint, options = {}) => apiRequest(endpoint, { ...options, method: 'GET' });
export const apiPost = (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'POST', body });
export const apiPatch = (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'PATCH', body });
export const apiDelete = async (endpoint, options = {}) => {
  await apiRequest(endpoint, { ...options, method: 'DELETE' });
};
