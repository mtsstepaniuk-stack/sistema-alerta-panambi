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
