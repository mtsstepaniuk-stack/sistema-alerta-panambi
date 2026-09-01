/**
 * Corrección puntual RF14: el flujo "Mantener pendiente" usaba una variable
 * inexistente (`observacion`) al construir el JSON. Este módulo reemplaza el
 * listener del botón por la implementación correcta sin tocar el login.
 */
import { apiRequest } from './api.js';
import { showToast } from './modals.js';

function selectedPendingAlertId() {
  const active = document.querySelector('#validar-alert-list .validation-alert-card.active')
    || document.querySelector('#validar-alert-list .validation-alert-card');
  if (!active) return null;
  const onclick = active.getAttribute('onclick') || '';
  const match = onclick.match(/selectPendingAlert\((\d+)\)/);
  return match ? Number(match[1]) : null;
}

async function keepAlertPendingFixed() {
  const alertId = selectedPendingAlertId();
  const observation = document.getElementById('val-obs')?.value?.trim() || '';

  if (!alertId) {
    showToast('No hay una alerta pendiente seleccionada.', true);
    return;
  }

  if (!observation) {
    showToast('Escriba una observación para mantener la alerta pendiente.', true);
    document.getElementById('val-obs')?.focus();
    return;
  }

  try {
    await apiRequest('/alertas/accion', {
      method: 'POST',
      body: JSON.stringify({
        alertaId: alertId,
        accion: 'Pendiente',
        observacion: observation
      })
    });

    showToast('Alerta mantenida pendiente. Observación registrada.');
    const obs = document.getElementById('val-obs');
    if (obs) obs.value = '';

    await window.renderPendingAlert?.();
    await window.initDashboard?.();
    await window.renderHistory?.();
    await window.renderAlertAudit?.();
  } catch (error) {
    showToast(error.message, true);
  }
}

function installFix() {
  const current = document.getElementById('keep-alert-pending-btn');
  if (!current || current.dataset.rf14Fixed === '1') return;

  // Clonar elimina el listener defectuoso agregado por final-rfs.js.
  const fixed = current.cloneNode(true);
  fixed.dataset.rf14Fixed = '1';
  fixed.addEventListener('click', keepAlertPendingFixed);
  current.replaceWith(fixed);

  window.keepAlertPending = keepAlertPendingFixed;
}

function installTopbarLogo() {
  if (document.getElementById('sat-topbar-logo-style')) return;

  const style = document.createElement('style');
  style.id = 'sat-topbar-logo-style';
  style.textContent = `
    .topbar-logo-icon {
      background: transparent url('assets/sat-panambi-mark.svg') center / contain no-repeat !important;
      border-radius: 0 !important;
      width: 36px !important;
      height: 36px !important;
      flex: 0 0 36px !important;
    }

    .topbar-logo-icon svg {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
  installFix();
  installTopbarLogo();
  // La pantalla de validación puede regenerar controles al navegar.
  const observer = new MutationObserver(installFix);
  observer.observe(document.body, { childList: true, subtree: true });
});
