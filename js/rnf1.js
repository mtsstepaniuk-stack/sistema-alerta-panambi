/**
 * RNF1: comprobación visible del tiempo de generación de alertas automáticas.
 * Se integra sólo en Historial y no modifica el mapa ni otros flujos.
 */
import { apiRequest } from './api.js';
import { currentUser } from './auth.js';

function ensurePanel() {
  const content = document.querySelector('#s-historial .content');
  if (!content || document.getElementById('rnf1-status-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'rnf1-status-panel';
  panel.className = 'card';
  panel.style.cssText = 'margin-bottom:16px;padding:16px 18px;';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <div class="card-title">Tiempo de generación de alertas</div>
        <div style="font-size:11px;color:var(--texto-sub);margin-top:3px;">Control operativo: máximo permitido 5 minutos desde la detección hasta la generación.</div>
      </div>
      <button type="button" class="btn btn-outline btn-sm" onclick="renderRNF1Status()">Actualizar</button>
    </div>
    <div id="rnf1-status-content" style="margin-top:14px;font-size:13px;color:var(--texto-sub);">Iniciá sesión para consultar el estado.</div>
  `;

  const firstCard = content.querySelector('.card');
  if (firstCard) firstCard.before(panel);
  else content.prepend(panel);
}

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function renderRNF1Status() {
  ensurePanel();
  const host = document.getElementById('rnf1-status-content');
  if (!host || !currentUser()) return;

  host.textContent = 'Comprobando...';
  try {
    const data = await apiRequest('/rnf1-status');
    const r = data.rnf1 || {};
    const ok = Boolean(r.cumple_global);
    const max = Number(r.latencia_max_s || 0);
    const total = Number(r.total_alertas_automaticas || 0);
    const cumplen = Number(r.cumplen || 0);

    host.innerHTML = `
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
        <span class="badge ${ok ? 'badge-verde' : 'badge-rojo'}">${ok ? 'CUMPLE' : 'NO CUMPLE'}</span>
        <strong style="color:var(--texto-base);font-size:18px;">${max.toFixed(3)} s</strong>
        <span>latencia máxima registrada</span>
        <span><strong style="color:var(--texto-base);">${cumplen}/${total}</strong> alertas dentro del límite de ${Number(r.limite_segundos || 300)} s</span>
      </div>
      <div style="font-size:11px;color:var(--texto-sub);margin-top:8px;">La medición se obtiene comparando el instante de lectura que detectó el riesgo con la creación de la alerta automática.</div>
    `;
  } catch (error) {
    host.innerHTML = `<span style="color:var(--rojo);">${esc(error.message)}</span>`;
  }
}

window.renderRNF1Status = renderRNF1Status;

function start() {
  ensurePanel();
  if (currentUser()) renderRNF1Status();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

window.addEventListener('sat:navigate', () => {
  ensurePanel();
  if (currentUser()) renderRNF1Status();
});
