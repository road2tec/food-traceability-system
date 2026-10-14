import axios from 'axios';

export const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:4000/api/v1';
const TOKEN_KEY = 'ft_token';

let memoryToken = null;
let unauthorizedHandler = null;

function safeStorage(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function getToken() {
  if (memoryToken) return memoryToken;
  memoryToken = safeStorage(() => localStorage.getItem(TOKEN_KEY));
  return memoryToken;
}

export function setToken(token) {
  memoryToken = token || null;
  safeStorage(() => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)));
}

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

const api = axios.create({ baseURL: API_URL, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    // A 401 on the login call only means bad credentials; elsewhere the session ended.
    if (status === 401 && !url.includes('/auth/login') && getToken()) {
      setToken(null);
      if (unauthorizedHandler) unauthorizedHandler();
    }
    return Promise.reject(error);
  },
);

/** Unwrap the `{success,data,meta}` envelope. Returns `{data, meta}`. */
export function unwrap(res) {
  const body = res?.data;
  if (body && typeof body === 'object' && 'success' in body) return { data: body.data, meta: body.meta };
  return { data: body, meta: undefined };
}

/** Normalise any thrown value into `{code,message,details,status}`. */
export function parseError(err) {
  const body = err?.response?.data;
  if (body?.error) {
    return {
      code: body.error.code || 'ERROR',
      message: body.error.message || 'Request failed',
      details: body.error.details || [],
      status: err.response.status,
    };
  }
  if (err?.response) {
    return {
      code: 'HTTP_' + err.response.status,
      message: `Request failed (${err.response.status})`,
      details: [],
      status: err.response.status,
    };
  }
  if (err?.code === 'ERR_NETWORK' || err?.request) {
    return {
      code: 'NETWORK',
      message: 'Cannot reach the server. Check your connection and that the API is running.',
      details: [],
      status: 0,
    };
  }
  return { code: 'ERROR', message: err?.message || 'Unexpected error', details: [], status: 0 };
}

export async function get(url, params) {
  return unwrap(await api.get(url, { params }));
}
export async function post(url, body, config) {
  return unwrap(await api.post(url, body, config));
}
export async function put(url, body) {
  return unwrap(await api.put(url, body));
}
export async function patch(url, body) {
  return unwrap(await api.patch(url, body));
}

export default api;
