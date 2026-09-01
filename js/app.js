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
import { refreshUserMenu } from './auth.js';

// Ajustes visuales puntuales del login.
function initLoginPolish() {
  if (document.getElementById('login-polish-styles')) return;

  const style = document.createElement('style');
  style.id = 'login-polish-styles';
  style.textContent = `
    /* Mantiene el degradado inferior y elimina definitivamente los logos UNaM/FI. */
    #s-login {
      padding: 34px 20px !important;
    }

    #s-login .water-bg {
      display: none !important;
    }

    /* Usa exactamente el PNG provisto, sin recrear texto ni colores. */
    #s-login .login-logo {
      flex-direction: column !important;
      gap: 18px !important;
      margin-bottom: 22px !important;
    }

    #s-login .login-logo::before {
      content: '' !important;
      display: block !important;
      width: min(300px, 76vw) !important;
      height: 200px !important;
      margin: 0 auto 10px !important;
      flex: 0 0 auto !important;
      background-image: url('../assets/sat-panambi-logo-exacto.png') !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      background-size: contain !important;
      filter: none !important;
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

      #s-login .login-logo {
        gap: 14px !important;
        margin-bottom: 18px !important;
      }

      #s-login .login-logo::before {
        width: min(270px, 80vw) !important;
        height: 180px !important;
        margin-bottom: 8px !important;
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
