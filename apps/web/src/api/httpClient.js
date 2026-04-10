const TOKEN_STORAGE_KEY = 'angelly.auth.token';
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

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

export const apiRequest = async (endpoint, options = {}) => {
  const {
    method = 'GET',
    body,
    headers = {},
    signal,
    includeAuth = true,
  } = options;

  const nextHeaders = {
    ...headers,
  };

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

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem('angelly.auth.user');
      notifyUnauthorized();
    }

    const message = payload?.detail || payload?.message || 'No se pudo completar la solicitud';
    throw new ApiError(message, response.status, payload);
  }

  return payload;
};

export const apiGet = (endpoint, options = {}) => apiRequest(endpoint, { ...options, method: 'GET' });
export const apiPost = (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'POST', body });
export const apiPatch = (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'PATCH', body });
export const apiDelete = async (endpoint, options = {}) => {
  await apiRequest(endpoint, { ...options, method: 'DELETE' });
};
