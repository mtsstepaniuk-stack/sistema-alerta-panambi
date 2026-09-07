/*
 * Restricción visual de la cuenta admin de demostración.
 * La validación real también existe en backend; este módulo evita que la opción
 * parezca disponible y explica brevemente el motivo al pasar el mouse.
 */

const LOCKED_USERNAME = 'admin';
const TOOLTIP_TEXT = 'Restringido para la cuenta admin';

function currentUsername() {
  try {
    return String(JSON.parse(localStorage.getItem('sat-user') || 'null')?.usuario || '').toLowerCase();
  } catch {
    return '';
  }
}

function injectStyles() {
  if (document.getElementById('sat-admin-account-lock-styles')) return;

  const style = document.createElement('style');
  style.id = 'sat-admin-account-lock-styles';
  style.textContent = `
    .sat-user-menu-item.sat-password-locked {
      position: relative;
      color: var(--texto-sub) !important;
      opacity: .5;
      cursor: not-allowed !important;
    }

    .sat-user-menu-item.sat-password-locked:hover,
    .sat-user-menu-item.sat-password-locked:focus-visible {
      background: rgba(127,143,160,.08) !important;
      color: var(--texto-sub) !important;
    }

    .sat-user-menu-item.sat-password-locked::after {
      content: attr(data-admin-lock-tooltip);
      position: absolute;
      right: calc(100% + 7px);
      top: 50%;
      z-index: 10;
      max-width: 190px;
      padding: 5px 7px;
      border: 1px solid var(--gris-border);
      border-radius: 6px;
      background: var(--card-bg);
      color: var(--texto-base);
      box-shadow: 0 5px 14px rgba(0,0,0,.18);
      font-size: 9px;
      font-weight: 700;
      line-height: 1.25;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transform: translate(3px, -50%);
      transition: opacity .12s ease, transform .12s ease, visibility .12s ease;
      pointer-events: none;
    }

    .sat-user-menu-item.sat-password-locked:hover::after,
    .sat-user-menu-item.sat-password-locked:focus-visible::after {
      opacity: 1;
      visibility: visible;
      transform: translate(0, -50%);
    }
  `;
  document.head.appendChild(style);
}

function applyLock() {
  injectStyles();
  const locked = currentUsername() === LOCKED_USERNAME;

  document.querySelectorAll('[data-account-action="password"]').forEach(button => {
    button.classList.toggle('sat-password-locked', locked);

    if (locked) {
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('data-admin-lock-tooltip', TOOLTIP_TEXT);
    } else {
      button.removeAttribute('aria-disabled');
      button.removeAttribute('data-admin-lock-tooltip');
    }
  });
}

// Se intercepta en fase de captura para impedir que el handler original abra
// el modal de contraseña cuando la sesión corresponde a la cuenta admin.
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-account-action="password"]');
  if (!button || currentUsername() !== LOCKED_USERNAME) return;

  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyLock, { once: true });
} else {
  applyLock();
}

const observer = new MutationObserver(() => applyLock());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('storage', applyLock);

// Extensión de administración: edición completa de cuentas registradas.
import('./user-management-edit.js?v=20260907-1');

// Visor interno de imágenes de reportes vecinales: evita abrir pestañas nuevas.
import('./attachment-viewer.js?v=20260907-2');
