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
