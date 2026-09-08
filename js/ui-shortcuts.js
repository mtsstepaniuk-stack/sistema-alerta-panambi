/*
 * Atajos de navegación y acceso rápido de la interfaz.
 * - Enter en los campos del login ejecuta el inicio de sesión.
 * - El logo/nombre SAT de la barra superior vuelve al Panel Principal.
 * - El indicador de alerta de la barra superior abre Validar Alerta.
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

    .screen:not(#s-login) .topbar-status[data-sat-alert-link="1"] {
      cursor: pointer;
      user-select: none;
      transition: transform .14s ease, background .14s ease, border-color .14s ease, box-shadow .14s ease;
    }

    .screen:not(#s-login) .topbar-status[data-sat-alert-link="1"]:hover,
    .screen:not(#s-login) .topbar-status[data-sat-alert-link="1"]:focus-visible {
      transform: translateY(-1px);
      background: rgba(255,255,255,.08);
      border-color: rgba(255,255,255,.26);
      box-shadow: 0 4px 12px rgba(0,0,0,.12);
      outline: none;
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

function isAlertStatus(status) {
  if (!status) return false;
  if (status.id === 'topbar-status-badge') return true;
  return String(status.textContent || '').toUpperCase().includes('ALERTA');
}

function enhanceAlertStatuses() {
  document.querySelectorAll('.screen:not(#s-login) .topbar-status').forEach(status => {
    if (!isAlertStatus(status)) return;
    status.dataset.satAlertLink = '1';
    status.setAttribute('role', 'button');
    status.setAttribute('tabindex', '0');
    status.setAttribute('title', 'Ir a Validar Alerta');
    status.setAttribute('aria-label', 'Ir a Validar Alerta');
  });
}

function goHome() {
  if (typeof window.navigate === 'function') {
    window.navigate('s-dash');
  }
}

function goToValidation() {
  if (typeof window.navigate === 'function') {
    window.navigate('s-validar');
  }
}

function initShortcuts() {
  installStyles();
  enhanceTopbarLogos();
  enhanceAlertStatuses();
}

// Enter en usuario o contraseña equivale a presionar “Ingresar al Sistema”.
// Logo e indicador de alerta también son accesibles con teclado.
document.addEventListener('keydown', event => {
  if (event.repeat) return;

  const target = event.target;
  if (event.key === 'Enter' && (target?.id === 'login-user' || target?.id === 'login-pass')) {
    event.preventDefault();
    if (typeof window.login === 'function') window.login();
    return;
  }

  if (event.key !== 'Enter' && event.key !== ' ') return;

  const status = target?.closest?.('.screen:not(#s-login) .topbar-status[data-sat-alert-link="1"]');
  if (status) {
    event.preventDefault();
    goToValidation();
    return;
  }

  const logo = target?.closest?.('.screen:not(#s-login) .topbar-logo');
  if (logo) {
    event.preventDefault();
    goHome();
  }
});

// Clic en el indicador de alerta: acceso rápido a Validar Alerta.
document.addEventListener('click', event => {
  const status = event.target.closest?.('.screen:not(#s-login) .topbar-status[data-sat-alert-link="1"]');
  if (status) {
    event.preventDefault();
    goToValidation();
    return;
  }

  // Clic en el logo, isotipo, nombre “SAT Inundaciones” o “Panambí, Misiones”.
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
// accesos de forma idempotente para incluir cualquier barra superior nueva.
window.addEventListener('sat:navigate', () => {
  enhanceTopbarLogos();
  enhanceAlertStatuses();
});
