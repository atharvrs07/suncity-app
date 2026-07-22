const TOKEN_KEY = 'sv_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      clearToken();
      window.location.assign('/login');
    }
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

export const fmtMoney = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(`${s.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(`${s.replace(' ', 'T')}Z`); // SQLite datetime('now') is UTC
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

// "HH:MM" (24h) → "9:30 AM". Empty/invalid returns ''. Used for event time slots.
export function fmtTime(s) {
  if (!s || !/^\d{2}:\d{2}$/.test(s)) return '';
  const [h, m] = s.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
