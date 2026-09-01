/**
 * Cliente HTTP simple para consumir el backend local.
 */
import './real-map.js';
import './sensor-map-fix.js';
import './arrival-estimate.js';

const API_BASE = '/api';

function enrichRecipientRequest(path) {
  if (!String(path).startsWith('/contactos/destinatarios')) return path;

  const riesgo = document.getElementById('emit-riesgo')?.value;
  if (!riesgo || riesgo === 'Seleccionar...') return path;

  const [pathname, query = ''] = String(path).split('?');
  const params = new URLSearchParams(query);
  params.set('riesgo', riesgo);
  return `${pathname}?${params.toString()}`;
}

function clearExpiredSession() {
  localStorage.removeItem('sat-user');
  localStorage.removeItem('sat-token');
  document.body.classList.remove('admin-role');
}

export async function apiRequest(path, options = {}) {
  const requestPath = enrichRecipientRequest(path);
  const token = localStorage.getItem('sat-token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${requestPath}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && requestPath !== '/auth/login') {
    clearExpiredSession();
    setTimeout(() => window.navigate?.('s-login'), 0);
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Error al comunicarse con el servidor.');
  }
  return data;
}

export function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.append(key, value);
  });
  return query.toString() ? `?${query.toString()}` : '';
}
