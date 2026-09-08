/*
 * Ajustes visibles de consistencia para la entrega de testing:
 * - horarios de Validar Alerta en hora Argentina;
 * - etiqueta de variación del nivel acorde a mediciones cada 5 minutos.
 */

import { ARGENTINA_TIME_ZONE } from './argentina-time.js';

function parseDisplayedUtc(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const [, day, month, year, hour, minute] = match;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
  ));

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatArgentina(date) {
  return date.toLocaleString('es-AR', {
    timeZone: ARGENTINA_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fixElement(element) {
  if (!element || element.dataset.satArgentinaValidationTime === '1') return;
  const parsed = parseDisplayedUtc(element.textContent);
  if (!parsed) return;
  element.textContent = formatArgentina(parsed);
  element.dataset.satArgentinaValidationTime = '1';
}

function fixMeasurementLabel() {
  const delta = document.querySelector('#s-dash .kpi-card .kpi-delta');
  if (!delta) return;
  const text = String(delta.textContent || '');
  if (text.includes('en 1h')) delta.textContent = text.replace('en 1h', 'en 5 min');
}

function applyConsistencyFixes() {
  document.querySelectorAll('#s-validar .validation-alert-card .alert-item-time').forEach(fixElement);

  document.querySelectorAll('#s-validar .incident-detail-box').forEach(box => {
    const label = box.querySelector('.incident-detail-label');
    if (String(label?.textContent || '').trim().toLowerCase() !== 'fecha y hora') return;
    fixElement(box.querySelector('.incident-detail-value'));
  });

  fixMeasurementLabel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyConsistencyFixes, { once: true });
} else {
  applyConsistencyFixes();
}

let scheduled = false;
const observer = new MutationObserver(mutations => {
  if (scheduled || !mutations.some(m => m.type === 'childList')) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    applyConsistencyFixes();
  });
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('sat:navigate', applyConsistencyFixes);
