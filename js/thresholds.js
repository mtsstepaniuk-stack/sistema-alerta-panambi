/**
 * RF2 + RF18: configuración incremental de umbrales de riesgo.
 * Se inserta dentro de la pantalla de administración ya existente para evitar
 * modificar la estructura general del prototipo estable.
 */
import { apiRequest } from './api.js';
import { currentUser, isAdmin } from './auth.js';
import { showToast } from './modals.js';

let roleObserver = null;
let lastAdminRole = false;

function thresholdCard() {
  return `
    <div class="card" id="threshold-config-card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap;margin-bottom:16px;">
        <div>
          <div class="card-title" style="margin-bottom:5px;">Configuración de umbrales del río</div>
          <div style="font-size:12px;color:var(--texto-sub);line-height:1.5;">
            Estos valores determinan automáticamente cuándo una medición pasa a riesgo Amarillo, Naranja o Rojo.
          </div>
        </div>
        <span class="badge badge-celeste">RF2 · RF18</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:14px;">
        <div class="input-group" style="margin-bottom:0;">
          <label>🟡 Amarillo desde (m)</label>
          <input id="threshold-yellow" type="number" min="0.10" max="20" step="0.01" inputmode="decimal">
        </div>
        <div class="input-group" style="margin-bottom:0;">
          <label>🟠 Naranja desde (m)</label>
          <input id="threshold-orange" type="number" min="0.10" max="20" step="0.01" inputmode="decimal">
        </div>
        <div class="input-group" style="margin-bottom:0;">
          <label>🔴 Rojo desde (m)</label>
          <input id="threshold-red" type="number" min="0.10" max="20" step="0.01" inputmode="decimal">
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:16px;">
        <div id="threshold-updated" style="font-size:11px;color:var(--texto-sub);">Cargando configuración...</div>
        <button type="button" class="btn btn-primary" id="threshold-save-btn">Guardar umbrales</button>
      </div>
    </div>
  `;
}

function ensureThresholdCard() {
  if (document.getElementById('threshold-config-card')) return true;
  const content = document.querySelector('#s-usuarios .content');
  if (!content || !isAdmin()) return false;
  const header = content.querySelector('.page-header');
  if (!header) return false;
  header.insertAdjacentHTML('afterend', thresholdCard());
  document.getElementById('threshold-save-btn')?.addEventListener('click', saveThresholds);
  return true;
}

function formatUpdated(value) {
  if (!value) return 'Valores predeterminados del sistema';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return `Última actualización: ${value}`;
  return `Última actualización: ${date.toLocaleString('es-AR')}`;
}

export async function renderThresholds() {
  if (!isAdmin() || !ensureThresholdCard()) return;
  try {
    const data = await apiRequest('/umbrales');
    const values = data.umbrales || {};
    const yellow = document.getElementById('threshold-yellow');
    const orange = document.getElementById('threshold-orange');
    const red = document.getElementById('threshold-red');
    if (yellow) yellow.value = Number(values.amarillo ?? 5).toFixed(2);
    if (orange) orange.value = Number(values.naranja ?? 6).toFixed(2);
    if (red) red.value = Number(values.rojo ?? 7.2).toFixed(2);
    const updated = document.getElementById('threshold-updated');
    if (updated) updated.textContent = formatUpdated(values.actualizado_en);
  } catch (error) {
    const updated = document.getElementById('threshold-updated');
    if (updated) updated.textContent = 'No se pudo cargar la configuración.';
    console.warn('Umbrales:', error.message);
  }
}

export async function saveThresholds() {
  if (!isAdmin()) {
    showToast('Se requiere usuario administrador para modificar umbrales.', true);
    return;
  }

  const amarillo = Number(document.getElementById('threshold-yellow')?.value);
  const naranja = Number(document.getElementById('threshold-orange')?.value);
  const rojo = Number(document.getElementById('threshold-red')?.value);

  if (![amarillo, naranja, rojo].every(Number.isFinite)) {
    showToast('Complete los tres umbrales con valores numéricos.', true);
    return;
  }
  if (!(amarillo < naranja && naranja < rojo)) {
    showToast('Los valores deben cumplir: Amarillo < Naranja < Rojo.', true);
    return;
  }

  const button = document.getElementById('threshold-save-btn');
  if (button) button.disabled = true;
  try {
    await apiRequest('/umbrales', {
      method: 'PUT',
      body: JSON.stringify({
        amarillo,
        naranja,
        rojo,
        operador: currentUser()?.nombre || 'Administrador'
      })
    });
    showToast('Umbrales actualizados correctamente.');
    await renderThresholds();
    window.initDashboard?.();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

function activateForCurrentRole() {
  if (!isAdmin()) return;
  ensureThresholdCard();
  renderThresholds();
}

export function initThresholds() {
  lastAdminRole = document.body.classList.contains('admin-role');
  activateForCurrentRole();

  // refreshUserMenu() agrega o quita la clase admin-role al iniciar/cerrar sesión.
  // El cambio de tema también modifica las clases del body (dark-theme), por eso
  // solo reaccionamos cuando cambia específicamente el estado de admin-role.
  if (!roleObserver) {
    roleObserver = new MutationObserver(() => {
      const hasAdminRole = document.body.classList.contains('admin-role');
      if (hasAdminRole === lastAdminRole) return;
      lastAdminRole = hasAdminRole;
      if (hasAdminRole) activateForCurrentRole();
    });
    roleObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
}

window.renderThresholds = renderThresholds;
