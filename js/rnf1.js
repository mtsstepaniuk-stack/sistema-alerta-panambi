/**
 * RNF1: comprobación visible del tiempo de generación de alertas automáticas.
 * Se integra sólo en Historial y no modifica el mapa ni otros flujos.
 */
import { apiRequest } from './api.js';
import { currentUser } from './auth.js';

function ensurePanel() {
  const content = document.querySelector('#s-historial .content');
  if (!content) return;

  const summaryGrid = [...content.querySelectorAll('div')].find(el =>
    el.style?.display === 'grid' &&
    el.querySelector(':scope > .card') &&
    [...el.querySelectorAll(':scope > .card .card-title')].some(title => title.textContent.trim() === 'Mediciones')
  );

  if (!summaryGrid) return;

  // RNF1 + los cinco resúmenes deben entrar en el mismo renglón en escritorio.
  summaryGrid.classList.add('history-summary-with-rnf1');
  summaryGrid.style.gridTemplateColumns = 'minmax(300px,1.25fr) repeat(5,minmax(0,1fr))';
  summaryGrid.style.alignItems = 'stretch';

  if (!document.getElementById('rnf1-history-layout-styles')) {
    const style = document.createElement('style');
    style.id = 'rnf1-history-layout-styles';
    style.textContent = `
      /* Mantiene también Acciones registradas en la misma fila aunque history.js
         actualice dinámicamente el grid después de cargar los datos. */
      #s-historial .history-summary-with-rnf1 {
        grid-template-columns: minmax(300px,1.25fr) repeat(5,minmax(0,1fr)) !important;
      }
      #s-historial .history-summary-with-rnf1 > .card {
        min-width: 0;
      }
      #s-historial .history-summary-with-rnf1 > .card:not(#rnf1-status-panel) {
        padding: 12px 10px !important;
      }
      #s-historial .history-summary-with-rnf1 > .card:not(#rnf1-status-panel) .card-title {
        font-size: 10px;
        white-space: nowrap;
      }
      #s-historial #rnf1-status-panel {
        margin-bottom: 0 !important;
        padding: 14px 18px !important;
      }
      @media (max-width: 1250px) {
        #s-historial .history-summary-with-rnf1 {
          grid-template-columns: repeat(2,minmax(0,1fr)) !important;
        }
        #s-historial #rnf1-status-panel {
          grid-column: 1 / -1;
        }
      }
      @media (max-width: 700px) {
        #s-historial .history-summary-with-rnf1 {
          grid-template-columns: 1fr !important;
        }
        #s-historial #rnf1-status-panel {
          grid-column: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  let panel = document.getElementById('rnf1-status-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'rnf1-status-panel';
    panel.className = 'card';
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
    summaryGrid.prepend(panel);
  } else if (panel.parentElement !== summaryGrid) {
    summaryGrid.prepend(panel);
  }
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
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
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
