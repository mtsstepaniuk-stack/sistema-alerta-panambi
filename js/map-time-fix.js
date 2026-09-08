/*
 * Corrige la hora visible en el mapa para que coincida con Argentina.
 *
 * El backend guarda timestamps SQLite en UTC. sensor-map-fix.js actualmente
 * interpreta esos valores sin sufijo como hora local, por lo que en Argentina
 * aparecen tres horas adelantados. Este parche corrige sólo la presentación
 * del popup y mantiene intacta la lógica del mapa.
 */

import { ARGENTINA_TIME_ZONE } from './argentina-time.js';

function argentinaNowTime() {
  return new Date().toLocaleTimeString('es-AR', {
    timeZone: ARGENTINA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function utcClockToArgentina(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const now = new Date();
  const utcDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    Number(match[1]),
    Number(match[2]),
    Number(match[3] || 0),
  ));

  return utcDate.toLocaleTimeString('es-AR', {
    timeZone: ARGENTINA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fixPopupHours() {
  document.querySelectorAll('.sat-live-alert-popup').forEach(popup => {
    Array.from(popup.children).forEach(row => {
      if (row.dataset?.satArgentinaTimeFixed === '1') return;
      const text = String(row.textContent || '').trim();
      if (!text.startsWith('Hora:')) return;

      const formatted = utcClockToArgentina(text);
      if (!formatted) return;

      row.innerHTML = `<b>Hora:</b> ${formatted}`;
      row.dataset.satArgentinaTimeFixed = '1';
    });
  });
}

function fixLiveControls() {
  document.querySelectorAll('[data-live-map-update="1"]').forEach(control => {
    // El control representa el instante de la última actualización. Si otro
    // módulo acaba de escribirlo, lo alineamos con el reloj argentino.
    const current = String(control.textContent || '');
    if (!current.startsWith('En vivo')) return;
    const desired = `En vivo · ${argentinaNowTime()}`;
    if (current !== desired) control.textContent = desired;
  });
}

function applyTimeFixes() {
  fixPopupHours();
  fixLiveControls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyTimeFixes, { once: true });
} else {
  applyTimeFixes();
}

let scheduled = false;
const observer = new MutationObserver(mutations => {
  if (scheduled || !mutations.some(m => m.type === 'childList' || m.type === 'characterData')) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    applyTimeFixes();
  });
});
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

window.addEventListener('sat:navigate', applyTimeFixes);
window.addEventListener('focus', applyTimeFixes);
