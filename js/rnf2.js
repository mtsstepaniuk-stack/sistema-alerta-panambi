/**
 * RNF2: verificación de precisión de sensores con error máximo de 5 cm.
 * Se integra únicamente en la pantalla Sensores.
 */
import { apiRequest } from './api.js';
import { currentUser, isAdmin, isTechnical } from './auth.js';
import { showToast, openModal, closeModal } from './modals.js';

let precisionSensors = [];

function canUsePrecision() {
  const user = currentUser();
  return Boolean(user && (isAdmin(user) || isTechnical(user)));
}

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function ensurePrecisionPanel() {
  const content = document.querySelector('#s-sensores .content');
  if (!content || document.getElementById('sensor-precision-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'sensor-precision-panel';
  panel.className = 'card';
  panel.style.cssText = 'margin-bottom:16px;padding:14px 18px;';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
      <div>
        <div class="card-title">Precisión de medición</div>
        <div style="font-size:11px;color:var(--texto-sub);margin-top:3px;">La lectura se contrasta con un nivel de referencia. Error máximo permitido: ±5 cm.</div>
      </div>
      <button type="button" class="btn btn-outline btn-sm" onclick="openPrecisionCheck()">Verificar precisión</button>
    </div>
    <div id="sensor-precision-status" style="margin-top:12px;color:var(--texto-sub);font-size:12px;">Sin verificaciones registradas.</div>
  `;

  const kpis = content.querySelector('.sensor-kpis');
  if (kpis) kpis.before(panel);
  else content.appendChild(panel);
}

function ensurePrecisionModal() {
  if (document.getElementById('m-sensor-precision')) return;
  const modal = document.createElement('div');
  modal.id = 'm-sensor-precision';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:520px;">
      <div class="modal-icon" style="background:#EAF7F6;">📏</div>
      <div class="modal-title">Verificar precisión del sensor</div>
      <div class="modal-desc">Ingresá el nivel obtenido con una referencia de calibración. El sistema lo comparará con la lectura actual.</div>
      <div class="input-group" style="margin-top:16px;">
        <label>Sensor *</label>
        <select id="precision-sensor" onchange="updatePrecisionMeasured()"></select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="input-group">
          <label>Lectura actual</label>
          <input id="precision-measured" type="text" readonly value="—">
        </div>
        <div class="input-group">
          <label>Nivel de referencia (m) *</label>
          <input id="precision-reference" type="number" min="0" max="30" step="0.01" placeholder="Ej. 6.82">
        </div>
      </div>
      <div style="font-size:11px;color:var(--texto-sub);line-height:1.45;">Cumple cuando la diferencia absoluta entre ambos valores es menor o igual a 0,05 m.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" onclick="closeModal('m-sensor-precision')">Cancelar</button>
        <button class="btn btn-primary" type="button" onclick="savePrecisionCheck()">Comprobar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function updatePrecisionMeasured() {
  const id = Number(document.getElementById('precision-sensor')?.value || 0);
  const sensor = precisionSensors.find(item => Number(item.id) === id);
  const measured = document.getElementById('precision-measured');
  const reference = document.getElementById('precision-reference');
  if (!sensor) {
    if (measured) measured.value = '—';
    return;
  }
  const level = sensor.nivel_actual == null ? null : Number(sensor.nivel_actual);
  if (measured) measured.value = level == null ? 'Sin lectura' : `${level.toFixed(2)} m`;
  if (reference && level != null) reference.value = level.toFixed(2);
}

async function renderPrecisionStatus() {
  ensurePrecisionPanel();
  if (!canUsePrecision()) return;
  const host = document.getElementById('sensor-precision-status');
  if (!host) return;

  try {
    const data = await apiRequest('/rnf2-status');
    const r = data.rnf2 || {};
    precisionSensors = (r.sensores || []).filter(sensor => Boolean(sensor.activo));
    const latest = r.ultima_calibracion;

    if (!latest) {
      host.innerHTML = `<span class="badge badge-gris">SIN VERIFICAR</span> <span style="margin-left:8px;">Límite configurado: <strong style="color:var(--texto-base);">${Number(r.limite_error_cm || 5)} cm</strong>.</span>`;
      return;
    }

    const ok = Boolean(latest.cumple);
    const errorCm = Number(latest.error_m || 0) * 100;
    host.innerHTML = `
      <span class="badge ${ok ? 'badge-verde' : 'badge-naranja'}">${ok ? 'CUMPLE' : 'REQUIERE CALIBRACIÓN'}</span>
      <span style="margin-left:8px;"><strong style="color:var(--texto-base);">${esc(latest.sensor_codigo)}</strong> · error ${errorCm.toFixed(1)} cm · referencia ${Number(latest.valor_referencia_m).toFixed(2)} m · medido ${Number(latest.valor_medido_m).toFixed(2)} m · ${formatDateTime(latest.creada_en)}</span>
    `;
  } catch (error) {
    host.innerHTML = `<span style="color:var(--rojo);">${esc(error.message)}</span>`;
  }
}

async function openPrecisionCheck() {
  if (!canUsePrecision()) return;
  ensurePrecisionModal();
  try {
    const data = await apiRequest('/rnf2-status');
    precisionSensors = (data.rnf2?.sensores || []).filter(sensor => Boolean(sensor.activo));
    const select = document.getElementById('precision-sensor');
    if (!select) return;
    select.innerHTML = precisionSensors.map(sensor => `<option value="${Number(sensor.id)}">${esc(sensor.codigo)} — ${esc(sensor.zona)}</option>`).join('');
    if (!precisionSensors.length) {
      showToast('No hay sensores activos para verificar.', true);
      return;
    }
    updatePrecisionMeasured();
    openModal('m-sensor-precision');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function savePrecisionCheck() {
  const id = Number(document.getElementById('precision-sensor')?.value || 0);
  const reference = Number(document.getElementById('precision-reference')?.value);
  if (!id || !Number.isFinite(reference)) {
    showToast('Ingrese un nivel de referencia válido.', true);
    return;
  }

  try {
    const data = await apiRequest(`/sensores/${id}/calibrar`, {
      method: 'POST',
      body: JSON.stringify({ valor_referencia_m: reference })
    });
    closeModal('m-sensor-precision');
    showToast(`${data.resultado}: error ${Number(data.error_cm).toFixed(1)} cm (máximo ${data.limite_cm} cm).`, !data.cumple);
    await renderPrecisionStatus();
    await window.renderHistory?.();
  } catch (error) {
    showToast(error.message, true);
  }
}

function wrapNavigation() {
  if (window.__rnf2NavigateWrapped || typeof window.navigate !== 'function') return;
  const original = window.navigate;
  window.navigate = function rnf2Navigate(id) {
    const result = original(id);
    if (id === 's-sensores') setTimeout(renderPrecisionStatus, 120);
    return result;
  };
  window.__rnf2NavigateWrapped = true;
}

window.openPrecisionCheck = openPrecisionCheck;
window.updatePrecisionMeasured = updatePrecisionMeasured;
window.savePrecisionCheck = savePrecisionCheck;
window.renderPrecisionStatus = renderPrecisionStatus;

function start() {
  ensurePrecisionPanel();
  ensurePrecisionModal();
  wrapNavigation();
  if (canUsePrecision()) renderPrecisionStatus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
