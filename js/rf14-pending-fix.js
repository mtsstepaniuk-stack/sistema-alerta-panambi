/**
 * Corrección puntual RF14 y ajuste visual de identidad SAT Panambí.
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

  const fixed = current.cloneNode(true);
  fixed.dataset.rf14Fixed = '1';
  fixed.addEventListener('click', keepAlertPendingFixed);
  current.replaceWith(fixed);

  window.keepAlertPending = keepAlertPendingFixed;
}

function installTopbarLogo() {
  document.querySelectorAll('.topbar-logo-icon').forEach((container) => {
    if (container.dataset.satLogoInstalled === '1') return;

    // Elimina físicamente el escudo SVG anterior; no depende de reglas CSS.
    container.replaceChildren();
    container.dataset.satLogoInstalled = '1';

    const img = document.createElement('img');
    img.src = 'assets/sat-panambi-mark.svg?v=20260901-3';
    img.alt = 'SAT Panambí';
    img.className = 'sat-topbar-mark';
    img.style.cssText = [
      'display:block',
      'width:40px',
      'height:40px',
      'max-width:40px',
      'max-height:40px',
      'object-fit:contain',
      'object-position:center',
      'margin:0',
      'padding:0'
    ].join(';');

    container.style.cssText = [
      'width:40px !important',
      'height:40px !important',
      'min-width:40px !important',
      'flex:0 0 40px !important',
      'display:flex !important',
      'align-items:center !important',
      'justify-content:center !important',
      'background:transparent !important',
      'border-radius:0 !important',
      'overflow:visible !important'
    ].join(';');

    container.appendChild(img);
  });
}

function installAll() {
  installFix();
  installTopbarLogo();
}

// Los módulos se cargan al final del HTML: intentamos de inmediato y también
// mantenemos un observador por si alguna pantalla vuelve a renderizar el header.
installAll();

document.addEventListener('DOMContentLoaded', installAll, { once: true });

const observer = new MutationObserver(installAll);
observer.observe(document.documentElement, { childList: true, subtree: true });
