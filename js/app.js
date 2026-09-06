/**
 * Main Application Script (ES Module Entrypoint)
 * Imports individual modules and sets up the app initialization.
 */

import { initClock } from './clock.js';
import { initModalsBackdrop } from './modals.js';
import { initContactsListeners } from './contacts.js';
import { initHistoryFilters } from './history.js';
import './dashboard.js';
import { restorePrivateScreen } from './navigation.js';
import './incidents.js';
import './users.js';
import { initThresholds } from './thresholds.js';
import './alerts.js';
import './manual-alert-rf8.js';
import './final-rfs.js';
import './rf14-pending-fix.js?v=20260901-3';
import './rnf1.js';
import './rnf2.js';
import './map-fullwidth.js';
import './mobile-layout.js';
import './numeric-inputs.js';
import { currentUser, refreshUserMenu } from './auth.js';
import { apiRequest } from './api.js';

// Ajustes visuales puntuales del login.
function initLoginPolish() {
  const loginLogo = document.querySelector('#s-login .login-logo');

  // El logo se renderiza como una imagen HTML real, no como background CSS.
  // Así se respeta siempre la proporción completa del PNG.
  if (loginLogo && !document.getElementById('login-sat-logo')) {
    const logoImage = document.createElement('img');
    logoImage.id = 'login-sat-logo';
    logoImage.src = 'assets/sat-panambi-logo-exacto.png?v=3';
    logoImage.alt = 'SAT Panambí - Municipalidad de Panambí';
    loginLogo.prepend(logoImage);
  }

  if (document.getElementById('login-polish-styles')) return;

  const style = document.createElement('style');
  style.id = 'login-polish-styles';
  style.textContent = `
    #s-login {
      padding: 34px 20px !important;
    }

    /* Sin logos institucionales en la parte inferior. */
    #s-login .water-bg {
      display: none !important;
    }

    #s-login .login-logo {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0 !important;
      margin-bottom: 22px !important;
    }

    /* Desactiva completamente el antiguo logo dibujado como pseudo-elemento. */
    #s-login .login-logo::before {
      content: none !important;
      display: none !important;
      background: none !important;
    }

    #s-login #login-sat-logo {
      display: block !important;
      width: min(300px, 76vw) !important;
      height: auto !important;
      max-height: 210px !important;
      object-fit: contain !important;
      object-position: center !important;
      margin: 0 auto 20px !important;
      padding: 0 !important;
      flex: 0 0 auto !important;
      filter: none !important;
    }

    #s-login .login-logo-shield,
    #s-login .login-logo-text h1 {
      display: none !important;
    }

    #s-login .login-logo-text {
      display: block !important;
      width: 100%;
      text-align: center;
    }

    #s-login .login-logo-text p {
      display: block !important;
      margin: 0 !important;
      line-height: 1.35 !important;
    }

    @media (max-width: 640px) {
      #s-login {
        padding: 22px 14px !important;
      }

      #s-login #login-sat-logo {
        width: min(270px, 80vw) !important;
        max-height: 190px !important;
        margin-bottom: 16px !important;
      }

      #s-login .login-logo {
        margin-bottom: 18px !important;
      }
    }
  `;

  document.head.appendChild(style);
}

