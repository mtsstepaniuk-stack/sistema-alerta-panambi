/*
 * Atajos de navegación y acceso rápido de la interfaz.
 * - Enter en los campos del login ejecuta el inicio de sesión.
 * - El logo/nombre SAT de la barra superior vuelve al Panel Principal.
 * - El antiguo indicador superior de alerta se oculta para simplificar la cabecera.
 */

function installStyles() {
  if (document.getElementById('sat-ui-shortcuts-styles')) return;

  const style = document.createElement('style');
  style.id = 'sat-ui-shortcuts-styles';
  style.textContent = `
    .screen:not(#s-login) .topbar-logo {
      cursor: pointer;
      border-radius: 9px;
      transition: opacity .14s ease, background .14s ease;
    }

    .screen:not(#s-login) .topbar-logo:hover,
    .screen:not(#s-login) .topbar-logo:focus-visible {
      opacity: .92;
      background: rgba(255,255,255,.05);
      outline: none;
    }

    /* El badge de “ALERTA ACTIVA” del encabezado ya no se utiliza. */
    #topbar-status-badge {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

function enhanceTopbarLogos() {
  document.querySelectorAll('.screen:not(#s-login) .topbar-logo').forEach(logo => {
    if (logo.dataset.satHomeLink === '1') return;
    logo.dataset.satHomeLink = '1';
    logo.setAttribute('role', 'link');
    logo.setAttribute('tabindex', '0');
    logo.setAttribute('title', 'Ir al Panel Principal');
    logo.setAttribute('aria-label', 'Ir al Panel Principal');
  });
}

function hideAlertStatuses() {
  document.querySelectorAll('.screen:not(#s-login) .topbar-status').forEach(status => {
    const text = String(status.textContent || '').toUpperCase();
    if (status.id === 'topbar-status-badge' || text.includes('ALERTA ACTIVA')) {
      status.style.setProperty('display', 'none', 'important');
      status.removeAttribute('role');
      status.removeAttribute('tabindex');
      status.removeAttribute('title');
      status.removeAttribute('aria-label');
      delete status.dataset.satAlertLink;
    }
  });
}

function goHome() {
  if (typeof window.navigate === 'function') {
    window.navigate('s-dash');
  }
}

function initShortcuts() {
  installStyles();
  enhanceTopbarLogos();
  hideAlertStatuses();
}

// Enter en usuario o contraseña equivale a presionar “Ingresar al Sistema”.
// El logo superior también es accesible con teclado.
document.addEventListener('keydown', event => {
  if (event.repeat) return;

  const target = event.target;
  if (event.key === 'Enter' && (target?.id === 'login-user' || target?.id === 'login-pass')) {
    event.preventDefault();
    if (typeof window.login === 'function') window.login();
    return;
  }

  if (event.key !== 'Enter' && event.key !== ' ') return;

  const logo = target?.closest?.('.screen:not(#s-login) .topbar-logo');
  if (logo) {
    event.preventDefault();
    goHome();
  }
});

// Clic en el logo, isotipo, nombre “SAT Inundaciones” o “Panambí, Misiones”.
document.addEventListener('click', event => {
  const logo = event.target.closest?.('.screen:not(#s-login) .topbar-logo');
  if (!logo) return;
  event.preventDefault();
  goHome();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShortcuts, { once: true });
} else {
  initShortcuts();
}

// La pantalla Sensores se crea dinámicamente; al navegar reaplicamos los
// ajustes para cualquier barra superior nueva.
window.addEventListener('sat:navigate', () => {
  enhanceTopbarLogos();
  hideAlertStatuses();
});
