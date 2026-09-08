/*
 * Finalización de alertas manuales emitidas.
 *
 * Añade la acción en dos lugares sin modificar el flujo existente:
 * - popup de la alerta manual en el mapa;
 * - registro correspondiente dentro de Historial.
 *
 * Al finalizar, la alerta conserva trazabilidad pero deja de ser activa, por lo
 * que desaparece del mapa en la siguiente actualización inmediata.
 */

import { showToast } from './modals.js';
import { currentUser } from './auth.js';

let activeManualAlerts = [];
let activeLoadPromise = null;
let activeLoadedAt = 0;
const CACHE_MS = 4000;

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function injectStyles() {
  if (document.getElementById('sat-alert-finalization-styles')) return;

  const style = document.createElement('style');
  style.id = 'sat-alert-finalization-styles';
  style.textContent = `
    .sat-alert-finalize-btn {
      border: 0;
      border-radius: 7px;
      background: #c0392b;
      color: #fff;
      font-family: 'Inter', Arial, sans-serif;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      transition: background .14s ease, opacity .14s ease, transform .14s ease;
    }

    .sat-alert-finalize-btn:hover:not(:disabled) {
      background: #a93226;
      transform: translateY(-1px);
    }

    .sat-alert-finalize-btn:disabled {
      opacity: .55;
      cursor: wait;
    }

    .sat-live-alert-popup .sat-alert-finalize-map {
      width: 100%;
      margin-top: 7px;
      padding: 7px 9px;
    }

    #s-historial .sat-alert-finalize-history {
      margin-top: 8px;
      padding: 7px 10px;
      width: fit-content;
    }

    #s-historial .hist-entry .badge.sat-finalized-badge {
      background: rgba(39,174,96,.14) !important;
      color: #27ae60 !important;
    }
  `;
  document.head.appendChild(style);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'No se pudo completar la operación.');
  }
  return data;
}

async function loadActiveManualAlerts(force = false) {
  if (!currentUser()) {
    activeManualAlerts = [];
    return activeManualAlerts;
  }

  const fresh = Date.now() - activeLoadedAt < CACHE_MS;
  if (!force && fresh) return activeManualAlerts;
  if (!force && activeLoadPromise) return activeLoadPromise;

  activeLoadPromise = requestJson('/api/alertas/manuales-activas?sat_background=1')
    .then(data => {
      activeManualAlerts = Array.isArray(data.alertas) ? data.alertas : [];
      activeLoadedAt = Date.now();
      return activeManualAlerts;
    })
    .catch(error => {
      console.warn('[Alertas manuales activas]', error.message);
      return activeManualAlerts;
    })
    .finally(() => {
      activeLoadPromise = null;
    });

  return activeLoadPromise;
}

function popupField(popup, label) {
  const wanted = normalize(label);
  const rows = Array.from(popup.querySelectorAll(':scope > div'));
  const row = rows.find(item => normalize(item.textContent).startsWith(`${wanted}:`));
  if (!row) return '';
  return row.textContent.split(':').slice(1).join(':').trim();
}

function matchPopupAlert(popup) {
  const text = normalize(popup.textContent);
  if (!text.includes('origen: manual') || !text.includes('estado: emitida')) return null;

  const zone = popupField(popup, 'Zona');
  const detail = normalize(popup.querySelector('.sat-alert-detail')?.textContent || '');
  const title = normalize(popup.querySelector('.sat-alert-title')?.textContent || '');

  let candidates = activeManualAlerts.filter(alert => normalize(alert.zona) === normalize(zone));
  if (!candidates.length) return null;

  const messageMatch = candidates.find(alert => {
    const message = normalize(alert.mensaje);
    return message && detail.includes(message);
  });
  if (messageMatch) return messageMatch;

  const riskMatch = candidates.find(alert => title.includes(normalize(alert.riesgo)));
  return riskMatch || candidates[0];
}

function enhanceMapPopup(popup) {
  if (!popup || popup.dataset.satFinalizationReady === '1') return;

  const alert = matchPopupAlert(popup);
  if (!alert) return;

  popup.dataset.satFinalizationReady = '1';
  popup.dataset.satAlertId = String(alert.id);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sat-alert-finalize-btn sat-alert-finalize-map';
  button.textContent = 'Finalizar alerta';
  button.title = 'Marcar la alerta como finalizada y quitarla del mapa activo';
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    finalizeManualAlert(alert, button);
  });

  const historyButton = popup.querySelector('.sat-alert-action');
  if (historyButton) historyButton.before(button);
  else popup.appendChild(button);
}

