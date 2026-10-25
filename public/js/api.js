// Shared helpers used by the customer page and the admin page.
const API = {
  token: () => localStorage.getItem('token'),
  user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  setSession(token, user) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); },
  async req(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (API.token()) headers.Authorization = 'Bearer ' + API.token();
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET', headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (opts.raw && res.ok) return res;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && API.token()) API.clear();
      throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status });
    }
    return data;
  },
};
// Escape any text before putting it into HTML (prevents XSS)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = s => String(s).replace(/_/g, ' ');
// Menu image with a fallback if the file is missing
const PLACEHOLDER = '/images/menu/placeholder.svg';
const imgSrc = u => esc(u || PLACEHOLDER);
const imgTag = (u, alt, cls = '') => `<img class="${cls}" src="${imgSrc(u)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">`;
let toastTimer;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
