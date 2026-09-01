/**
 * Main Application Script (ES Module Entrypoint)
 * Imports individual modules and sets up the app initialization.
 */

import { initClock } from './clock.js';
import { initModalsBackdrop } from './modals.js';
import { initContactsListeners, renderContacts } from './contacts.js';
import { initHistoryFilters, renderHistory } from './history.js';
import { initDashboard } from './dashboard.js';
import './navigation.js';
import './incidents.js';
import './users.js';
import { initThresholds } from './thresholds.js';
import { renderPendingAlert } from './alerts.js';
import './manual-alert-rf8.js';
import './final-rfs.js';
import './rf14-pending-fix.js?v=20260901-3';
import { refreshUserMenu } from './auth.js';

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

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('SAT Inundaciones - Initializing application modules...');

  // 0. Ajustes visuales del login
  initLoginPolish();
  
  // 1. Start Clock
  initClock();

  // 2. Setup Modals Backdrop closing
  initModalsBackdrop();

  // 3. Initialize theme switcher
  initThemeSwitcher();

  // 4. Setup user dropdown
  refreshUserMenu();

  // 5. Load dashboard data from backend
  initDashboard();

  // 6. Initialize Contacts listeners & initial render
  initContactsListeners();
  renderContacts();

  // 7. Initialize pending alert view
  renderPendingAlert();

  // 8. Initialize History listeners & initial render
  initHistoryFilters();
  renderHistory();

  // 9. Admin threshold configuration
  initThresholds();
  
  console.log('SAT Inundaciones - Application ready.');
});
