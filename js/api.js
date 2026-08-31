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

export async function apiRequest(path, options = {}) {
  const requestPath = enrichRecipientRequest(path);
  const response = await fetch(`${API_BASE}${requestPath}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
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