function styleFinalizedHistoryBadges() {
  document.querySelectorAll('#s-historial .hist-entry .badge').forEach(badge => {
    if (normalize(badge.textContent) !== 'finalizada') return;
    badge.classList.remove('badge-gris', 'badge-celeste', 'badge-rojo', 'badge-naranja');
    badge.classList.add('sat-finalized-badge');
  });
}

function enhanceHistoryButtons() {
  styleFinalizedHistoryBadges();

  const available = [...activeManualAlerts];
  const rows = Array.from(document.querySelectorAll('#s-historial .hist-entry')).filter(row => {
    const type = normalize(row.querySelector('.hist-type-badge')?.textContent || '');
    const badge = normalize(row.querySelector('.badge')?.textContent || '');
    return type === 'alerta manual' && badge === 'emitida';
  });

  rows.forEach(row => {
    if (row.querySelector('.sat-alert-finalize-history')) return;

    const explicitAlertId = Number(row.dataset.alertaId || 0);
    let index = explicitAlertId
      ? available.findIndex(alert => Number(alert.id) === explicitAlertId)
      : -1;

    // Compatibilidad con registros históricos anteriores que todavía no tengan
    // alerta_id vinculado. Los registros nuevos siempre usan el ID exacto.
    if (index < 0 && !explicitAlertId) {
      const rowText = normalize(row.textContent);
      index = available.findIndex(alert => rowText.includes(normalize(alert.zona)));
    }

    if (index < 0) return;

    const alert = available.splice(index, 1)[0];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sat-alert-finalize-btn sat-alert-finalize-history';
    button.textContent = 'Finalizar alerta';
    button.title = `${alert.codigo || `ALT-${String(alert.id).padStart(4, '0')}`} · ${alert.zona}`;
    button.addEventListener('click', () => finalizeManualAlert(alert, button));

    const meta = row.querySelector('.hist-meta') || row;
    meta.appendChild(button);
  });
}

async function refreshEnhancements(force = false) {
  await loadActiveManualAlerts(force);
  document.querySelectorAll('.sat-live-alert-popup').forEach(enhanceMapPopup);
  enhanceHistoryButtons();
}

async function finalizeManualAlert(alert, button) {
  const code = alert.codigo || `ALT-${String(alert.id).padStart(4, '0')}`;
  const confirmed = window.confirm(
    `¿Finalizar ${code} de ${alert.zona}?\n\nDejará de mostrarse como activa en el mapa, pero seguirá registrada en el historial.`
  );
  if (!confirmed) return;

  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = 'Finalizando…';

  try {
    const user = currentUser() || {};
    await requestJson('/api/alertas/finalizar', {
      method: 'POST',
      body: JSON.stringify({
        alertaId: Number(alert.id),
        operador: user.nombre || user.usuario || 'Operador',
      }),
    });

    activeManualAlerts = activeManualAlerts.filter(item => Number(item.id) !== Number(alert.id));
    activeLoadedAt = Date.now();

    document.querySelector('.leaflet-popup-close-button')?.click();
    showToast('Alerta finalizada. Ya no se mostrará como activa en el mapa.');

    try { await window.renderHistory?.(); } catch (_) {}
    try { await window.initDashboard?.(); } catch (_) {}

    // sensor-map-fix.js escucha focus y actualiza inmediatamente las capas.
    window.dispatchEvent(new Event('focus'));
    setTimeout(() => refreshEnhancements(true), 120);
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
    button.textContent = previousText;
  }
}

function startFinalizationEnhancement() {
  injectStyles();
  refreshEnhancements(true);

  window.addEventListener('sat:navigate', () => {
    setTimeout(() => refreshEnhancements(true), 80);
  });

  window.addEventListener('focus', () => refreshEnhancements(true));

  let scheduled = false;
  const observer = new MutationObserver(mutations => {
    if (scheduled || !mutations.some(mutation => mutation.type === 'childList')) return;
    scheduled = true;
    queueMicrotask(async () => {
      scheduled = false;
      await loadActiveManualAlerts(false);
      document.querySelectorAll('.sat-live-alert-popup').forEach(enhanceMapPopup);
      enhanceHistoryButtons();
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startFinalizationEnhancement, { once: true });
} else {
  startFinalizationEnhancement();
}
