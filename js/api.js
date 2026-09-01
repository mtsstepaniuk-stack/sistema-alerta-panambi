/**
 * Cliente HTTP simple para consumir el backend local.
 */

const API_BASE = '/api';

// Algunos módulos antiguos del mapa usan fetch() directamente en lugar de
// apiRequest(). Se protege fetch antes de cargarlos para que toda llamada
// interna a /api incluya la sesión actual automáticamente.
if (!window.__satAuthFetchInstalled) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    let url;
    try {
      url = new URL(rawUrl, window.location.origin);
    } catch {
      return originalFetch(input, init);
    }

    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      const token = localStorage.getItem('sat-token');
      if (token) {
        const headers = new Headers(
          init.headers || (input instanceof Request ? input.headers : undefined)
        );
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return originalFetch(input, { ...init, headers });
      }
    }

    return originalFetch(input, init);
  };
  window.__satAuthFetchInstalled = true;
}

// Se cargan después del puente de autenticación para que sus fetch directos
// queden protegidos desde el primer render.
import('./real-map.js');
import('./sensor-map-fix.js');
import('./arrival-estimate.js');

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
  document.body.classList.remove('admin-role', 'technical-role');
  window.refreshFinalRoleVisibility?.();
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