// Botón de ojo para mostrar/ocultar cualquier campo de contraseña del sistema.
function initPasswordToggles() {
  if (!document.getElementById('password-toggle-styles')) {
    const style = document.createElement('style');
    style.id = 'password-toggle-styles';
    style.textContent = `
      .password-toggle-wrap {
        position: relative;
        width: 100%;
      }

      .password-toggle-wrap > input {
        width: 100%;
        padding-right: 46px !important;
      }

      .password-toggle-btn {
        position: absolute;
        top: 50%;
        right: 8px;
        transform: translateY(-50%);
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--texto-sub);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color .15s ease, color .15s ease;
        z-index: 2;
      }

      .password-toggle-btn:hover,
      .password-toggle-btn:focus-visible {
        background: rgba(46, 134, 193, .10);
        color: var(--azul-mid);
        outline: none;
      }

      #s-login .password-toggle-btn {
        color: rgba(232, 242, 250, .72);
      }

      #s-login .password-toggle-btn:hover,
      #s-login .password-toggle-btn:focus-visible {
        background: rgba(255, 255, 255, .10);
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  const eyeOpen = `
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.8"/>
    </svg>`;

  const eyeClosed = `
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6.5 0 10 6 10 6a17.2 17.2 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1.7 0 3.1-.4 4.4-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;

  const addToggle = (input) => {
    if (!input || input.dataset.passwordToggleReady === '1') return;
    input.dataset.passwordToggleReady = '1';

    const wrapper = document.createElement('div');
    wrapper.className = 'password-toggle-wrap';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle-btn';
    button.setAttribute('aria-label', 'Mostrar contraseña');
    button.setAttribute('title', 'Mostrar contraseña');
    button.innerHTML = eyeOpen;

    button.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.innerHTML = showing ? eyeOpen : eyeClosed;
      const label = showing ? 'Mostrar contraseña' : 'Ocultar contraseña';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    });

    wrapper.appendChild(button);
  };

  document.querySelectorAll('input[type="password"]').forEach(addToggle);

  // Si más adelante se crea otro campo de contraseña dinámicamente, también
  // recibe automáticamente el control sin duplicarlo.
  const observer = new MutationObserver(() => {
    document.querySelectorAll('input[type="password"]:not([data-password-toggle-ready="1"])').forEach(addToggle);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Setup Dark Mode theme switcher
function initThemeSwitcher() {
  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  if (toggleBtns.length === 0) return;

  // Check saved theme or system preference
  const savedTheme = localStorage.getItem('sat-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
  
  if (isDark) {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  updateThemeIcons(isDark);

  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const isDarkNow = document.body.classList.toggle('dark-theme');
      localStorage.setItem('sat-theme', isDarkNow ? 'dark' : 'light');
      updateThemeIcons(isDarkNow);
    });
  });
}

function updateThemeIcons(isDark) {
  document.querySelectorAll('.theme-toggle-btn span').forEach(icon => {
    icon.textContent = isDark ? '☀️' : '🌙';
  });
}

async function restoreSessionAfterRefresh() {
  const savedUser = currentUser();
  const savedToken = localStorage.getItem('sat-token');

  if (!savedUser || !savedToken) {
    refreshUserMenu();
    return false;
  }

  try {
    // Verifica el token sin cargar dashboard/contactos/historial. Si sigue
    // vigente, actualiza los datos del usuario y recupera la última pantalla.
    const data = await apiRequest('/auth/session');
    if (data.user) {
      localStorage.setItem('sat-user', JSON.stringify(data.user));
    }
    refreshUserMenu();
    restorePrivateScreen();
    return true;
  } catch (error) {
    // apiRequest ya limpia una sesión realmente vencida y vuelve al login.
    console.info('No se pudo restaurar la sesión guardada:', error.message);
    refreshUserMenu();
    return false;
  }
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  console.log('SAT Inundaciones - Initializing application modules...');

  // 0. Ajustes visuales del login
  initLoginPolish();
  initPasswordToggles();
  
  // 1. Start Clock
  initClock();

  // 2. Setup Modals Backdrop closing
  initModalsBackdrop();

  // 3. Initialize theme switcher
  initThemeSwitcher();

  // 4. Inicializar listeners que no necesitan consultar datos protegidos.
  initContactsListeners();
  initHistoryFilters();

  // 5. Mientras se valida una sesión guardada, main.css mantiene oculto el
  // login inicial. Al terminar, se revela solamente la pantalla correcta.
  try {
    await restoreSessionAfterRefresh();
  } finally {
    document.body.classList.add('sat-session-resolved');
  }

  // 6. Inicializar configuración de umbrales después de validar la sesión para
  // evitar peticiones protegidas prematuras durante el arranque.
  initThresholds();
  
  console.log('SAT Inundaciones - Application ready.');
});
