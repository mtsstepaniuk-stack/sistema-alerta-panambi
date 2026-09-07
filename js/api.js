/**
 * Cliente HTTP simple para consumir el backend local.
 */

const API_BASE = '/api';

/* =====================================================
   INDICADOR GLOBAL DE CARGA
   - Se activa para todas las llamadas internas a /api.
   - Usa un contador para soportar varias peticiones simultáneas.
   - Aparece con una pequeña demora para evitar parpadeos en respuestas rápidas.
===================================================== */
let loadingRequests = 0;
let loadingShowTimer = null;
let loadingHideTimer = null;
let loadingVisibleSince = 0;

const LOADING_SHOW_DELAY = 140;
const LOADING_MIN_VISIBLE = 320;

function ensureLoadingIndicator() {
  if (!document.getElementById('sat-loading-styles')) {
    const style = document.createElement('style');
    style.id = 'sat-loading-styles';
    style.textContent = `
      #sat-network-progress {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        z-index: 5001;
        pointer-events: none;
        opacity: 0;
        overflow: hidden;
        transition: opacity .18s ease;
      }

      #sat-network-progress::after {
        content: '';
        display: block;
        width: 38%;
        height: 100%;
        background: var(--celeste-lt, #5DADE2);
        box-shadow: 0 0 10px rgba(93, 173, 226, .55);
        transform: translateX(-120%);
      }

      #sat-network-progress.visible {
        opacity: 1;
      }

      #sat-network-progress.visible::after {
        animation: sat-progress-slide 1.05s ease-in-out infinite;
      }

      #sat-network-loader {
        position: fixed;
        top: 74px;
        right: 20px;
        z-index: 5000;
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        padding: 9px 14px;
        border: 1px solid var(--gris-border, #DCE3EA);
        border-radius: 12px;
        background: var(--card-bg, #FFFFFF);
        color: var(--texto-base, #213547);
        box-shadow: 0 10px 28px rgba(15, 35, 55, .16);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px) scale(.98);
        transition: opacity .18s ease, transform .18s ease, visibility .18s ease;
      }

      #sat-network-loader.visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }

      .sat-network-spinner {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        border: 2.5px solid rgba(46, 134, 193, .2);
        border-top-color: var(--celeste, #2E86C1);
        border-radius: 50%;
        animation: sat-spinner-rotate .72s linear infinite;
      }

      body.dark-theme #sat-network-loader {
        box-shadow: 0 12px 32px rgba(0, 0, 0, .32);
      }

      @keyframes sat-spinner-rotate {
        to { transform: rotate(360deg); }
      }

      @keyframes sat-progress-slide {
        0% { transform: translateX(-120%); }
        55% { transform: translateX(170%); }
        100% { transform: translateX(300%); }
      }

      @media (max-width: 900px) {
        #sat-network-loader {
          top: 66px;
          right: 12px;
          left: 12px;
          justify-content: center;
          max-width: 420px;
          margin: 0 auto;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #sat-network-progress.visible::after,
        .sat-network-spinner {
          animation: none !important;
        }

        #sat-network-loader,
        #sat-network-progress {
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if (!document.getElementById('sat-network-progress')) {
    const progress = document.createElement('div');
    progress.id = 'sat-network-progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);
  }

  if (!document.getElementById('sat-network-loader')) {
    const loader = document.createElement('div');
    loader.id = 'sat-network-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.setAttribute('aria-atomic', 'true');
    loader.innerHTML = `
      <span class="sat-network-spinner" aria-hidden="true"></span>
      <span id="sat-network-loader-text">Cargando información…</span>
    `;
    document.body.appendChild(loader);
  }
}

function loadingMessage(url, method = 'GET') {
  if (url.pathname.endsWith('/api/auth/login')) return 'Verificando acceso…';
  if (String(method).toUpperCase() === 'GET') return 'Cargando información…';
  return 'Procesando cambios…';
}

function shouldShowLoading(url) {
  // Las consultas periódicas del mapa se ejecutan en segundo plano. No deben
  // mostrar el spinner global cada pocos segundos mientras el operador trabaja.
  if (url.searchParams.get('sat_background') === '1') return false;
  if (url.pathname.endsWith('/api/auth/login')) return true;

  const activeScreen = document.querySelector('.screen.active')?.id;
  return activeScreen !== 's-login';
}

function beginLoading(message) {
  ensureLoadingIndicator();
  loadingRequests += 1;

  const text = document.getElementById('sat-network-loader-text');
  if (text && message) text.textContent = message;

  if (loadingRequests !== 1) return;

  clearTimeout(loadingHideTimer);
  clearTimeout(loadingShowTimer);

  loadingShowTimer = setTimeout(() => {
    if (loadingRequests <= 0) return;
    loadingVisibleSince = Date.now();
    document.getElementById('sat-network-loader')?.classList.add('visible');
    document.getElementById('sat-network-progress')?.classList.add('visible');
  }, LOADING_SHOW_DELAY);
}

function endLoading() {
  loadingRequests = Math.max(0, loadingRequests - 1);
  if (loadingRequests > 0) return;

  clearTimeout(loadingShowTimer);

  const loader = document.getElementById('sat-network-loader');
  const progress = document.getElementById('sat-network-progress');

  if (!loader?.classList.contains('visible')) {
    progress?.classList.remove('visible');
    return;
  }

  const elapsed = Date.now() - loadingVisibleSince;
  const remaining = Math.max(0, LOADING_MIN_VISIBLE - elapsed);

  clearTimeout(loadingHideTimer);
  loadingHideTimer = setTimeout(() => {
    if (loadingRequests > 0) return;
    loader.classList.remove('visible');
    progress?.classList.remove('visible');
  }, remaining);
}

// Algunos módulos usan fetch() directamente en lugar de apiRequest().
// Se protege fetch para que toda llamada interna a /api incluya la sesión
// actual y para centralizar el indicador global de carga.
if (!window.__satAuthFetchInstalled) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    let url;
    try {
      url = new URL(rawUrl, window.location.origin);
    } catch {
      return originalFetch(input, init);
    }

    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      const token = localStorage.getItem('sat-token');
      const headers = new Headers(
        init.headers || (input instanceof Request ? input.headers : undefined)
      );

      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const method = init.method || (input instanceof Request ? input.method : 'GET');
      const visualize = shouldShowLoading(url);

      if (visualize) beginLoading(loadingMessage(url, method));

      try {
        return await originalFetch(input, { ...init, headers });
      } finally {
        if (visualize) endLoading();
      }
    }

    return originalFetch(input, init);
  };
  window.__satAuthFetchInstalled = true;
}

// Complementos que dependen del puente de autenticación instalado arriba.
import('./sensor-map-fix.js?v=20260906-2');
import('./arrival-estimate.js');
import('./admin-account-lock.js');

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

  // Se guarda el token exacto con el que nació esta petición. Esto evita una
  // condición de carrera: una petición vieja puede responder 401 después de
  // que el usuario ya inició sesión y nunca debe borrar la sesión nueva.
  const requestToken = localStorage.getItem('sat-token') || '';

  const headers = {
    'Content-Type': 'application/json',
    ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${requestPath}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && requestPath !== '/auth/login') {
    const currentToken = localStorage.getItem('sat-token') || '';

    // Solo se invalida el navegador si el 401 pertenece a la MISMA sesión
    // que sigue activa. Un 401 de una petición anterior o sin token se ignora
    // para no expulsar al usuario que acaba de iniciar sesión.
    if (requestToken && currentToken === requestToken) {
      clearExpiredSession();
      setTimeout(() => window.navigate?.('s-login'), 0);
    }
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
