// Calls the REST API, which allows this site in its CORS_ORIGINS.
import { API_URL } from './config.js';

export async function api(path, { method = 'GET', body, file, signal } = {}) {
  const headers = {};
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (file) {
    headers['Content-Type'] = file.type;
    payload = file;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the server, please check your connection');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('auth:expired'));
    // The API answers errors as { error: { code, message, details? } }
    const message = data.error?.message || (typeof data.error === 'string' ? data.error : '');
    const err = new Error(message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.error?.code;
    err.details = data.error?.details;
    throw err;
  }
  return data;
}

export const query = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  return q.toString() ? `?${q}` : '';
};

// Photos saved locally during development come back as /uploads/..., served by the API.
export const photoUrl = (url) => (url.startsWith('/') ? `${API_URL}${url}` : url);
const currency = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EGP',
  currencyDisplay: 'code',
  minimumFractionDigits: 0,
});
export const money = (n) => currency.format(n);
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);
